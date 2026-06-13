const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-alert");
const { _internals: proofInternals } = require("../scripts/runtime-health-proof");

function snapshot({ ok = true, generatedAt, readinessPercent = 100, blockedReasons = [], eventType, eventSeverity }) {
  return {
    ok,
    summary: {
      posture: ok ? "operational" : "action_required",
      readinessPercent,
      blockedReasons,
      generatedAt,
    },
    event: {
      type: eventType || (ok ? "discordos.runtime_health.operational" : "discordos.runtime_health.action_required"),
      severity: eventSeverity || (ok ? "info" : "warning"),
    },
  };
}

async function writeSnapshot(dir, fileName, payload) {
  await fs.writeFile(path.join(dir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("runtime health alert args default to runtime snapshot directory", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: _internals.DEFAULT_ALERT_DIR,
    limit: 10,
    maxSnapshotAgeHours: 24,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    writeDecision: false,
  });
});

test("runtime health alert args support thresholds and json output", () => {
  assert.deepEqual(_internals.parseArgs([
    "--json",
    "--snapshot-dir",
    "tmp/runtime-health",
    "--alert-dir",
    "tmp/runtime-health-alerts",
    "--write-decision",
    "--limit",
    "3",
    "--max-age-hours",
    "6",
    "--min-readiness-percent",
    "95",
    "--stale-severity",
    "critical",
  ]), {
    json: true,
    snapshotDir: path.resolve("tmp/runtime-health"),
    alertDir: path.resolve("tmp/runtime-health-alerts"),
    limit: 3,
    maxSnapshotAgeHours: 6,
    minReadinessPercent: 95,
    staleSeverity: "critical",
    writeDecision: true,
  });
});

test("runtime health alert clears for a fresh passing latest snapshot", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-alert-"));
  await writeSnapshot(dir, "latest-pass.json", snapshot({ generatedAt: "2026-06-13T03:00:00.000Z" }));

  const alert = await _internals.buildRuntimeHealthAlert({
    snapshotDir: dir,
    limit: 10,
    maxSnapshotAgeHours: 24,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    now: new Date("2026-06-13T03:05:00.000Z"),
  });

  assert.equal(alert.ok, true);
  assert.equal(alert.severity, "ok");
  assert.equal(alert.event.type, "discordos.runtime_health.alert_clear");
  assert.deepEqual(alert.decisions, []);
});

test("runtime health alert warns for a stale latest snapshot", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-alert-"));
  await writeSnapshot(dir, "latest-pass.json", snapshot({ generatedAt: "2026-06-13T01:00:00.000Z" }));

  const alert = await _internals.buildRuntimeHealthAlert({
    snapshotDir: dir,
    limit: 10,
    maxSnapshotAgeHours: 1,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    now: new Date("2026-06-13T03:00:00.000Z"),
  });

  assert.equal(alert.ok, false);
  assert.equal(alert.severity, "warning");
  assert.equal(alert.event.type, "discordos.runtime_health.alert_triggered");
  assert.deepEqual(alert.event.reasonCodes, ["runtime_health_latest_stale"]);
});

test("runtime health alert escalates failed latest snapshot with blocked reasons", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-alert-"));
  await writeSnapshot(
    dir,
    "latest-fail.json",
    snapshot({
      ok: false,
      generatedAt: "2026-06-13T03:00:00.000Z",
      readinessPercent: 83,
      blockedReasons: ["discord_bot_not_verified"],
    })
  );

  const alert = await _internals.buildRuntimeHealthAlert({
    snapshotDir: dir,
    limit: 10,
    maxSnapshotAgeHours: 24,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    now: new Date("2026-06-13T03:05:00.000Z"),
  });

  assert.equal(alert.ok, false);
  assert.equal(alert.severity, "critical");
  assert(alert.event.reasonCodes.includes("runtime_health_latest_failed"));
  assert(alert.event.reasonCodes.includes("runtime_health_readiness_below_threshold"));
  assert(alert.event.reasonCodes.includes("runtime_health_blocked_reasons_present"));
  assert(alert.event.reasonCodes.includes("runtime_health_history_has_failures"));
});

test("runtime health alert is critical when snapshots are missing", () => {
  const alert = _internals.decideRuntimeHealthAlert({
    snapshotDir: "runtime/discordos/runtime-health",
    maxSnapshotAgeHours: 24,
    totalSnapshots: 0,
    passCount: 0,
    failCount: 0,
    latest: null,
  });

  assert.equal(alert.ok, false);
  assert.equal(alert.severity, "critical");
  assert.deepEqual(alert.event.reasonCodes, ["runtime_health_snapshot_missing"]);
});

test("runtime health alert writes a timestamped decision", async () => {
  const alertDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-alert-decision-"));
  const alert = {
    ok: true,
    severity: "ok",
    event: {
      type: "discordos.runtime_health.alert_clear",
      severity: "ok",
      subject: "discordos.runtime",
      status: "clear",
      reasonCodes: [],
    },
    thresholds: {
      maxSnapshotAgeHours: 24,
      minReadinessPercent: 100,
      staleSeverity: "warning",
    },
    summary: {
      snapshotDir: "runtime/discordos/runtime-health",
      totalSnapshots: 1,
      passCount: 1,
      failCount: 0,
      latest: {
        fileName: "latest-pass.json",
        generatedAt: "2026-06-13T03:00:00.000Z",
        fresh: true,
        posture: "operational",
        readinessPercent: 100,
        blockedReasons: [],
      },
    },
    decisions: [],
  };

  const decision = await _internals.writeRuntimeHealthAlertDecision(alert, { alertDir });
  const parsed = JSON.parse(await fs.readFile(decision.decisionPath, "utf8"));

  assert(decision.decisionPath.startsWith(path.join(alertDir, "2026-06-13T03-00-00-000Z-")));
  assert(decision.decisionPath.endsWith("-ok.json"));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.type, "discordos.runtime_health.alert_clear");
  assert.equal(parsed.decision.path, decision.decisionPath);
  assert.equal(typeof parsed.decision.writtenAt, "string");
});

test("runtime health alert renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: false,
    severity: "warning",
    event: {
      type: "discordos.runtime_health.alert_triggered",
      status: "active",
      reasonCodes: ["runtime_health_latest_stale"],
    },
    decisionPath: "runtime/discordos/runtime-health-alerts/decision.json",
    summary: {
      snapshotDir: "runtime/discordos/runtime-health",
      totalSnapshots: 1,
      latest: {
        fileName: "latest-pass.json",
        fresh: false,
        posture: "operational",
        readinessPercent: 100,
        blockedReasons: [],
      },
    },
    decisions: [
      {
        severity: "warning",
        code: "runtime_health_latest_stale",
        message: "Latest runtime-health snapshot is stale.",
      },
    ],
  });

  assert(rendered.includes("# DiscordOS Runtime Health Alert Decision"));
  assert(rendered.includes("severity: `warning`"));
  assert(rendered.includes("decision path: `runtime/discordos/runtime-health-alerts/decision.json`"));
  assert(rendered.includes("runtime_health_latest_stale"));
});
