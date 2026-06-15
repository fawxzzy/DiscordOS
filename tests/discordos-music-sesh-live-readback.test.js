const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-live-readback");

test("music sesh live readback parses live flag", () => {
  const parsed = _internals.parseArgs(["--json", "--live"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
});

test("music sesh live readback is ready without live fetch by default", async () => {
  const result = await _internals.buildMusicSeshLiveReadback();

  assert.equal(result.ok, true);
  assert.equal(result.liveAttempted, false);
  assert.equal(result.status, "ready_for_live_readback");
  assert.equal(result.summary.sessionCount, 0);
});

test("music sesh live readback fetches service-role RPC when live", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshLiveReadback({
    live: true,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sessionCount: 1,
          queueItemCount: 2,
          voteCount: 3,
          latestSession: { sessionId: "music-1" },
          latestQueueItem: { queueItemId: "music-1:track" },
          generatedAt: "2026-06-15T03:30:00Z",
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.liveAttempted, true);
  assert.equal(result.status, "readback_loaded");
  assert.equal(result.summary.sessionCount, 1);
  assert.equal(result.summary.queueItemCount, 2);
  assert.equal(result.summary.voteCount, 3);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/discordos_get_music_sesh_readback");
});

test("music sesh live readback can use edge RPC bridge", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshLiveReadback({
    live: true,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_ANON_KEY: "anon-key",
      DISCORDOS_SUPABASE_WORKFLOW_RPC_EDGE: "enabled",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          payload: {
            sessionCount: 4,
            queueItemCount: 5,
            voteCount: 6,
            generatedAt: "2026-06-15T03:31:00Z",
          },
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.sessionCount, 4);
  assert.equal(calls[0].url, "https://example.supabase.co/functions/v1/discordos-product-workflow-rpc");
  assert.equal(JSON.parse(calls[0].init.body).rpc, "discordos_get_music_sesh_readback");
});

test("music sesh live readback renders bounded markdown", async () => {
  const result = await _internals.buildMusicSeshLiveReadback();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Live Readback"));
  assert(rendered.includes("sends messages: `false`"));
  assert(!rendered.includes("SUPABASE_SERVICE_ROLE_KEY="));
});
