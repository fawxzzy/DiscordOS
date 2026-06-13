const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/runtime-health");
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
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.posture, "operational");
  assert.equal(snapshot.readinessPercent, 100);
  assert.deepEqual(snapshot.blockedReasons, []);
  assert.equal(snapshot.activation.liveCutover, true);
  assert.equal(snapshot.activation.fitnessTrafficMoved, true);
});

test("runtime health percent rounds ready components over all components", () => {
  assert.equal(_internals.percentFromComponents({
    one: { state: "ready" },
    two: { state: "blocked" },
    three: { state: "ready" },
  }), 67);
});
