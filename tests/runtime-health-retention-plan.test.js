const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-retention-plan");
const { _internals: proofInternals } = require("../scripts/runtime-health-proof");
const { _internals: alertInternals } = require("../scripts/runtime-health-alert");

function healthSnapshot({ ok = true, generatedAt = "2026-06-13T03:00:00.000Z" } = {}) {
  return {
    ok,
    summary: {
      generatedAt,
      posture: ok ? "operational" : "action_required",
      readinessPercent: ok ? 100 : 83,
      blockedReasons: ok ? [] : ["discord_bot_not_verified"],
    },
    event: {
      type: ok ? "discordos.runtime_health.operational" : "discordos.runtime_health.action_required",
      severity: ok ? "info" : "warning",
    },
  };
}

function alertDecision({ ok = true, writtenAt = "2026-06-13T03:00:00.000Z" } = {}) {
  return {
    ok,
    severity: ok ? "ok" : "critical",
    event: {
      type: ok ? "discordos.runtime_health.alert_clear" : "discordos.runtime_health.alert_triggered",
      status: ok ? "clear" : "active",
      reasonCodes: ok ? [] : ["runtime_health_blocked_reasons_present"],
    },
    decision: {
      writtenAt,
    },
  };
}

async function writeJson(dir, fileName, payload) {
  await fs.writeFile(path.join(dir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("retention plan args default to plan-only policy", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    keepCount: 50,
    keepDays: 30,
  });
});

test("retention plan args support custom dirs and thresholds", () => {
  assert.deepEqual(_internals.parseArgs([
    "--json",
    "--snapshot-dir",
    "tmp/health",
    "--alert-dir",
    "tmp/alerts",
    "--keep-count",
    "2",
    "--keep-days",
    "7",
  ]), {
    json: true,
    snapshotDir: path.resolve("tmp/health"),
    alertDir: path.resolve("tmp/alerts"),
    keepCount: 2,
    keepDays: 7,
  });
});

test("retention plan parses timestamp-shaped file names", () => {
  assert.equal(
    _internals.timestampFromFileName("2026-06-13T03-00-00-123Z-pass.json"),
    "2026-06-13T03:00:00.123Z"
  );
});

test("retention plan marks old extra clear artifacts eligible for review", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-retention-health-"));
  const alertDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-retention-alert-"));
  await writeJson(snapshotDir, "new-health.json", healthSnapshot({ generatedAt: "2026-06-13T03:00:00.000Z" }));
  await writeJson(snapshotDir, "old-health.json", healthSnapshot({ generatedAt: "2026-05-01T03:00:00.000Z" }));
  await writeJson(alertDir, "new-alert.json", alertDecision({ writtenAt: "2026-06-13T03:00:00.000Z" }));
  await writeJson(alertDir, "old-alert.json", alertDecision({ writtenAt: "2026-05-01T03:00:00.000Z" }));

  const plan = await _internals.buildRuntimeHealthRetentionPlan({
    snapshotDir,
    alertDir,
    keepCount: 1,
    keepDays: 7,
    now: new Date("2026-06-13T04:00:00.000Z"),
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.destructive, false);
  assert.equal(plan.totals.artifacts, 4);
  assert.equal(plan.totals.retain, 2);
  assert.equal(plan.totals.eligibleForReview, 2);
  assert.equal(plan.health.find((record) => record.fileName === "old-health.json").action, "eligible_for_review");
  assert.equal(plan.alerts.find((record) => record.fileName === "old-alert.json").action, "eligible_for_review");
});

test("retention plan retains non-clear evidence even when old", () => {
  const records = [
    {
      family: "runtime_health_alert",
      fileName: "old-triggered.json",
      timestamp: "2026-05-01T03:00:00.000Z",
      timestampMs: Date.parse("2026-05-01T03:00:00.000Z"),
      ok: false,
      eventType: "discordos.runtime_health.alert_triggered",
      severity: "critical",
    },
  ];

  const [planned] = _internals.classifyRetentionArtifacts(records, {
    keepCount: 0,
    keepDays: 7,
    now: new Date("2026-06-13T04:00:00.000Z"),
  });

  assert.equal(planned.action, "retain");
  assert(planned.reasons.includes("retain_non_clear_evidence"));
});

test("retention plan renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    snapshotDir: "runtime/discordos/runtime-health",
    alertDir: "runtime/discordos/runtime-health-alerts",
    policy: {
      action: "plan_only",
      keepCount: 50,
      keepDays: 30,
    },
    totals: {
      artifacts: 2,
      retain: 2,
      eligibleForReview: 0,
      healthArtifacts: 1,
      alertArtifacts: 1,
    },
  });

  assert(rendered.includes("# DiscordOS Runtime Health Retention Plan"));
  assert(rendered.includes("destructive: `false`"));
  assert(rendered.includes("policy action: `plan_only`"));
});
