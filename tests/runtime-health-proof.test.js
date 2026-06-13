const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-proof");

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

test("runtime health proof args default to production alias", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    endpoint: _internals.DEFAULT_ENDPOINT,
    json: false,
    expectOperational: true,
    writeSnapshot: false,
    snapshotDir: _internals.DEFAULT_SNAPSHOT_DIR,
  });
});

test("runtime health proof args support endpoint and json output", () => {
  assert.deepEqual(_internals.parseArgs(["--endpoint", "https://example.test/api/runtime-health", "--json", "--write-snapshot", "--snapshot-dir", "tmp/snapshots"]), {
    endpoint: "https://example.test/api/runtime-health",
    json: true,
    expectOperational: true,
    writeSnapshot: true,
    snapshotDir: path.resolve("tmp/snapshots"),
  });
});

test("runtime health proof validates operational payloads", () => {
  assert.deepEqual(_internals.validateRuntimeHealthPayload(operationalPayload), {
    ok: true,
    failures: [],
  });
});

test("runtime health proof rejects action-required payloads by default", () => {
  const validation = _internals.validateRuntimeHealthPayload({
    ...operationalPayload,
    ok: false,
    posture: "action_required",
    readinessPercent: 83,
    blockedReasons: ["discord_bot_not_verified"],
    components: {
      ...operationalPayload.components,
      discordBot: { state: "blocked" },
    },
  });

  assert.equal(validation.ok, false);
  assert(validation.failures.includes("runtime_health_not_ok"));
  assert(validation.failures.includes("runtime_health_not_operational"));
  assert(validation.failures.includes("readiness_percent_not_100"));
  assert(validation.failures.includes("discordBot_not_ready"));
  assert(validation.failures.includes("blocked_reasons_present"));
});

test("runtime health proof fetches and summarizes the live contract without secret values", async () => {
  const proof = await _internals.fetchRuntimeHealthProof({
    endpoint: "https://example.test/api/runtime-health",
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://example.test/api/runtime-health");
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Accept, "application/json");
      return {
        ok: true,
        status: 200,
        async json() {
          return operationalPayload;
        },
      };
    },
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.summary.posture, "operational");
  assert.equal(proof.summary.serviceRoleRuntime, "supabase-edge-function");
  assert.equal(proof.summary.writerMode, "active");
  assert.deepEqual(proof.summary.blockedReasons, []);
  assert.deepEqual(proof.event, {
    type: "discordos.runtime_health.operational",
    severity: "info",
    subject: "discordos.runtime",
    status: "pass",
    dimensions: {
      endpoint: "https://example.test/api/runtime-health",
      httpStatus: 200,
      posture: "operational",
      readinessPercent: 100,
      serviceRoleRuntime: "supabase-edge-function",
      writerMode: "active",
      trafficTransferMode: "active",
      rollbackMode: "discordos-primary-with-fitness-rollback",
      liveCutover: true,
      fitnessTrafficMoved: true,
      blockedReasonCount: 0,
      validationFailureCount: 0,
      blocked: false,
    },
  });
  assert.equal(JSON.stringify(proof).includes("token"), false);
});

test("runtime health proof classifies blocked health as action-required warning", () => {
  const event = _internals.classifyRuntimeHealthEvent({
    endpoint: "https://example.test/api/runtime-health",
    httpStatus: 409,
    validation: { ok: false, failures: ["discordBot_not_ready"] },
    summary: {
      posture: "action_required",
      readinessPercent: 83,
      serviceRoleRuntime: "supabase-edge-function",
      writerMode: "active",
      trafficTransferMode: "active",
      rollbackMode: "discordos-primary-with-fitness-rollback",
      liveCutover: true,
      fitnessTrafficMoved: true,
      blockedReasons: ["discord_bot_not_verified"],
    },
  });

  assert.equal(event.type, "discordos.runtime_health.action_required");
  assert.equal(event.severity, "warning");
  assert.equal(event.status, "fail");
  assert.equal(event.dimensions.blockedReasonCount, 1);
  assert.equal(event.dimensions.validationFailureCount, 1);
});

test("runtime health proof classifies invalid server payload as error", () => {
  const event = _internals.classifyRuntimeHealthEvent({
    endpoint: "https://example.test/api/runtime-health",
    httpStatus: 502,
    validation: { ok: false, failures: ["payload_must_be_object"] },
    summary: {
      posture: null,
      readinessPercent: null,
      serviceRoleRuntime: null,
      writerMode: null,
      trafficTransferMode: null,
      rollbackMode: null,
      liveCutover: false,
      fitnessTrafficMoved: false,
      blockedReasons: [],
    },
  });

  assert.equal(event.type, "discordos.runtime_health.action_required");
  assert.equal(event.severity, "error");
  assert.equal(event.status, "fail");
});

test("runtime health proof renders markdown proof output", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    endpoint: "https://example.test/api/runtime-health",
    httpStatus: 200,
    validation: { failures: [] },
    event: {
      type: "discordos.runtime_health.operational",
      severity: "info",
    },
    snapshotPath: "runtime/discordos/runtime-health/proof.json",
    summary: {
      posture: "operational",
      readinessPercent: 100,
      serviceRoleRuntime: "supabase-edge-function",
      writerMode: "active",
      trafficTransferMode: "active",
      rollbackMode: "discordos-primary-with-fitness-rollback",
      writerActivationAllowed: true,
      liveCutover: true,
      fitnessTrafficMoved: true,
      blockedReasons: [],
      generatedAt: "2026-06-13T02:08:54.643Z",
    },
  });

  assert(rendered.includes("# DiscordOS Runtime Health Proof"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("blocked reasons: `none`"));
  assert(rendered.includes("event type: `discordos.runtime_health.operational`"));
  assert(rendered.includes("snapshot path: `runtime/discordos/runtime-health/proof.json`"));
});

test("runtime health proof writes a timestamped runtime snapshot", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-"));
  const proof = {
    ok: true,
    endpoint: "https://example.test/api/runtime-health",
    httpStatus: 200,
    validation: { ok: true, failures: [] },
    summary: {
      service: "discordos-runtime-health",
      posture: "operational",
      readinessPercent: 100,
      componentStates: operationalPayload.components,
      serviceRoleRuntime: "supabase-edge-function",
      writerMode: "active",
      trafficTransferMode: "active",
      rollbackMode: "discordos-primary-with-fitness-rollback",
      writerActivationAllowed: true,
      liveCutover: true,
      fitnessTrafficMoved: true,
      blockedReasons: [],
      generatedAt: "2026-06-13T02:16:47.926Z",
    },
    event: {
      type: "discordos.runtime_health.operational",
      severity: "info",
      subject: "discordos.runtime",
      status: "pass",
      dimensions: {
        endpoint: "https://example.test/api/runtime-health",
        httpStatus: 200,
        blockedReasonCount: 0,
        validationFailureCount: 0,
        blocked: false,
      },
    },
  };

  const snapshot = await _internals.writeRuntimeHealthSnapshot(proof, { snapshotDir });
  const expectedPath = path.join(snapshotDir, "2026-06-13T02-16-47-926Z-pass.json");
  const parsed = JSON.parse(await fs.readFile(expectedPath, "utf8"));

  assert.equal(snapshot.snapshotPath, expectedPath);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.type, "discordos.runtime_health.operational");
  assert.equal(parsed.snapshot.path, expectedPath);
  assert.equal(typeof parsed.snapshot.writtenAt, "string");
});
