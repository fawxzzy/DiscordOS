const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/runtime-health");
const runtimeHealthHandler = require("../api/runtime-health");
const { _internals: readinessInternals } = require("../api/readiness");

function jwtWithPayload(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

test("runtime health reports blocked posture without configured runtime dependencies", () => {
  const snapshot = _internals.buildRuntimeHealthSnapshot({
    env: {},
    edgeServiceRoleStatus: {
      configured: false,
      reason: "missing_edge_probe_config",
    },
    discordBotStatus: {
      configured: false,
      reason: "missing_bot_token",
    },
  });

  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.posture, "action_required");
  assert.equal(snapshot.readinessPercent, 0);
  assert.equal(snapshot.components.supabaseProject.state, "blocked");
  assert.equal(snapshot.components.serviceRole.runtime, "none");
  assert.equal(snapshot.components.discordBot.state, "blocked");
  assert.equal(snapshot.components.activationGuard.state, "blocked");
  assert(snapshot.blockedReasons.includes("missing_bot_token"));
  assert(snapshot.blockedReasons.includes("writer_mode_not_active"));
});

test("runtime health accepts edge-backed service-role readiness without direct service-role env", () => {
  const snapshot = _internals.buildRuntimeHealthSnapshot({
    env: {
      DISCORDOS_SUPABASE_PROJECT_REF: readinessInternals.EXPECTED_SUPABASE_REF,
      DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
      DISCORDOS_SUPABASE_ANON_KEY: "anon-test-key",
    },
    edgeServiceRoleStatus: {
      configured: true,
      reason: "edge_service_role_probe_ok",
    },
    discordBotStatus: {
      configured: false,
      reason: "missing_bot_token",
    },
    liveTransferStatus: { ok: true, transport: "legacy_edge_fallback", payload: { liveSignedTransferReady: false } },
  });

  assert.equal(snapshot.components.supabaseProject.state, "ready");
  assert.equal(snapshot.components.serviceRole.state, "ready");
  assert.equal(snapshot.components.serviceRole.runtime, "supabase-edge-function");
  assert.equal(snapshot.components.liveTransferStatus.state, "ready");
  assert.equal(snapshot.components.discordBot.state, "blocked");
  assert.equal(snapshot.readinessPercent, 50);
});

test("runtime health reports operational posture when all generic runtime components are ready", () => {
  const env = {
    DISCORDOS_SUPABASE_PROJECT_REF: readinessInternals.EXPECTED_SUPABASE_REF,
    DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
    DISCORDOS_SUPABASE_ANON_KEY: "anon-test-key",
    DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: jwtWithPayload({
      role: readinessInternals.SERVICE_ROLE,
      ref: readinessInternals.EXPECTED_SUPABASE_REF,
    }),
    DISCORDOS_BOT_TOKEN: "bot-token",
    DISCORDOS_PERSISTED_WRITER_ENABLED: "true",
    DISCORDOS_WRITER_MODE: "active",
    DISCORDOS_TRAFFIC_TRANSFER_MODE: "active",
    DISCORDOS_ROLLBACK_MODE: "discordos-primary-with-fitness-rollback",
    DISCORDOS_LIVE_PARITY_PROOF_ID: "fitness-feedback-baae50a0-live-parity-20260613",
    DISCORDOS_LIVE_TRAFFIC_PROOF_ID: "fitness-feedback-baae50a0-live-traffic-20260613",
    DISCORDOS_ROLLBACK_EXECUTION_PROOF_ID: "rollback-proof",
  };

  const snapshot = _internals.buildRuntimeHealthSnapshot({
    env,
    edgeServiceRoleStatus: {
      configured: true,
      reason: "edge_service_role_probe_ok",
    },
    discordBotStatus: {
      configured: true,
      reason: "discord_bot_user_ok",
    },
    liveTransferStatus: { ok: true, transport: "direct_service_role_rpc", payload: { liveSignedTransferReady: true } },
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.posture, "operational");
  assert.equal(snapshot.readinessPercent, 100);
  assert.deepEqual(snapshot.blockedReasons, []);
  assert.equal(snapshot.activation.liveCutover, true);
  assert.equal(snapshot.activation.fitnessTrafficMoved, true);
});

test("runtime health fails closed when the configured live-transfer dependency probe fails", () => {
  const env = {
    DISCORDOS_SUPABASE_PROJECT_REF: readinessInternals.MASTER_SUPABASE_REF,
    DISCORDOS_SUPABASE_URL: `https://${readinessInternals.MASTER_SUPABASE_REF}.supabase.co`,
    DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"a".repeat(32)}`,
    DISCORDOS_PERSISTED_WRITER_ENABLED: "true",
    DISCORDOS_WRITER_MODE: "active",
    DISCORDOS_TRAFFIC_TRANSFER_MODE: "active",
    DISCORDOS_ROLLBACK_MODE: "discordos-primary-with-fitness-rollback",
    DISCORDOS_LIVE_PARITY_PROOF_ID: "parity-proof",
    DISCORDOS_LIVE_TRAFFIC_PROOF_ID: "traffic-proof",
    DISCORDOS_ROLLBACK_EXECUTION_PROOF_ID: "rollback-proof",
  };
  const snapshot = _internals.buildRuntimeHealthSnapshot({
    env,
    directServiceRoleStatus: { configured: true, reason: "direct_service_key_probe_ok" },
    edgeServiceRoleStatus: { configured: false, reason: "edge_probe_not_required_for_master" },
    discordBotStatus: { configured: true, reason: "discord_bot_user_ok" },
    liveTransferStatus: { ok: false, code: "DIRECT_LIVE_TRANSFER_STATUS_FAILED", transport: "direct_service_role_rpc" },
  });

  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.posture, "action_required");
  assert.equal(snapshot.components.liveTransferStatus.state, "blocked");
  assert(snapshot.blockedReasons.includes("DIRECT_LIVE_TRANSFER_STATUS_FAILED"));
});

test("runtime health blocks a successful HTTP probe with malformed live-transfer data", () => {
  const snapshot = _internals.buildRuntimeHealthSnapshot({
    env: {
      DISCORDOS_SUPABASE_PROJECT_REF: readinessInternals.MASTER_SUPABASE_REF,
      DISCORDOS_SUPABASE_URL: `https://${readinessInternals.MASTER_SUPABASE_REF}.supabase.co`,
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"a".repeat(32)}`,
    },
    directServiceRoleStatus: { configured: true, reason: "direct_service_key_probe_ok" },
    edgeServiceRoleStatus: { configured: false, reason: "edge_probe_not_required_for_master" },
    discordBotStatus: { configured: true, reason: "discord_bot_user_ok" },
    liveTransferStatus: { ok: true, transport: "direct_service_role_rpc", payload: {} },
  });

  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.components.liveTransferStatus.state, "blocked");
  assert(snapshot.blockedReasons.includes("LIVE_TRANSFER_STATUS_INVALID_SHAPE"));
});

test("runtime health accepts an exact master project with a successful modern direct probe", () => {
  const snapshot = _internals.buildRuntimeHealthSnapshot({
    env: {
      DISCORDOS_SUPABASE_PROJECT_REF: readinessInternals.MASTER_SUPABASE_REF,
      DISCORDOS_SUPABASE_URL: `https://${readinessInternals.MASTER_SUPABASE_REF}.supabase.co`,
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"a".repeat(32)}`,
    },
    directServiceRoleStatus: { configured: true, reachable: true, probeOk: true, reason: "direct_service_key_probe_ok" },
    edgeServiceRoleStatus: { configured: false, reason: "edge_service_role_not_verified" },
    discordBotStatus: { configured: false, reason: "missing_bot_token" },
    liveTransferStatus: { ok: true, transport: "direct_service_role_rpc", payload: { liveSignedTransferReady: true } },
  });
  assert.equal(snapshot.components.supabaseProject.state, "ready");
  assert.equal(snapshot.components.serviceRole.state, "ready");
  assert.equal(snapshot.components.serviceRole.runtime, "vercel-env");
  assert(!snapshot.blockedReasons.includes("modern_secret_requires_live_probe"));
});

test("runtime health rejects an unrelated project even when a supplied direct status claims success", () => {
  const snapshot = _internals.buildRuntimeHealthSnapshot({
    env: { DISCORDOS_SUPABASE_PROJECT_REF: "lpswxoyfniocuhljgzbc" },
    directServiceRoleStatus: { configured: true, reason: "direct_service_key_probe_ok" },
    edgeServiceRoleStatus: { configured: false, reason: "edge_service_role_not_verified" },
    discordBotStatus: { configured: false, reason: "missing_bot_token" },
    liveTransferStatus: { ok: false, code: "LIVE_TRANSFER_STATUS_NOT_CONFIGURED", transport: "none" },
  });
  assert.equal(snapshot.components.supabaseProject.state, "blocked");
  assert(snapshot.blockedReasons.includes("supabase_project_ref_not_configured"));
});

test("runtime health handler keeps exact master project and modern direct key ready", async () => {
  const keys = ["DISCORDOS_SUPABASE_PROJECT_REF", "DISCORDOS_SUPABASE_URL", "DISCORDOS_SUPABASE_SERVICE_ROLE_KEY", "DISCORDOS_SUPABASE_ANON_KEY", "DISCORDOS_BOT_TOKEN"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  let payload;
  try {
    process.env.DISCORDOS_SUPABASE_PROJECT_REF = readinessInternals.MASTER_SUPABASE_REF;
    process.env.DISCORDOS_SUPABASE_URL = `https://${readinessInternals.MASTER_SUPABASE_REF}.supabase.co`;
    process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY = `sb_secret_${"b".repeat(32)}`;
    process.env.DISCORDOS_SUPABASE_ANON_KEY = `sb_publishable_${"p".repeat(32)}`;
    process.env.DISCORDOS_BOT_TOKEN = "bot-fixture";
    global.fetch = async (url) => {
      if (url.endsWith("/rest/v1/")) return { ok: true, status: 200 };
      if (url.endsWith("/rest/v1/rpc/discordos_get_live_transfer_status")) {
        return { ok: true, status: 200, json: async () => ({ liveSignedTransferReady: true }) };
      }
      if (url.includes("/functions/v1/")) return { ok: false, status: 401, json: async () => null };
      if (url.includes("discord.com/api/")) return { ok: true, status: 200, json: async () => ({ bot: true }) };
      throw new Error(`unexpected_url:${url}`);
    };
    const res = { setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { payload = value; return value; } };
    await runtimeHealthHandler({ method: "GET" }, res);
    assert.equal(payload.components.supabaseProject.state, "ready");
    assert.equal(payload.components.serviceRole.state, "ready");
    assert.equal(payload.components.serviceRole.runtime, "vercel-env");
    assert.equal(payload.components.liveTransferStatus.state, "ready");
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) before[key] === undefined ? delete process.env[key] : process.env[key] = before[key];
  }
});

test("runtime health rejects a modern secret in the public Edge slot before fetch", async () => {
  const keys = ["DISCORDOS_SUPABASE_PROJECT_REF", "DISCORDOS_SUPABASE_URL", "DISCORDOS_SUPABASE_SERVICE_ROLE_KEY", "DISCORDOS_SUPABASE_ANON_KEY", "DISCORDOS_BOT_TOKEN"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  let edgeCalls = 0;
  try {
    process.env.DISCORDOS_SUPABASE_PROJECT_REF = readinessInternals.MASTER_SUPABASE_REF;
    process.env.DISCORDOS_SUPABASE_URL = `https://${readinessInternals.MASTER_SUPABASE_REF}.supabase.co`;
    process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY = "";
    process.env.DISCORDOS_SUPABASE_ANON_KEY = `sb_secret_${"x".repeat(32)}`;
    process.env.DISCORDOS_BOT_TOKEN = "bot-fixture";
    global.fetch = async (url) => {
      if (String(url).includes("/functions/v1/")) edgeCalls += 1;
      if (String(url).includes("discord.com/api/")) return { ok: true, status: 200, json: async () => ({ bot: true }) };
      throw new Error(`unexpected_url:${url}`);
    };
    let payload;
    const res = { setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { payload = value; return value; } };
    await runtimeHealthHandler({ method: "GET" }, res);
    assert.equal(edgeCalls, 0);
    assert.equal(payload.components.serviceRole.state, "blocked");
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) before[key] === undefined ? delete process.env[key] : process.env[key] = before[key];
  }
});

test("runtime health percent rounds ready components over all components", () => {
  assert.equal(_internals.percentFromComponents({
    one: { state: "ready" },
    two: { state: "blocked" },
    three: { state: "ready" },
  }), 67);
});
