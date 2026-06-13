const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-cron-production-proof");

function response(payload, { status = 200 } = {}) {
  return {
    status,
    async json() {
      return payload;
    },
  };
}

const runtimeHealthPayload = {
  ok: true,
  posture: "operational",
  readinessPercent: 100,
  blockedReasons: [],
  activation: {
    liveCutover: true,
    fitnessTrafficMoved: true,
  },
};

test("cron production proof args default to production alias", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    baseUrl: _internals.DEFAULT_BASE_URL,
  });
});

test("cron production proof args support custom base url and json", () => {
  assert.deepEqual(_internals.parseArgs(["--json", "--base-url", "https://example.test/"]), {
    json: true,
    baseUrl: "https://example.test",
  });
});

test("cron production proof passes when health is green and cron is publicly locked", async () => {
  const proof = await _internals.buildRuntimeHealthCronProductionProof({
    baseUrl: "https://example.test",
    fetchImpl: async (url) => {
      if (url === "https://example.test/api/runtime-health") {
        return response(runtimeHealthPayload);
      }
      if (url === "https://example.test/api/cron/runtime-health") {
        return response({ ok: false, error: "cron_secret_mismatch" }, { status: 401 });
      }
      throw new Error(`unexpected url: ${url}`);
    },
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.event.type, "discordos.runtime_health.cron_production_guard_pass");
  assert.equal(proof.runtimeHealth.status, 200);
  assert.equal(proof.cron.status, 401);
  assert.equal(proof.cron.publiclyLocked, true);
});

test("cron production proof fails when cron is publicly accessible", async () => {
  const proof = await _internals.buildRuntimeHealthCronProductionProof({
    baseUrl: "https://example.test",
    fetchImpl: async (url) =>
      url.endsWith("/api/runtime-health")
        ? response(runtimeHealthPayload)
        : response({ ok: true }, { status: 200 }),
  });

  assert.equal(proof.ok, false);
  assert.equal(proof.event.type, "discordos.runtime_health.cron_production_guard_fail");
  assert.equal(proof.cron.publiclyLocked, false);
});

test("cron production proof fails when runtime health is not operational", async () => {
  const proof = await _internals.buildRuntimeHealthCronProductionProof({
    baseUrl: "https://example.test",
    fetchImpl: async (url) =>
      url.endsWith("/api/runtime-health")
        ? response({ ...runtimeHealthPayload, ok: false, posture: "action_required" }, { status: 409 })
        : response({ ok: false, error: "cron_secret_mismatch" }, { status: 401 }),
  });

  assert.equal(proof.ok, false);
  assert.equal(proof.runtimeHealth.status, 409);
});

test("cron production proof renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    baseUrl: "https://example.test",
    event: {
      type: "discordos.runtime_health.cron_production_guard_pass",
      severity: "info",
    },
    runtimeHealth: {
      status: 200,
      posture: "operational",
      readinessPercent: 100,
      blockedReasons: [],
      liveCutover: true,
      fitnessTrafficMoved: true,
    },
    cron: {
      status: 401,
      publiclyLocked: true,
      error: "cron_secret_mismatch",
    },
  });

  assert(rendered.includes("# DiscordOS Runtime Health Cron Production Proof"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("cron publicly locked: `true`"));
});
