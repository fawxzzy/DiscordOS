const { _internals: proofInternals } = require("./runtime-health-proof");
const { _internals: checkInternals } = require("./runtime-health-check");
const { _internals: alertInternals } = require("./runtime-health-alert");

function parseArgs(args) {
  const options = {
    endpoint: proofInternals.DEFAULT_ENDPOINT,
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    maxSnapshotAgeHours: 24,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    scheduleName: "manual",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--endpoint") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_endpoint_value");
      }
      options.endpoint = value.trim();
      index += 1;
    } else if (arg === "--snapshot-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_snapshot_dir_value");
      }
      options.snapshotDir = require("node:path").resolve(value.trim());
      index += 1;
    } else if (arg === "--alert-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_alert_dir_value");
      }
      options.alertDir = require("node:path").resolve(value.trim());
      index += 1;
    } else if (arg === "--max-age-hours") {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("invalid_max_age_hours");
      }
      options.maxSnapshotAgeHours = value;
      index += 1;
    } else if (arg === "--min-readiness-percent") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        throw new Error("invalid_min_readiness_percent");
      }
      options.minReadinessPercent = value;
      index += 1;
    } else if (arg === "--stale-severity") {
      const value = args[index + 1];
      if (value !== "warning" && value !== "critical") {
        throw new Error("invalid_stale_severity");
      }
      options.staleSeverity = value;
      index += 1;
    } else if (arg === "--schedule-name") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_schedule_name_value");
      }
      options.scheduleName = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function classifyScheduledProofEvent(result) {
  return {
    type: result.ok
      ? "discordos.runtime_health.scheduled_proof_pass"
      : "discordos.runtime_health.scheduled_proof_fail",
    severity: result.ok ? "info" : result.alert.severity === "critical" ? "error" : "warning",
    subject: "discordos.runtime",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      scheduleName: result.scheduleName,
      endpoint: result.endpoint,
      checkOk: result.check.ok,
      alertOk: result.alert.ok,
      alertSeverity: result.alert.severity,
      reasonCodeCount: result.alert.event.reasonCodes.length,
    },
  };
}

async function runRuntimeHealthScheduledProof({
  endpoint,
  snapshotDir,
  alertDir,
  maxSnapshotAgeHours,
  minReadinessPercent,
  staleSeverity,
  scheduleName = "manual",
  fetchImpl = fetch,
  now,
}) {
  const startedAt = new Date().toISOString();
  const check = await checkInternals.runRuntimeHealthCheck({
    endpoint,
    snapshotDir,
    maxSnapshotAgeHours,
    fetchImpl,
    now,
  });
  const alert = alertInternals.decideRuntimeHealthAlert(check.summary, {
    minReadinessPercent,
    staleSeverity,
  });
  const alertDecision = await alertInternals.writeRuntimeHealthAlertDecision(alert, { alertDir });
  const completedAt = new Date().toISOString();
  const result = {
    ok: check.ok && alertDecision.ok,
    scheduleName,
    endpoint,
    startedAt,
    completedAt,
    artifacts: {
      runtimeHealthSnapshotPath: check.snapshotPath,
      alertDecisionPath: alertDecision.decisionPath,
    },
    check: {
      ok: check.ok,
      httpStatus: check.proof.httpStatus,
      posture: check.summary.latest?.posture || null,
      readinessPercent: check.summary.latest?.readinessPercent ?? null,
      fresh: check.summary.latest?.fresh === true,
      blockedReasons: check.summary.latest?.blockedReasons || [],
    },
    alert: alertDecision,
  };

  return {
    ...result,
    event: classifyScheduledProofEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Runtime Health Scheduled Proof",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- schedule name: \`${result.scheduleName}\``,
    `- endpoint: \`${result.endpoint}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- runtime health snapshot: \`${result.artifacts.runtimeHealthSnapshotPath}\``,
    `- alert decision snapshot: \`${result.artifacts.alertDecisionPath}\``,
    `- check result: \`${result.check.ok ? "pass" : "fail"}\``,
    `- alert result: \`${result.alert.ok ? "pass" : "fail"}\``,
    `- alert severity: \`${result.alert.severity}\``,
    `- reason codes: \`${result.alert.event.reasonCodes.join(",") || "none"}\``,
    `- latest posture: \`${result.check.posture || "unknown"}\``,
    `- latest readiness percent: \`${result.check.readinessPercent ?? "unknown"}\``,
    `- latest fresh: \`${result.check.fresh ? "true" : "false"}\``,
    `- latest blocked reasons: \`${result.check.blockedReasons.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runRuntimeHealthScheduledProof(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) {
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
    classifyScheduledProofEvent,
    runRuntimeHealthScheduledProof,
    renderMarkdown,
  },
};
