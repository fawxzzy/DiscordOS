const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-write-adapter-guard");

const VALID_INPUT = {
  sessionId: "music-1",
  action: "queue_item",
  guildId: "1504668396338413670",
  channelId: "1504671871512346695",
  actorDiscordUserId: "1515220075366580224",
  itemTitle: "TrackName",
};

test("music sesh write adapter guard parses storage guard flags", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--session-id",
    "music-1",
    "--action",
    "queue_item",
    "--guild-id",
    "1504668396338413670",
    "--channel-id",
    "1504671871512346695",
    "--actor-user-id",
    "1515220075366580224",
    "--item-title",
    "TrackName",
    "--allow-storage-write",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.sessionId, "music-1");
  assert.equal(parsed.allowStorageWrite, true);
  assert.equal(parsed.apply, true);
});

test("music sesh write adapter guard is ready without live write by default", async () => {
  const result = await _internals.buildMusicSeshWriteAdapterGuard({
    ...VALID_INPUT,
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.status, "guard_ready");
  assert.equal(result.adapterStatus, "no_live_no_send_guarded");
  assert.equal(result.storageWritesAllowed, false);
  assert.equal(result.storageWritePreview.rpc, "discordos_upsert_music_sesh_event");
  assert.equal(result.storageWritePayload.session_id, "music-1");
  assert.equal(result.storageWritePayload.actor_fingerprint.length, 24);
});

test("music sesh write adapter guard blocks partial storage admission", async () => {
  const result = await _internals.buildMusicSeshWriteAdapterGuard({
    ...VALID_INPUT,
    allowStorageWrite: true,
    env: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert(result.reasonCodes.includes("storage_write_double_guard_missing"));
});

test("music sesh write adapter guard executes RPC only when applied and configured", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshWriteAdapterGuard({
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
        json: async () => ({ sessionId: "music-1", operation: "upsert" }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.executesStorageWrite, true);
  assert.equal(result.storageWriteResult.status, "written");
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/discordos_upsert_music_sesh_event");
  assert.equal(JSON.parse(calls[0].init.body).payload.session_id, "music-1");
});

test("music sesh write adapter guard renders bounded markdown", async () => {
  const result = await _internals.buildMusicSeshWriteAdapterGuard({
    ...VALID_INPUT,
    env: {},
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Write Adapter Guard"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("executes storage write: `false`"));
  assert(!rendered.includes("SUPABASE_SERVICE_ROLE_KEY="));
});
