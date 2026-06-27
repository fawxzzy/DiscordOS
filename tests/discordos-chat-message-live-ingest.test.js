const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-chat-message-live-ingest");

const VALID_INPUT = {
  content: "computa music queue Ingest Track",
  sessionId: "music-ingest-1",
  guildId: "1504668396338413670",
  channelId: "1504671871512346695",
  actorDiscordUserId: "1515220075366580224",
};

test("chat message live ingest parses guarded args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--content",
    "computa music status",
    "--allow-ingest",
    "--allow-storage-write",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.allowIngest, true);
  assert.equal(parsed.allowStorageWrite, true);
  assert.equal(parsed.apply, true);
});

test("chat message live ingest defaults to committed Music Sesh ids", () => {
  const parsed = _internals.parseArgs([]);

  assert.equal(parsed.guildId, "1504668396338413670");
  assert.equal(parsed.channelId, "1516089950787862689");
  assert.equal(parsed.actorDiscordUserId, "1515220075366580224");
});

test("chat message live ingest dry run routes without storage", async () => {
  const result = await _internals.buildChatMessageLiveIngest({
    ...VALID_INPUT,
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
});

test("chat message live ingest returns no-mention status response route", async () => {
  const result = await _internals.buildChatMessageLiveIngest({
    ...VALID_INPUT,
    content: "computa music status",
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.listener.status, "chat_message_status_response_ready");
  assert.equal(result.statusResponseRoute.allowedMentionsDisabled, true);
  assert.match(result.userResponse.content, /Music Sesh status:/);
});

test("chat message live ingest blocks partial admission", async () => {
  const result = await _internals.buildChatMessageLiveIngest({
    ...VALID_INPUT,
    allowIngest: true,
    apply: true,
    env: {},
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("chat_message_ingest_double_guard_missing"));
});

test("chat message live ingest executes storage when double guarded", async () => {
  const calls = [];
  const result = await _internals.buildChatMessageLiveIngest({
    ...VALID_INPUT,
    allowIngest: true,
    allowStorageWrite: true,
    apply: true,
    env: {
      DISCORDOS_CHAT_MESSAGE_INGEST: "enabled",
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
