const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/live-transfer-status");

test("live transfer status config fails closed without Supabase edge config", () => {
  assert.deepEqual(_internals.getLiveTransferStatusConfig({}), {
    supabaseUrl: null,
    anonKey: null,
    edgeFunctionUrl: null,
    canCheckLiveTransferStatus: false,
    blockedReasons: ["missing_supabase_url", "missing_supabase_anon_key"],
  });
});

test("live transfer status config builds the edge function URL", () => {
  assert.deepEqual(_internals.getLiveTransferStatusConfig({
    DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co/",
    DISCORDOS_SUPABASE_ANON_KEY: "anon-test-key",
  }), {
    supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co",
    anonKey: "anon-test-key",
    edgeFunctionUrl: "https://nwexsktuuenfdegzrbut.supabase.co/functions/v1/discordos-live-transfer-status",
    canCheckLiveTransferStatus: true,
    blockedReasons: [],
  });
});

test("live transfer status invokes the edge reader with anon authorization", async () => {
  const calls = [];
  const result = await _internals.invokeEdgeLiveTransferStatus({
    supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co/",
    anonKey: "anon-test-key",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            liveSignedTransferReady: false,
            humanNonProofFitnessLiveTransferCount: 0,
          };
        },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.payload.liveSignedTransferReady, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://nwexsktuuenfdegzrbut.supabase.co/functions/v1/discordos-live-transfer-status");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.apikey, "anon-test-key");
  assert.equal(calls[0].init.headers.Authorization, "Bearer anon-test-key");
});

test("live transfer status reports edge reader failures without secret values", async () => {
  const result = await _internals.invokeEdgeLiveTransferStatus({
    supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co",
    anonKey: "anon-test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      async json() {
        return {
          ok: false,
          error: "STATUS_QUERY_FAILED",
        };
      },
    }),
  });

  assert.deepEqual(result, {
    ok: false,
    status: 502,
    code: "STATUS_QUERY_FAILED",
    payload: {
      ok: false,
      error: "STATUS_QUERY_FAILED",
    },
  });
});
