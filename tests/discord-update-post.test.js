const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-update-post");

test("discord update post args default to dry-run publication", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    title: null,
    body: null,
    bodyFile: null,
    bodySection: null,
    apply: false,
  });
});

test("discord update post args parse title body file section and apply", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--title",
      "Runtime hardening closed",
      "--body-file",
      "docs/ops/post.md",
      "--body-section",
      "Update Post",
      "--apply",
    ]),
    {
      json: true,
      title: "Runtime hardening closed",
      body: null,
      bodyFile: "docs/ops/post.md",
      bodySection: "Update Post",
      apply: true,
    }
  );
});

test("discord update post extracts a named markdown section", () => {
  const markdown = [
    "# Receipt",
    "",
    "intro",
    "",
    "## Update Post",
    "",
    "Published body.",
    "",
    "### Detail",
    "",
    "- proof",
    "",
    "## Durable Receipts",
    "",
    "- internal",
  ].join("\n");

  assert.equal(
    _internals.extractMarkdownSection(markdown, "Update Post"),
    ["Published body.", "", "### Detail", "", "- proof"].join("\n")
  );
});

test("discord update post payload is green embed with mentions disabled", () => {
  const payload = _internals.buildDiscordUpdatePayload({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
  });

  assert.equal(payload.content, "");
  assert.equal(payload.embeds[0].title, "Runtime hardening closed");
  assert.equal(payload.embeds[0].description, "DiscordOS runtime hardening is closed.");
  assert.equal(payload.embeds[0].color, _internals.UPDATE_EMBED_COLOR);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test("discord update post dry-run does not require target env and previews payload", async () => {
  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "dry_run");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.target.type, "none");
  assert.equal(result.payloadPreview.embeds[0].title, "Runtime hardening closed");
});

test("discord update post apply blocks without DiscordOS target env", async () => {
  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    apply: true,
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.sendsMessages, false);
  assert.deepEqual(result.reasonCodes, ["updates_target_missing"]);
});

test("discord update post sends bot-channel payload with DiscordOS env only", async () => {
  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    apply: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: " 123\n",
      DISCORDOS_BOT_TOKEN: " bot-secret\n",
      DISCORD_UPDATES_CHANNEL_ID: "fitness-channel",
      DISCORD_BOT_TOKEN: "fitness-token",
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, `${_internals.DISCORD_API_BASE}/channels/123/messages`);
      assert.equal(init.headers.Authorization, "Bot bot-secret");
      const parsed = JSON.parse(init.body);
      assert.equal(parsed.content, "");
      assert.equal(parsed.embeds[0].title, "Runtime hardening closed");
      assert.deepEqual(parsed.allowed_mentions, { parse: [] });
      return {
        ok: true,
        status: 200,
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "sent");
  assert.equal(result.sendsMessages, true);
  assert.equal(result.httpStatus, 200);
});

test("discord update post resolves body-file sections from repo-relative paths", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-update-post-"));
  await fs.mkdir(path.join(dir, "docs", "ops"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "docs", "ops", "post.md"),
    ["# Receipt", "", "## Update Post", "", "Public update.", "", "## Internal", "", "Receipt."].join("\n"),
    "utf8"
  );

  const body = await _internals.resolveBody({
    bodyFile: "docs/ops/post.md",
    bodySection: "Update Post",
    cwd: dir,
  });

  assert.equal(body, "Public update.");
});

test("discord update post renders markdown without target values", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    status: "dry_run",
    target: {
      configured: true,
      type: "discord_bot_channel",
    },
    reasonCodes: ["apply_flag_not_set"],
    payloadPreview: {
      embeds: [
        {
          title: "Runtime hardening closed",
          description: "Public update.",
        },
      ],
    },
  });

  assert(rendered.includes("# DiscordOS Update Post"));
  assert(rendered.includes("status: `dry_run`"));
  assert(!rendered.includes("bot-secret"));
  assert(!rendered.includes("123"));
});
