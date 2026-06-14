const path = require("node:path");
const { _internals: proofInternals } = require("./runtime-health-proof");
const { _internals: alertInternals } = require("./runtime-health-alert");
const { _internals: rollupInternals } = require("./runtime-health-artifact-rollup");
const { _internals: retentionInternals } = require("./runtime-health-retention-plan");
const { _internals: targetAdmissionInternals } = require("./runtime-health-alert-target-admission");
const { _internals: receiptStateInternals } = require("./discordos-receipt-state");

function parseArgs(args) {
  const options = {
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    limit: 20,
    keepCount: 50,
    keepDays: 30,
    docsDir: receiptStateInternals.DEFAULT_RECEIPT_DIR,
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
    } else if (arg === "--keep-count") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("invalid_keep_count");
      }
      options.keepCount = value;
      index += 1;
    } else if (arg === "--keep-days") {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("invalid_keep_days");
      }
      options.keepDays = value;
      index += 1;
    } else if (arg === "--docs-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_docs_dir_value");
      }
      options.docsDir = path.resolve(value.trim());
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function getAlertTargetAdmission(env) {
  return targetAdmissionInternals.getConfiguredTarget(env);
}

function decideRetentionEnforcement(retentionPlan) {
  if (!retentionPlan.ok) {
    return {
      status: "blocked",
      reasonCodes: ["retention_plan_unavailable"],
    };
  }

  if (retentionPlan.totals.eligibleForReview === 0) {
    return {
      status: "not_needed",
      reasonCodes: ["no_artifacts_eligible_for_review"],
    };
  }

  return {
    status: "requires_confirmation",
    reasonCodes: ["destructive_retention_requires_operator_confirmation"],
    eligibleForReview: retentionPlan.totals.eligibleForReview,
  };
}

function decideScheduledProof(rollup, receiptState = receiptStateInternals.classifyReceiptState([])) {
  if (!rollup.ok) {
    return {
      status: "blocked",
      reasonCodes: ["latest_runtime_health_not_green"],
    };
  }

  if (receiptState.scheduledCronAuditProof) {
    return {
      status: "satisfied",
      reasonCodes: [
        "scheduled_cron_audit_proof_receipt_present",
        "latest_runtime_health_green",
        "latest_alert_clear",
      ],
    };
  }

  return {
    status: "admissible",
    reasonCodes: ["latest_runtime_health_green", "latest_alert_clear"],
  };
}

function decideAlertDelivery({ rollup, env }) {
  if (!rollup.ok) {
    return {
      status: "blocked",
      reasonCodes: ["latest_runtime_health_not_green"],
    };
  }

  const target = getAlertTargetAdmission(env);
  if (!target.configured) {
    return {
      status: "blocked",
      targetType: target.type,
      reasonCodes: target.reasonCodes,
    };
  }

  return {
    status: "admissible",
    targetType: target.type,
    reasonCodes: ["alert_delivery_target_present", "latest_alert_clear"],
  };
}

function buildAdmissionPlan({
  rollup,
  retentionPlan,
  env = process.env,
  receiptState = receiptStateInternals.classifyReceiptState([]),
}) {
  const decisions = {
    retentionEnforcement: decideRetentionEnforcement(retentionPlan),
    scheduledProof: decideScheduledProof(rollup, receiptState),
    alertDelivery: decideAlertDelivery({ rollup, env }),
  };

  return {
    ok: rollup.ok === true && retentionPlan.ok === true,
    destructive: false,
    schedulerInstalled: false,
    alertDelivered: false,
    rollup: {
      ok: rollup.ok,
      latestHealthPosture: rollup.health.latest?.posture || null,
      latestHealthReadinessPercent: rollup.health.latest?.readinessPercent ?? null,
      latestAlertSeverity: rollup.alerts.latest?.severity || null,
      latestAlertEventType: rollup.alerts.latest?.eventType || null,
    },
    retention: {
      artifacts: retentionPlan.totals.artifacts,
      retain: retentionPlan.totals.retain,
      eligibleForReview: retentionPlan.totals.eligibleForReview,
      policyAction: retentionPlan.policy.action,
      keepCount: retentionPlan.policy.keepCount,
      keepDays: retentionPlan.policy.keepDays,
    },
    receiptState: {
      scheduledCronAuditProof: receiptState.scheduledCronAuditProof === true,
    },
    decisions,
  };
}

async function buildRuntimeHealthOperationsAdmission(options) {
  const [rollup, retentionPlan, receiptState] = await Promise.all([
    rollupInternals.buildRuntimeHealthArtifactRollup({
      snapshotDir: options.snapshotDir,
      alertDir: options.alertDir,
      limit: options.limit,
    }),
    retentionInternals.buildRuntimeHealthRetentionPlan({
      snapshotDir: options.snapshotDir,
      alertDir: options.alertDir,
      keepCount: options.keepCount,
      keepDays: options.keepDays,
    }),
    receiptStateInternals.readReceiptState(options.docsDir),
  ]);

  return buildAdmissionPlan({
    rollup,
    retentionPlan,
    env: options.env || process.env,
    receiptState,
  });
}

function renderMarkdown(plan) {
  const lines = [
    "# DiscordOS Runtime Health Operations Admission",
    "",
    `- result: \`${plan.ok ? "pass" : "fail"}\``,
    `- destructive: \`${plan.destructive ? "true" : "false"}\``,
    `- scheduler installed: \`${plan.schedulerInstalled ? "true" : "false"}\``,
    `- alert delivered: \`${plan.alertDelivered ? "true" : "false"}\``,
    `- latest health posture: \`${plan.rollup.latestHealthPosture || "unknown"}\``,
    `- latest health readiness percent: \`${plan.rollup.latestHealthReadinessPercent ?? "unknown"}\``,
    `- latest alert severity: \`${plan.rollup.latestAlertSeverity || "unknown"}\``,
    `- latest alert event type: \`${plan.rollup.latestAlertEventType || "unknown"}\``,
    `- retention policy action: \`${plan.retention.policyAction}\``,
    `- retention eligible for review: \`${plan.retention.eligibleForReview}\``,
    `- scheduled cron audit proof receipt: \`${plan.receiptState.scheduledCronAuditProof ? "true" : "false"}\``,
    `- retention enforcement: \`${plan.decisions.retentionEnforcement.status}\``,
    `- scheduled proof: \`${plan.decisions.scheduledProof.status}\``,
    `- scheduled proof reasons: \`${plan.decisions.scheduledProof.reasonCodes.join(",") || "none"}\``,
    `- alert delivery: \`${plan.decisions.alertDelivery.status}\``,
    `- alert delivery target type: \`${plan.decisions.alertDelivery.targetType || "unknown"}\``,
    `- alert delivery reasons: \`${plan.decisions.alertDelivery.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const plan = await buildRuntimeHealthOperationsAdmission(options);
    process.stdout.write(options.json ? `${JSON.stringify(plan, null, 2)}\n` : renderMarkdown(plan));
    if (!plan.ok) {
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
    getAlertTargetAdmission,
    decideRetentionEnforcement,
    decideScheduledProof,
    decideAlertDelivery,
    buildAdmissionPlan,
    buildRuntimeHealthOperationsAdmission,
    renderMarkdown,
  },
};
