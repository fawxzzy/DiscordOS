const assert = require("node:assert/strict");
const test = require("node:test");

const liveTransferStatus = require("../api/live-transfer-status");
const { _internals } = liveTransferStatus;

test("public live-transfer projection excludes row metadata and rejects missing readiness", () => {
  const source = {
    liveSignedTransferReady: true,
    fitnessLiveTransferCount: 2,
    humanNonProofFitnessLiveTransferCount: 1,
    latestTransferRow: {
      reporter_discord_user_id: "private-discord-id",
      report_id: "private-report-id",
    },
  };
  assert.deepEqual(_internals.publicLiveTransferStatus(source), {
    liveSignedTransferReady: true,
    fitnessLiveTransferCount: 2,
    humanNonProofFitnessLiveTransferCount: 1,
  });
  assert.equal(_internals.publicLiveTransferStatus({ latestTransferRow: source.latestTransferRow }), null);
});

test("public live-transfer route never forwards private RPC rows on either transport", async () => {
  const names = [
    "DISCORDOS_SUPABASE_PROJECT_REF",
    "DISCORDOS_SUPABASE_URL",
    "DISCORDOS_SUPABASE_SERVICE_ROLE_KEY",
    "DISCORDOS_SUPABASE_ANON_KEY",
  ];
  const prior = new Map(names.map((name) => [name, process.env[name]]));
  const priorFetch = global.fetch;
  const response = () => ({
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  });
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          liveSignedTransferReady: true,
          fitnessLiveTransferCount: 2,
          latestTransferRow: {
            reporter_discord_user_id: "private-discord-id",
            report_id: "private-report-id",
          },
        };
      },
    });
    for (const [projectRef, transport] of [
      ["bxtcuhkotumitoqtrcej", "direct_service_role_rpc"],
      ["nwexsktuuenfdegzrbut", "legacy_edge_fallback"],
    ]) {
      process.env.DISCORDOS_SUPABASE_PROJECT_REF = projectRef;
      process.env.DISCORDOS_SUPABASE_URL = `https://${projectRef}.supabase.co`;
      if (transport === "direct_service_role_rpc") {
        process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY = `sb_secret_${"s".repeat(32)}`;
        delete process.env.DISCORDOS_SUPABASE_ANON_KEY;
      } else {
        delete process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY;
        process.env.DISCORDOS_SUPABASE_ANON_KEY = "synthetic-anon-key";
      }
      const result = await liveTransferStatus({ method: "GET" }, response());
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.statusRuntime, transport);
      assert.deepEqual(result.body.status, {
        liveSignedTransferReady: true,
        fitnessLiveTransferCount: 2,
      });
      assert.equal(JSON.stringify(result.body).includes("private-discord-id"), false);
      assert.equal(JSON.stringify(result.body).includes("private-report-id"), false);
      if (transport === "legacy_edge_fallback") {
        assert.deepEqual(result.body.edge, result.body.status);
      }
    }
  } finally {
    global.fetch = priorFetch;
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

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

test("live transfer probe rejects malformed success bodies on both transports", async () => {
  for (const projectRef of ["bxtcuhkotumitoqtrcej", "nwexsktuuenfdegzrbut"]) {
    const config = _internals.getLiveTransferStatusConfig({
      DISCORDOS_SUPABASE_PROJECT_REF: projectRef,
      DISCORDOS_SUPABASE_URL: `https://${projectRef}.supabase.co`,
      ...(projectRef === "bxtcuhkotumitoqtrcej"
        ? { DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"s".repeat(32)}` }
        : { DISCORDOS_SUPABASE_ANON_KEY: "synthetic-anon-key" }),
    });
    const result = await _internals.invokeLiveTransferStatus(config, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() { return projectRef === "bxtcuhkotumitoqtrcej" ? {} : { ok: true }; },
      }),
    });
    assert.deepEqual(result, {
      ok: false,
      status: 200,
      code: "LIVE_TRANSFER_STATUS_INVALID_SHAPE",
      transport: config.transport,
    });
  }
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
