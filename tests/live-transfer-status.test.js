const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/live-transfer-status");

test("live transfer status config fails closed without Supabase edge config", () => {
  const config = _internals.getLiveTransferStatusConfig({});
  assert.equal(config.canCheckLiveTransferStatus, false);
  assert.equal(config.transport, "none");
  assert.deepEqual(config.blockedReasons, ["missing_supabase_url", "missing_supabase_project_ref"]);
});

test("live transfer status config builds the edge function URL", () => {
  const config = _internals.getLiveTransferStatusConfig({
    DISCORDOS_SUPABASE_PROJECT_REF: "nwexsktuuenfdegzrbut",
    DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co/",
    DISCORDOS_SUPABASE_ANON_KEY: "anon-test-key",
  });
  assert.equal(config.edgeFunctionUrl, "https://nwexsktuuenfdegzrbut.supabase.co/functions/v1/discordos-live-transfer-status");
  assert.equal(config.canCheckLiveTransferStatus, true);
  assert.equal(config.transport, "legacy_edge_fallback");
  assert.deepEqual(config.blockedReasons, []);
});

test("live transfer status uses the direct service-role RPC for master", async () => {
  const secret = `sb_secret_${"s".repeat(32)}`;
  const config = _internals.getLiveTransferStatusConfig({
    DISCORDOS_SUPABASE_PROJECT_REF: "bxtcuhkotumitoqtrcej",
    DISCORDOS_SUPABASE_URL: "https://bxtcuhkotumitoqtrcej.supabase.co/",
    DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: secret,
    DISCORDOS_SUPABASE_ANON_KEY: `sb_publishable_${"p".repeat(32)}`,
  });
  const calls = [];
  const result = await _internals.invokeLiveTransferStatus(config, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() { return { liveSignedTransferReady: true }; },
      };
    },
  });

  assert.equal(config.transport, "direct_service_role_rpc");
  assert.equal(result.ok, true);
  assert.equal(result.transport, "direct_service_role_rpc");
  assert.equal(calls[0].url, "https://bxtcuhkotumitoqtrcej.supabase.co/rest/v1/rpc/discordos_get_live_transfer_status");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, secret);
  assert.equal("Authorization" in calls[0].init.headers, false);
  assert.equal(calls[0].init.body, "{}");
});

test("live transfer status rejects a master Edge-only configuration", () => {
  const config = _internals.getLiveTransferStatusConfig({
    DISCORDOS_SUPABASE_PROJECT_REF: "bxtcuhkotumitoqtrcej",
    DISCORDOS_SUPABASE_URL: "https://bxtcuhkotumitoqtrcej.supabase.co",
    DISCORDOS_SUPABASE_ANON_KEY: `sb_publishable_${"p".repeat(32)}`,
  });
  assert.equal(config.canCheckLiveTransferStatus, false);
  assert.equal(config.transport, "none");
  assert.deepEqual(config.blockedReasons, ["master_direct_service_role_required"]);
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

test("live transfer status sends a modern publishable key as apikey only", async () => {
  const calls = [];
  const publishableKey = `sb_publishable_${"p".repeat(32)}`;
  const result = await _internals.invokeEdgeLiveTransferStatus({
    supabaseUrl: "https://bxtcuhkotumitoqtrcej.supabase.co/",
    anonKey: publishableKey,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, liveSignedTransferReady: true };
        },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.apikey, publishableKey);
  assert.equal("Authorization" in calls[0].init.headers, false);
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
