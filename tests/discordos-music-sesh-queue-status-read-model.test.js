const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-queue-status-read-model");

test("queue status read model parses live flag", () => {
  const parsed = _internals.parseArgs(["--json", "--live"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
});

test("queue status read model summarizes readback payload", () => {
  const model = _internals.buildQueueStatusReadModel({
    sessionCount: 2,
    queueItemCount: 3,
    voteCount: 1,
    latestSession: {
      session_id: "music-1",
      state: "closed",
    },
    latestQueueItem: {
      item_title: "Track",
    },
    generatedAt: "2026-06-15T05:00:00.000Z",
  });

  assert.equal(model.sessionCount, 2);
  assert.equal(model.queueItemCount, 3);
  assert.equal(model.voteCount, 1);
  assert.equal(model.currentSessionId, "music-1");
  assert.equal(model.currentState, "closed");
  assert.equal(model.latestQueueItemTitle, "Track");
});

test("queue status read model fetches live readback", async () => {
  const result = await _internals.buildMusicSeshQueueStatusReadModel({
    live: true,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        sessionCount: 1,
        queueItemCount: 1,
        voteCount: 1,
        latestSession: { session_id: "music-1", state: "open" },
        latestQueueItem: { item_title: "Track" },
        generatedAt: "2026-06-15T05:00:00.000Z",
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.model.latestQueueItemTitle, "Track");
});
