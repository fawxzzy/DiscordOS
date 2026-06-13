const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-check");
const { _internals: proofInternals } = require("../scripts/runtime-health-proof");

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
  generatedAt: "2026-06-13T02:08:54.643Z",
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

test("runtime health check args default to production alias and runtime snapshot directory", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    endpoint: proofInternals.DEFAULT_ENDPOINT,
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    maxSnapshotAgeHours: 24,
  });
});

test("runtime health check args support endpoint json snapshot dir and max age", () => {
  assert.deepEqual(_internals.parseArgs([
    "--endpoint",
    "https://example.test/api/runtime-health",
    "--json",
    "--snapshot-dir",
    "tmp/runtime-health",
    "--max-age-hours",
    "4",
  ]), {
    endpoint: "https://example.test/api/runtime-health",
    json: true,
    snapshotDir: path.resolve("tmp/runtime-health"),
    maxSnapshotAgeHours: 4,
  });
});

test("runtime health check writes a fresh snapshot and summary", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-check-"));
  const result = await _internals.runRuntimeHealthCheck({
    endpoint: "https://example.test/api/runtime-health",
    snapshotDir,
    maxSnapshotAgeHours: 1,
    now: new Date("2026-06-13T02:09:00.000Z"),
    fetchImpl: async (url) => {
      assert.equal(url, "https://example.test/api/runtime-health");
      return response(operationalPayload);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.proof.ok, true);
  assert.equal(result.summary.ok, true);
  assert.equal(result.summary.latest.fresh, true);
  assert.equal(result.summary.latest.eventType, "discordos.runtime_health.operational");
  assert.equal(path.basename(result.snapshotPath), "2026-06-13T02-08-54-643Z-pass.json");
});

test("runtime health check fails when live proof is action-required", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-check-"));
  const result = await _internals.runRuntimeHealthCheck({
    endpoint: "https://example.test/api/runtime-health",
    snapshotDir,
    maxSnapshotAgeHours: 1,
    now: new Date("2026-06-13T02:09:00.000Z"),
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
  assert.equal(result.proof.ok, false);
  assert.equal(result.summary.ok, false);
  assert.equal(result.summary.latest.eventType, "discordos.runtime_health.action_required");
  assert.deepEqual(result.summary.latest.blockedReasons, ["discord_bot_not_verified"]);
});

test("runtime health check renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    endpoint: "https://example.test/api/runtime-health",
    snapshotPath: "runtime/discordos/runtime-health/proof.json",
    proof: { ok: true },
    summary: {
      ok: true,
      latest: {
        fresh: true,
        ageHours: 0.1,
        posture: "operational",
        readinessPercent: 100,
        eventType: "discordos.runtime_health.operational",
        blockedReasons: [],
      },
    },
  });

  assert(rendered.includes("# DiscordOS Runtime Health Check"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("latest fresh: `true`"));
});
