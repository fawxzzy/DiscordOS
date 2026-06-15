const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-live-storage-canary");

test("host control live storage canary parses guarded args", () => {
  const parsed = _internals.parseArgs(["--json", "--live", "--allow-storage-write", "--apply"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
  assert.equal(parsed.allowStorageWrite, true);
  assert.equal(parsed.apply, true);
});

test("host control live storage canary previews storage actions without side effects", async () => {
  const result = await _internals.buildMusicSeshHostControlLiveStorageCanary({
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.storageCanary.actionCount, 4);
  assert.equal(result.storageCanary.payloadsParameterized, true);
});

test("host control live storage canary can execute guarded write previews", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshHostControlLiveStorageCanary({
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
  assert.equal(result.storageCanary.executedCount, 4);
  assert.equal(calls.length, 4);
});
