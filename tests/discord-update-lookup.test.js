const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-update-lookup");

function message({
  id = "1516000000000000000",
  channelId = "1504671871512346695",
  timestamp = "2026-06-13T20:00:00.000000+00:00",
  title = "DiscordOS Runtime Hardening Closed",
} = {}) {
  return {
    id,
    channel_id: channelId,
    timestamp,
    embeds: [
      {
        title,
      },
    ],
  };
}

test("discord update lookup args default to read-only lookup", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    title: null,
    limit: _internals.DEFAULT_LIMIT,
    receiptFile: null,
  });
});

test("discord update lookup args parse title limit receipt and json", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--title",
      "DiscordOS Runtime Hardening Closed",
      "--limit",
      "10",
      "--receipt-file",
      "docs/ops/receipt.md",
    ]),
    {
      json: true,
      title: "DiscordOS Runtime Hardening Closed",
      limit: 10,
      receiptFile: "docs/ops/receipt.md",
    }
  );
});

test("discord update lookup validates limit bounds", () => {
  assert.throws(() => _internals.parseArgs(["--limit", "0"]), /invalid_limit/);
  assert.throws(() => _internals.parseArgs(["--limit", "101"]), /invalid_limit/);
});

test("discord update lookup blocks without DiscordOS target env", async () => {
  const result = await _internals.buildDiscordUpdateLookup({
    title: "DiscordOS Runtime Hardening Closed",
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesReceipt, false);
  assert.deepEqual(result.reasonCodes, ["updates_lookup_target_missing"]);
});

test("discord update lookup fetches messages with bot auth and no content mutation", async () => {
  const result = await _internals.fetchDiscordChannelMessages({
    channelId: "1504671871512346695",
    token: "bot-secret",
    limit: 10,
    fetchImpl: async (url, init) => {
      assert.equal(
        url,
        `${_internals.DISCORD_API_BASE}/channels/1504671871512346695/messages?limit=10`
      );
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Authorization, "Bot bot-secret");
      assert.equal(init.body, undefined);
      return {
        ok: true,
        status: 200,
        json: async () => [message()],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.messages.length, 1);
});

test("discord update lookup finds messages by embed title", () => {
  const messages = [
    message({ id: "older", title: "Other Update" }),
    message({ id: "target", title: "DiscordOS Runtime Hardening Closed" }),
  ];

  assert.equal(
    _internals.findMessageByEmbedTitle(messages, "DiscordOS Runtime Hardening Closed").id,
    "target"
  );
});

test("discord update lookup returns safe message metadata", async () => {
  const result = await _internals.buildDiscordUpdateLookup({
    title: "DiscordOS Runtime Hardening Closed",
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: " 1504671871512346695\n",
      DISCORDOS_BOT_TOKEN: " bot-secret\n",
    },
    fetchImpl: async (url, init) => {
      assert.equal(
        url,
        `${_internals.DISCORD_API_BASE}/channels/1504671871512346695/messages?limit=${_internals.DEFAULT_LIMIT}`
      );
      assert.equal(init.headers.Authorization, "Bot bot-secret");
      return {
        ok: true,
        status: 200,
        json: async () => [
          message({
            id: "1516000000000000000",
          }),
        ],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "found");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesReceipt, false);
  assert.equal(result.message.messageId, "1516000000000000000");
  assert.equal(result.message.channelId, "1504671871512346695");
  assert.equal(result.message.title, "DiscordOS Runtime Hardening Closed");
});

test("discord update lookup reports not found without writing receipt", async () => {
  const result = await _internals.buildDiscordUpdateLookup({
    title: "DiscordOS Runtime Hardening Closed",
    receiptFile: "docs/ops/receipt.md",
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [message({ title: "Other Update" })],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "not_found");
  assert.equal(result.writesReceipt, false);
  assert.deepEqual(result.reasonCodes, ["updates_message_not_found"]);
  assert.deepEqual(result.receipt, {
    requested: true,
    written: false,
    path: "docs/ops/receipt.md",
  });
});

test("discord update lookup writes found publication metadata into receipt", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-update-lookup-"));
  await fs.mkdir(path.join(dir, "docs", "ops"), { recursive: true });
  const receiptPath = path.join(dir, "docs", "ops", "receipt.md");
  await fs.writeFile(receiptPath, "# Receipt\n\nExisting proof.\n", "utf8");

  const result = await _internals.buildDiscordUpdateLookup({
    title: "DiscordOS Runtime Hardening Closed",
    receiptFile: "docs/ops/receipt.md",
    cwd: dir,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [message()],
    }),
  });
  const updated = await fs.readFile(receiptPath, "utf8");

  assert.equal(result.ok, true);
  assert.equal(result.status, "found");
  assert.equal(result.writesReceipt, true);
  assert.deepEqual(result.receipt, {
    requested: true,
    written: true,
    path: "docs/ops/receipt.md",
  });
  assert(updated.includes("## Discord Publication"));
  assert(updated.includes("message id: `1516000000000000000`"));
});

test("discord update lookup reports found receipt write failures", async () => {
  const result = await _internals.buildDiscordUpdateLookup({
    title: "DiscordOS Runtime Hardening Closed",
    receiptFile: "docs/ops/missing.md",
    cwd: await fs.mkdtemp(path.join(os.tmpdir(), "discordos-update-lookup-missing-")),
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [message()],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "found_receipt_write_failed");
  assert.equal(result.sendsMessages, false);
  assert.deepEqual(result.reasonCodes, ["receipt_write_failed"]);
});

test("discord update lookup renders markdown without token values", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesReceipt: true,
    status: "found",
    target: {
      configured: true,
      type: "discord_bot_channel",
    },
    httpStatus: 200,
    searchedMessages: 3,
    reasonCodes: [],
    message: {
      messageId: "1516000000000000000",
      channelId: "1504671871512346695",
      timestamp: "2026-06-13T20:00:00.000000+00:00",
      title: "DiscordOS Runtime Hardening Closed",
    },
    receipt: {
      requested: true,
      written: true,
      path: "docs/ops/receipt.md",
    },
  });

  assert(rendered.includes("# DiscordOS Update Lookup"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("message id: `1516000000000000000`"));
  assert(rendered.includes("receipt written: `true`"));
  assert(!rendered.includes("bot-secret"));
});
