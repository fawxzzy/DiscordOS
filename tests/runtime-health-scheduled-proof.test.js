const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-scheduled-proof");
const { _internals: proofInternals } = require("../scripts/runtime-health-proof");
const { _internals: alertInternals } = require("../scripts/runtime-health-alert");

const operationalPayload = {
  ok: true,
  service: "discordos-runtime-health",
  runtime: "vercel-serverless-function",
  posture: "operational",
  readinessPercent: 100,
  components: {
    supabaseProject: { state: "ready" },
    serviceRole: { state: "ready", runtime: "supabase-edge-function" },
    discordBot: { state: "ready" },
    activationGuard: { state: "ready" },
    persistedWriter: { state: "ready" },
    liveTransferStatus: { state: "ready" },
  },
  activation: {
    writerMode: "active",
    trafficTransferMode: "active",
    rollbackMode: "discordos-primary-with-fitness-rollback",
    writerActivationAllowed: true,
    liveCutover: true,
    fitnessTrafficMoved: true,
  },
  blockedReasons: [],
  generatedAt: "2026-06-13T03:15:00.000Z",
};

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

test("scheduled proof args default to production runtime-health surfaces", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    endpoint: proofInternals.DEFAULT_ENDPOINT,
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    maxSnapshotAgeHours: 24,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    scheduleName: "manual",
  });
});

test("scheduled proof args support thresholds schedule name and json output", () => {
  assert.deepEqual(_internals.parseArgs([
    "--endpoint",
    "https://example.test/api/runtime-health",
    "--json",
    "--snapshot-dir",
    "tmp/runtime-health",
    "--alert-dir",
    "tmp/runtime-health-alerts",
    "--max-age-hours",
    "6",
    "--min-readiness-percent",
    "95",
    "--stale-severity",
    "critical",
    "--schedule-name",
    "hourly",
  ]), {
    endpoint: "https://example.test/api/runtime-health",
    json: true,
    snapshotDir: path.resolve("tmp/runtime-health"),
    alertDir: path.resolve("tmp/runtime-health-alerts"),
    maxSnapshotAgeHours: 6,
    minReadinessPercent: 95,
    staleSeverity: "critical",
    scheduleName: "hourly",
  });
});

test("scheduled proof captures runtime health and durable alert decision", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-scheduled-proof-health-"));
  const alertDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-scheduled-proof-alert-"));
  const result = await _internals.runRuntimeHealthScheduledProof({
    endpoint: "https://example.test/api/runtime-health",
    snapshotDir,
    alertDir,
    maxSnapshotAgeHours: 1,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    scheduleName: "hourly",
    now: new Date("2026-06-13T03:16:00.000Z"),
    fetchImpl: async (url) => {
      assert.equal(url, "https://example.test/api/runtime-health");
      return response(operationalPayload);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.event.type, "discordos.runtime_health.scheduled_proof_pass");
  assert.equal(result.event.severity, "info");
  assert.equal(result.check.ok, true);
  assert.equal(result.alert.ok, true);
  assert.equal(result.alert.event.type, "discordos.runtime_health.alert_clear");
  assert.equal(path.basename(result.artifacts.runtimeHealthSnapshotPath), "2026-06-13T03-15-00-000Z-pass.json");
  assert(result.artifacts.alertDecisionPath.includes("2026-06-13T03-15-00-000Z"));
});

test("scheduled proof fails closed when live runtime health is action-required", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-scheduled-proof-health-"));
  const alertDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-scheduled-proof-alert-"));
  const result = await _internals.runRuntimeHealthScheduledProof({
    endpoint: "https://example.test/api/runtime-health",
    snapshotDir,
    alertDir,
    maxSnapshotAgeHours: 1,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    scheduleName: "hourly",
    now: new Date("2026-06-13T03:16:00.000Z"),
    fetchImpl: async () =>
      response(
        {
          ...operationalPayload,
          ok: false,
          posture: "action_required",
          readinessPercent: 83,
          components: {
            ...operationalPayload.components,
            discordBot: { state: "blocked" },
          },
          blockedReasons: ["discord_bot_not_verified"],
        },
        { ok: false, status: 409 }
      ),
  });

  assert.equal(result.ok, false);
  assert.equal(result.event.type, "discordos.runtime_health.scheduled_proof_fail");
  assert.equal(result.event.severity, "error");
  assert.equal(result.check.ok, false);
  assert.equal(result.alert.ok, false);
  assert(result.alert.event.reasonCodes.includes("runtime_health_blocked_reasons_present"));
});

test("scheduled proof renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    scheduleName: "hourly",
    endpoint: "https://example.test/api/runtime-health",
    event: {
      type: "discordos.runtime_health.scheduled_proof_pass",
      severity: "info",
    },
    artifacts: {
      runtimeHealthSnapshotPath: "runtime/discordos/runtime-health/proof.json",
      alertDecisionPath: "runtime/discordos/runtime-health-alerts/decision.json",
    },
    check: {
      ok: true,
      posture: "operational",
      readinessPercent: 100,
      fresh: true,
      blockedReasons: [],
    },
    alert: {
      ok: true,
      severity: "ok",
      event: { reasonCodes: [] },
    },
  });

  assert(rendered.includes("# DiscordOS Runtime Health Scheduled Proof"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("schedule name: `hourly`"));
  assert(rendered.includes("alert severity: `ok`"));
});
