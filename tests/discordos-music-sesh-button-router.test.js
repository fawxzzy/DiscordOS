const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-button-router");

const VALID_INPUT = {
  customId: "music_sesh:queue",
  sessionId: "music-button-1",
  guildId: "1504668396338413670",
  channelId: "1504671871512346695",
  actorDiscordUserId: "1515220075366580224",
};

test("music sesh button router parses button input", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--custom-id",
    "music_sesh:queue",
    "--allow-storage-write",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.customId, "music_sesh:queue");
  assert.equal(parsed.allowStorageWrite, true);
  assert.equal(parsed.apply, true);
});

test("music sesh button router maps buttons into guarded actions without sending", async () => {
  const result = await _internals.buildMusicSeshButtonRouter({
    ...VALID_INPUT,
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.route.action, "queue_item");
  assert.equal(result.executesStorageWrite, false);
});

test("music sesh button router maps skip to a guarded vote", async () => {
  const result = await _internals.buildMusicSeshButtonRouter({
    ...VALID_INPUT,
    customId: "music_sesh:vote_skip",
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.route.action, "vote");
  assert.equal(result.route.voteDirection, "down");
});

test("music sesh button router maps lifecycle controls", async () => {
  const open = await _internals.buildMusicSeshButtonRouter({
    ...VALID_INPUT,
    customId: "music_sesh:open",
    env: {},
  });
  const lock = await _internals.buildMusicSeshButtonRouter({
    ...VALID_INPUT,
    customId: "music_sesh:lock",
    env: {},
  });
  const close = await _internals.buildMusicSeshButtonRouter({
    ...VALID_INPUT,
    customId: "music_sesh:close",
    env: {},
  });

  assert.equal(open.ok, true);
  assert.equal(open.route.action, "open_session");
  assert.equal(lock.ok, true);
  assert.equal(lock.route.action, "lock_session");
  assert.equal(close.ok, true);
  assert.equal(close.route.action, "close_session");
});

test("music sesh button router executes storage when double guarded", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshButtonRouter({
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
  assert.equal(calls.length, 1);
});

test("music sesh button router rejects unknown custom id", async () => {
  const result = await _internals.buildMusicSeshButtonRouter({
    ...VALID_INPUT,
    customId: "unknown",
    env: {},
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("button_custom_id_not_admitted"));
});
