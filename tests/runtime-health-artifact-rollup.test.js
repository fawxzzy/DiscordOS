const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-artifact-rollup");
const { _internals: proofInternals } = require("../scripts/runtime-health-proof");
const { _internals: alertInternals } = require("../scripts/runtime-health-alert");

function healthSnapshot({ ok = true, generatedAt = "2026-06-13T03:00:00.000Z" } = {}) {
  return {
    ok,
    summary: {
      posture: ok ? "operational" : "action_required",
      readinessPercent: ok ? 100 : 83,
      blockedReasons: ok ? [] : ["discord_bot_not_verified"],
      generatedAt,
    },
    event: {
      type: ok ? "discordos.runtime_health.operational" : "discordos.runtime_health.action_required",
      severity: ok ? "info" : "warning",
    },
  };
}

function alertDecision({ ok = true, writtenAt = "2026-06-13T03:01:00.000Z" } = {}) {
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

test("artifact rollup args default to runtime artifact directories", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    limit: 20,
  });
});

test("artifact rollup args support json custom dirs and limit", () => {
  assert.deepEqual(_internals.parseArgs([
    "--json",
    "--snapshot-dir",
    "tmp/health",
    "--alert-dir",
    "tmp/alerts",
    "--limit",
    "3",
  ]), {
    json: true,
    snapshotDir: path.resolve("tmp/health"),
    alertDir: path.resolve("tmp/alerts"),
    limit: 3,
  });
});

test("artifact rollup summarizes latest passing health and alert artifacts", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-rollup-health-"));
  const alertDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-rollup-alert-"));
  await writeJson(snapshotDir, "older-pass.json", healthSnapshot({ generatedAt: "2026-06-13T02:00:00.000Z" }));
  await writeJson(snapshotDir, "latest-pass.json", healthSnapshot({ generatedAt: "2026-06-13T03:00:00.000Z" }));
  await writeJson(alertDir, "older-ok.json", alertDecision({ writtenAt: "2026-06-13T02:01:00.000Z" }));
  await writeJson(alertDir, "latest-ok.json", alertDecision({ writtenAt: "2026-06-13T03:01:00.000Z" }));

  const rollup = await _internals.buildRuntimeHealthArtifactRollup({ snapshotDir, alertDir, limit: 20 });

  assert.equal(rollup.ok, true);
  assert.equal(rollup.health.total, 2);
  assert.equal(rollup.health.passCount, 2);
  assert.equal(rollup.health.latest.fileName, "latest-pass.json");
  assert.equal(rollup.alerts.total, 2);
  assert.equal(rollup.alerts.clearCount, 2);
  assert.equal(rollup.alerts.latest.fileName, "latest-ok.json");
});

test("artifact rollup fails when latest alert is triggered", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-rollup-health-"));
  const alertDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-rollup-alert-"));
  await writeJson(snapshotDir, "latest-pass.json", healthSnapshot());
  await writeJson(alertDir, "latest-triggered.json", alertDecision({ ok: false }));

  const rollup = await _internals.buildRuntimeHealthArtifactRollup({ snapshotDir, alertDir, limit: 20 });

  assert.equal(rollup.ok, false);
  assert.equal(rollup.alerts.triggeredCount, 1);
  assert.equal(rollup.alerts.latest.severity, "critical");
  assert.deepEqual(rollup.alerts.latest.reasonCodes, ["runtime_health_blocked_reasons_present"]);
});

test("artifact rollup fails when artifacts are missing", () => {
  const rollup = _internals.summarizeArtifactRollup({
    snapshotDir: "runtime/discordos/runtime-health",
    alertDir: "runtime/discordos/runtime-health-alerts",
    healthRecords: [],
    alertRecords: [],
  });

  assert.equal(rollup.ok, false);
  assert.equal(rollup.health.total, 0);
  assert.equal(rollup.alerts.total, 0);
});

test("artifact rollup renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    snapshotDir: "runtime/discordos/runtime-health",
    alertDir: "runtime/discordos/runtime-health-alerts",
    health: {
      total: 1,
      passCount: 1,
      failCount: 0,
      latest: {
        fileName: "latest-pass.json",
        posture: "operational",
        readinessPercent: 100,
      },
    },
    alerts: {
      total: 1,
      clearCount: 1,
      triggeredCount: 0,
      latest: {
        fileName: "latest-ok.json",
        severity: "ok",
        eventType: "discordos.runtime_health.alert_clear",
        reasonCodes: [],
      },
    },
  });

  assert(rendered.includes("# DiscordOS Runtime Health Artifact Rollup"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("alert clear count: `1`"));
});
