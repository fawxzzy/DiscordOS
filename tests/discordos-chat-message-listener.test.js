const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-chat-message-listener");

const VALID_INPUT = {
  content: "computa music queue Track Name",
  sessionId: "music-chat-1",
  guildId: "1504668396338413670",
  channelId: "1504671871512346695",
  actorDiscordUserId: "1515220075366580224",
};

test("chat message listener parses bot and storage flags", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--content",
    "computa music status",
    "--author-bot",
    "--item-title",
    "Existing Track",
    "--allow-storage-write",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.authorBot, true);
  assert.equal(parsed.itemTitle, "Existing Track");
  assert.equal(parsed.allowStorageWrite, true);
  assert.equal(parsed.apply, true);
});

test("chat message listener ignores bot authors", async () => {
  const result = await _internals.buildChatMessageListener({
    ...VALID_INPUT,
    authorBot: true,
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ignored_bot_author");
  assert.equal(result.executesStorageWrite, false);
});

test("chat message listener routes computa music queue without sending", async () => {
  const result = await _internals.buildChatMessageListener({
    ...VALID_INPUT,
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.intake.action, "queue_item");
  assert.equal(result.executesStorageWrite, false);
});

test("chat message listener routes computa music skip to vote", async () => {
  const result = await _internals.buildChatMessageListener({
    ...VALID_INPUT,
    content: "computa music skip",
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.intake.action, "vote_skip");
});

test("chat message listener executes storage when double guarded", async () => {
  const calls = [];
  const result = await _internals.buildChatMessageListener({
    ...VALID_INPUT,
    allowStorageWrite: true,
    apply: true,
    env: {
      DISCORDOS_MUSIC_SESH_WRITE_ADAPTER: "enabled",
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.executesStorageWrite, true);
  assert.equal(JSON.parse(calls[0].init.body).payload.action, "queue_item");
});
