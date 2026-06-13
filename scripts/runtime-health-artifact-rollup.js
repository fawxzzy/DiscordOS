const fs = require("node:fs/promises");
const path = require("node:path");
const { _internals: proofInternals } = require("./runtime-health-proof");
const { _internals: alertInternals } = require("./runtime-health-alert");

function parseArgs(args) {
  const options = {
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    limit: 20,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--snapshot-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_snapshot_dir_value");
      }
      options.snapshotDir = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--alert-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_alert_dir_value");
      }
      options.alertDir = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--limit") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("invalid_limit");
      }
      options.limit = value;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function artifactSortValue(record) {
  return (
    record.payload?.summary?.generatedAt ||
    record.payload?.decision?.writtenAt ||
    record.payload?.snapshot?.writtenAt ||
    record.fileName
  );
}

async function loadJsonArtifacts(dir, limit) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(dir, entry.name);
    const raw = await fs.readFile(filePath, "utf8");
    records.push({
      filePath,
      fileName: entry.name,
      payload: JSON.parse(raw),
    });
  }

  return records
    .sort((left, right) => artifactSortValue(right).localeCompare(artifactSortValue(left)))
    .slice(0, limit);
}

function summarizeArtifactRollup({ snapshotDir, alertDir, healthRecords, alertRecords }) {
  const latestHealth = healthRecords[0] || null;
  const latestAlert = alertRecords[0] || null;
  const healthPassCount = healthRecords.filter((record) => record.payload?.ok === true).length;
  const healthFailCount = healthRecords.length - healthPassCount;
  const alertClearCount = alertRecords.filter((record) => record.payload?.event?.type === "discordos.runtime_health.alert_clear").length;
  const alertTriggeredCount = alertRecords.filter(
    (record) => record.payload?.event?.type === "discordos.runtime_health.alert_triggered"
  ).length;
  const latestHealthOk = latestHealth?.payload?.ok === true;
  const latestAlertOk = latestAlert?.payload?.ok === true;
  const ok = healthRecords.length > 0 && alertRecords.length > 0 && latestHealthOk && latestAlertOk;

  return {
    ok,
    snapshotDir,
    alertDir,
    health: {
      total: healthRecords.length,
      passCount: healthPassCount,
      failCount: healthFailCount,
      latest: latestHealth
        ? {
            fileName: latestHealth.fileName,
            ok: latestHealthOk,
            posture: latestHealth.payload?.summary?.posture || null,
            readinessPercent: latestHealth.payload?.summary?.readinessPercent ?? null,
            eventType: latestHealth.payload?.event?.type || null,
            generatedAt: latestHealth.payload?.summary?.generatedAt || null,
          }
        : null,
    },
    alerts: {
      total: alertRecords.length,
      clearCount: alertClearCount,
      triggeredCount: alertTriggeredCount,
      latest: latestAlert
        ? {
            fileName: latestAlert.fileName,
            ok: latestAlertOk,
            severity: latestAlert.payload?.severity || null,
            eventType: latestAlert.payload?.event?.type || null,
            status: latestAlert.payload?.event?.status || null,
            reasonCodes: latestAlert.payload?.event?.reasonCodes || [],
            writtenAt: latestAlert.payload?.decision?.writtenAt || null,
          }
        : null,
    },
  };
}

async function buildRuntimeHealthArtifactRollup({ snapshotDir, alertDir, limit }) {
  const [healthRecords, alertRecords] = await Promise.all([
    loadJsonArtifacts(snapshotDir, limit),
    loadJsonArtifacts(alertDir, limit),
  ]);

  return summarizeArtifactRollup({
    snapshotDir,
    alertDir,
    healthRecords,
    alertRecords,
  });
}

function renderMarkdown(rollup) {
  const lines = [
    "# DiscordOS Runtime Health Artifact Rollup",
    "",
    `- result: \`${rollup.ok ? "pass" : "fail"}\``,
    `- snapshot dir: \`${rollup.snapshotDir}\``,
    `- alert dir: \`${rollup.alertDir}\``,
    `- health artifacts: \`${rollup.health.total}\``,
    `- health pass count: \`${rollup.health.passCount}\``,
    `- health fail count: \`${rollup.health.failCount}\``,
    `- latest health file: \`${rollup.health.latest?.fileName || "none"}\``,
    `- latest health posture: \`${rollup.health.latest?.posture || "unknown"}\``,
    `- latest health readiness percent: \`${rollup.health.latest?.readinessPercent ?? "unknown"}\``,
    `- alert artifacts: \`${rollup.alerts.total}\``,
    `- alert clear count: \`${rollup.alerts.clearCount}\``,
    `- alert triggered count: \`${rollup.alerts.triggeredCount}\``,
    `- latest alert file: \`${rollup.alerts.latest?.fileName || "none"}\``,
    `- latest alert severity: \`${rollup.alerts.latest?.severity || "unknown"}\``,
    `- latest alert event type: \`${rollup.alerts.latest?.eventType || "unknown"}\``,
    `- latest alert reason codes: \`${rollup.alerts.latest?.reasonCodes?.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const rollup = await buildRuntimeHealthArtifactRollup(options);
    process.stdout.write(options.json ? `${JSON.stringify(rollup, null, 2)}\n` : renderMarkdown(rollup));
    if (!rollup.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  _internals: {
    parseArgs,
    loadJsonArtifacts,
    summarizeArtifactRollup,
    buildRuntimeHealthArtifactRollup,
    renderMarkdown,
  },
};
