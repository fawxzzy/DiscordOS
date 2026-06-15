const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-session-lifecycle-buttons");

const VALID_INPUT = {
  sessionId: "music-lifecycle-1",
  guildId: "1504668396338413670",
  channelId: "1504671871512346695",
  actorDiscordUserId: "1515220075366580224",
};

test("music sesh lifecycle buttons parse guarded args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--session-id",
    "session-1",
    "--allow-storage-write",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.sessionId, "session-1");
  assert.equal(parsed.allowStorageWrite, true);
  assert.equal(parsed.apply, true);
});

test("music sesh lifecycle buttons cover open queue vote lock close without sends", async () => {
  const result = await _internals.buildMusicSeshSessionLifecycleButtons({
    ...VALID_INPUT,
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.routeCount, 5);
  assert.deepEqual(result.actionSequence, [
    "open_session",
    "queue_item",
    "vote",
    "lock_session",
    "close_session",
  ]);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
});

test("music sesh lifecycle buttons execute guarded storage for all routes", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshSessionLifecycleButtons({
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
  assert.equal(calls.length, 5);
});
