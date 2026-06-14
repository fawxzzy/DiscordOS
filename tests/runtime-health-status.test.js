const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-status");
const { _internals: cronInternals } = require("../scripts/runtime-health-cron-production-proof");
const { _internals: proofInternals } = require("../scripts/runtime-health-proof");
const { _internals: alertInternals } = require("../scripts/runtime-health-alert");
const { _internals: receiptStateInternals } = require("../scripts/discordos-receipt-state");

async function writeJson(dir, fileName, payload) {
  await fs.writeFile(path.join(dir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function healthSnapshot() {
  return {
    ok: true,
    summary: {
      generatedAt: "2026-06-13T04:00:00.000Z",
      posture: "operational",
      readinessPercent: 100,
      blockedReasons: [],
    },
    event: {
      type: "discordos.runtime_health.operational",
      severity: "info",
    },
  };
}

function alertDecision() {
  return {
    ok: true,
    severity: "ok",
    event: {
      type: "discordos.runtime_health.alert_clear",
      status: "clear",
      reasonCodes: [],
    },
    decision: {
      writtenAt: "2026-06-13T04:00:00.000Z",
    },
  };
}

test("runtime health status args default to read-only production status", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    baseUrl: cronInternals.DEFAULT_BASE_URL,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    limit: 20,
    keepCount: 50,
    keepDays: 30,
    docsDir: receiptStateInternals.DEFAULT_RECEIPT_DIR,
    probeLive: false,
  });
});

test("runtime health status args support json dirs and live probe", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--base-url",
    "https://example.invalid/",
    "--snapshot-dir",
    ".",
    "--alert-dir",
    ".",
    "--limit",
    "5",
    "--keep-count",
    "10",
    "--keep-days",
    "7",
    "--docs-dir",
    ".",
    "--probe-live",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.baseUrl, "https://example.invalid");
  assert.equal(parsed.limit, 5);
  assert.equal(parsed.keepCount, 10);
  assert.equal(parsed.keepDays, 7);
  assert.equal(parsed.docsDir, path.resolve("."));
  assert.equal(parsed.probeLive, true);
});

test("runtime health status recommends next actions from current blockers", () => {
  assert.deepEqual(
    _internals.determineNextActions({
      cronProductionProof: { ok: true },
      operationsAdmission: {
        decisions: {
          scheduledProof: { status: "admissible" },
          retentionEnforcement: { status: "not_needed" },
        },
      },
      alertTargetAdmission: {
        ok: false,
        target: {
          configured: false,
        },
      },
    }),
    ["capture_first_real_scheduled_cron_run_after_schedule", "configure_runtime_health_alert_target"]
  );

  assert.deepEqual(
    _internals.determineNextActions({
      cronProductionProof: { ok: false },
      operationsAdmission: {
        decisions: {
          scheduledProof: { status: "blocked" },
          retentionEnforcement: { status: "requires_confirmation" },
        },
      },
      alertTargetAdmission: {
        ok: false,
        target: {
          configured: true,
        },
      },
    }),
    [
      "restore_production_runtime_or_cron_guard",
      "repair_runtime_health_alert_target",
      "review_retention_enforcement",
    ]
  );

  assert.deepEqual(
    _internals.determineNextActions({
      cronProductionProof: { ok: true },
      operationsAdmission: {
        decisions: {
          scheduledProof: { status: "satisfied" },
          retentionEnforcement: { status: "not_needed" },
        },
      },
      alertTargetAdmission: {
        ok: true,
        target: {
          configured: true,
        },
      },
    }),
    ["continue_runtime_monitoring"]
  );
});

test("runtime health status builds a read-only composite report", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-status-health-"));
  const alertDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-status-alert-"));
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-status-docs-"));
  await writeJson(snapshotDir, "2026-06-13T04-00-00-000Z-pass.json", healthSnapshot());
  await writeJson(alertDir, "2026-06-13T04-00-00-000Z-ok.json", alertDecision());
  await fs.writeFile(
    path.join(docsDir, "discordos-runtime-health-scheduled-audit-proof-pass-73-2026-06-14.md"),
    "# Scheduled audit proof\n",
    "utf8"
  );

  const status = await _internals.buildRuntimeHealthStatus({
    baseUrl: "https://example.invalid",
    snapshotDir,
    alertDir,
    docsDir,
    limit: 20,
    keepCount: 50,
    keepDays: 30,
    probeLive: false,
    env: {},
    fetchImpl: async (url) => {
      if (url === "https://example.invalid/api/runtime-health") {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            posture: "operational",
            readinessPercent: 100,
            blockedReasons: [],
            activation: {
              liveCutover: true,
              fitnessTrafficMoved: true,
            },
          }),
        };
      }
      if (url === "https://example.invalid/api/cron/runtime-health") {
        return {
          status: 401,
          json: async () => ({
            error: "cron_secret_mismatch",
          }),
        };
      }
      throw new Error(`unexpected_url:${url}`);
    },
  });

  assert.equal(status.ok, true);
  assert.equal(status.destructive, false);
  assert.equal(status.sendsMessages, false);
  assert.equal(status.writesArtifacts, false);
  assert.equal(status.runtimeHealth.posture, "operational");
  assert.equal(status.cron.publiclyLocked, true);
  assert.equal(status.alertTarget.type, "none");
  assert.equal(status.operations.scheduledProof, "satisfied");
  assert.equal(status.operations.scheduledCronAuditProof, true);
  assert.deepEqual(status.nextActions, ["configure_runtime_health_alert_target"]);
  assert.equal(status.event.type, "discordos.runtime_health.status_ready");
});

test("runtime health status renders markdown without target values", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    event: {
      type: "discordos.runtime_health.status_ready",
      severity: "info",
    },
    baseUrl: "https://example.invalid",
    runtimeHealth: {
      httpStatus: 200,
      posture: "operational",
      readinessPercent: 100,
      blockedReasons: [],
      liveCutover: true,
      fitnessTrafficMoved: true,
    },
    cron: {
      httpStatus: 401,
      publiclyLocked: true,
    },
    alertTarget: {
      type: "discord_webhook",
      configured: true,
      shapeValid: true,
      liveProbeStatus: "skipped",
      reasonCodes: [],
    },
    operations: {
      retentionEnforcement: "not_needed",
      scheduledProof: "admissible",
      scheduledProofReasons: ["latest_runtime_health_green", "latest_alert_clear"],
      scheduledCronAuditProof: false,
      alertDelivery: "admissible",
    },
    nextActions: ["capture_first_real_scheduled_cron_run_after_schedule"],
  });

  assert(rendered.includes("# DiscordOS Runtime Health Status"));
  assert(rendered.includes("alert target type: `discord_webhook`"));
  assert(!rendered.includes("webhook-secret"));
});
