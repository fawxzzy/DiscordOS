const fs = require("node:fs/promises");
const path = require("node:path");
const { _internals: proofInternals } = require("./runtime-health-proof");
const { _internals: summaryInternals } = require("./runtime-health-summary");

const DEFAULT_ALERT_DIR = path.resolve(__dirname, "..", "..", "..", "runtime", "discordos", "runtime-health-alerts");

function parseArgs(args) {
  const options = {
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: DEFAULT_ALERT_DIR,
    limit: 10,
    maxSnapshotAgeHours: 24,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    writeDecision: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--write-decision") {
      options.writeDecision = true;
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
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function decisionNameFromAlert(alert, writtenAt = new Date().toISOString()) {
  const rawGeneratedAt = alert.summary.latest?.generatedAt || writtenAt;
  const safeGeneratedAt = rawGeneratedAt.replace(/[:.]/g, "-");
  const safeWrittenAt = writtenAt.replace(/[:.]/g, "-");
  return `${safeGeneratedAt}-${safeWrittenAt}-${alert.severity}.json`;
}

function addDecision(decisions, severity, code, message, details = {}) {
  decisions.push({
    severity,
    code,
    message,
    details,
  });
}

function worseSeverity(left, right) {
  const ranks = {
    ok: 0,
    warning: 1,
    critical: 2,
  };
  return ranks[right] > ranks[left] ? right : left;
}

function decideRuntimeHealthAlert(summary, { minReadinessPercent = 100, staleSeverity = "warning" } = {}) {
  const decisions = [];

  if (!summary.latest) {
    addDecision(decisions, "critical", "runtime_health_snapshot_missing", "No runtime-health snapshots are available.");
  } else {
    if (summary.latest.ok !== true) {
      const latestSeverity = summary.latest.eventType === "discordos.runtime_health.action_required" ? "critical" : "warning";
      addDecision(decisions, latestSeverity, "runtime_health_latest_failed", "Latest runtime-health snapshot is failing.", {
        fileName: summary.latest.fileName,
        eventType: summary.latest.eventType,
      });
    }

    if (summary.latest.fresh !== true) {
      addDecision(decisions, staleSeverity, "runtime_health_latest_stale", "Latest runtime-health snapshot is stale.", {
        fileName: summary.latest.fileName,
        staleReason: summary.latest.staleReason,
        ageHours: summary.latest.ageHours,
        maxSnapshotAgeHours: summary.maxSnapshotAgeHours,
      });
    }

    if (
      Number.isInteger(summary.latest.readinessPercent) &&
      summary.latest.readinessPercent < minReadinessPercent
    ) {
      addDecision(decisions, "warning", "runtime_health_readiness_below_threshold", "Latest readiness is below threshold.", {
        readinessPercent: summary.latest.readinessPercent,
        minReadinessPercent,
      });
    }

    if (Array.isArray(summary.latest.blockedReasons) && summary.latest.blockedReasons.length > 0) {
      addDecision(decisions, "critical", "runtime_health_blocked_reasons_present", "Latest runtime-health snapshot has blocked reasons.", {
        blockedReasons: summary.latest.blockedReasons,
      });
    }
  }

  if (summary.failCount > 0) {
    addDecision(decisions, "warning", "runtime_health_history_has_failures", "Recent runtime-health history includes failures.", {
      failCount: summary.failCount,
      totalSnapshots: summary.totalSnapshots,
    });
  }

  const severity = decisions.reduce((current, decision) => worseSeverity(current, decision.severity), "ok");
  return {
    ok: severity === "ok",
    severity,
    event: {
      type: severity === "ok" ? "discordos.runtime_health.alert_clear" : "discordos.runtime_health.alert_triggered",
      severity,
      subject: "discordos.runtime",
      status: severity === "ok" ? "clear" : "active",
      reasonCodes: decisions.map((decision) => decision.code),
    },
    thresholds: {
      maxSnapshotAgeHours: summary.maxSnapshotAgeHours,
      minReadinessPercent,
      staleSeverity,
    },
    summary: {
      snapshotDir: summary.snapshotDir,
      totalSnapshots: summary.totalSnapshots,
      passCount: summary.passCount,
      failCount: summary.failCount,
      latest: summary.latest,
    },
    decisions,
  };
}

async function buildRuntimeHealthAlert({ snapshotDir, limit, maxSnapshotAgeHours, minReadinessPercent, staleSeverity, now }) {
  const records = await summaryInternals.loadRuntimeHealthSnapshots({ snapshotDir, limit });
  const summary = summaryInternals.summarizeRuntimeHealthSnapshots(records, {
    snapshotDir,
    requireLatestPass: false,
    requireFreshSnapshot: false,
    maxSnapshotAgeHours,
    now: now || new Date(),
  });

  return decideRuntimeHealthAlert(summary, {
    minReadinessPercent,
    staleSeverity,
  });
}

async function writeRuntimeHealthAlertDecision(alert, { alertDir }) {
  await fs.mkdir(alertDir, { recursive: true });
  const writtenAt = new Date().toISOString();
  const decisionPath = path.join(alertDir, decisionNameFromAlert(alert, writtenAt));
  const decision = {
    ...alert,
    decision: {
      path: decisionPath,
      writtenAt,
    },
  };

  await fs.writeFile(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
  return {
    ...decision,
    decisionPath,
  };
}

function renderMarkdown(alert) {
  const lines = [
    "# DiscordOS Runtime Health Alert Decision",
    "",
    `- result: \`${alert.ok ? "pass" : "fail"}\``,
    `- severity: \`${alert.severity}\``,
    `- event type: \`${alert.event.type}\``,
    `- event status: \`${alert.event.status}\``,
    `- reason codes: \`${alert.event.reasonCodes.join(",") || "none"}\``,
    `- decision path: \`${alert.decisionPath || "not-written"}\``,
    `- snapshot dir: \`${alert.summary.snapshotDir}\``,
    `- total snapshots: \`${alert.summary.totalSnapshots}\``,
    `- latest file: \`${alert.summary.latest?.fileName || "none"}\``,
    `- latest fresh: \`${alert.summary.latest?.fresh === true ? "true" : "false"}\``,
    `- latest posture: \`${alert.summary.latest?.posture || "unknown"}\``,
    `- latest readiness percent: \`${alert.summary.latest?.readinessPercent ?? "unknown"}\``,
    `- latest blocked reasons: \`${alert.summary.latest?.blockedReasons?.join(",") || "none"}\``,
    "",
    "## Decisions",
    "",
  ];

  if (alert.decisions.length === 0) {
    lines.push("- none");
  } else {
    for (const decision of alert.decisions) {
      lines.push(`- \`${decision.severity}\` \`${decision.code}\`: ${decision.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    let alert = await buildRuntimeHealthAlert(options);
    if (options.writeDecision) {
      alert = await writeRuntimeHealthAlertDecision(alert, { alertDir: options.alertDir });
    }
    process.stdout.write(options.json ? `${JSON.stringify(alert, null, 2)}\n` : renderMarkdown(alert));
    if (!alert.ok) {
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
    DEFAULT_ALERT_DIR,
    decisionNameFromAlert,
    decideRuntimeHealthAlert,
    buildRuntimeHealthAlert,
    writeRuntimeHealthAlertDecision,
    renderMarkdown,
  },
};
