const path = require("node:path");
const { _internals: proofInternals } = require("./runtime-health-proof");
const { _internals: alertInternals } = require("./runtime-health-alert");
const { _internals: cronInternals } = require("./runtime-health-cron-production-proof");
const { _internals: admissionInternals } = require("./runtime-health-operations-admission");
const { _internals: targetAdmissionInternals } = require("./runtime-health-alert-target-admission");

function parseArgs(args) {
  const options = {
    json: false,
    baseUrl: cronInternals.DEFAULT_BASE_URL,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    limit: 20,
    keepCount: 50,
    keepDays: 30,
    probeLive: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--base-url") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_base_url_value");
      }
      options.baseUrl = value.trim().replace(/\/+$/, "");
      index += 1;
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
    } else if (arg === "--probe-live") {
      options.probeLive = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function determineNextActions({ cronProductionProof, operationsAdmission, alertTargetAdmission }) {
  const actions = [];

  if (!cronProductionProof.ok) {
    actions.push("restore_production_runtime_or_cron_guard");
  }

  if (operationsAdmission.decisions.scheduledProof.status === "admissible") {
    actions.push("capture_first_real_scheduled_cron_run_after_schedule");
  }

  if (!alertTargetAdmission.target.configured) {
    actions.push("configure_runtime_health_alert_target");
  } else if (!alertTargetAdmission.ok) {
    actions.push("repair_runtime_health_alert_target");
  }

  if (operationsAdmission.decisions.retentionEnforcement.status === "requires_confirmation") {
    actions.push("review_retention_enforcement");
  }

  if (actions.length === 0) {
    actions.push("continue_runtime_monitoring");
  }

  return actions;
}

function classifyStatusEvent(status) {
  return {
    type: status.ok
      ? "discordos.runtime_health.status_ready"
      : "discordos.runtime_health.status_action_required",
    severity: status.ok ? "info" : "warning",
    subject: "discordos.runtime",
    status: status.ok ? "pass" : "fail",
    dimensions: {
      runtimeHealthPosture: status.runtimeHealth.posture,
      readinessPercent: status.runtimeHealth.readinessPercent,
      cronPubliclyLocked: status.cron.publiclyLocked,
      alertTargetType: status.alertTarget.type,
      alertTargetConfigured: status.alertTarget.configured,
      retentionEnforcement: status.operations.retentionEnforcement,
      nextActionCount: status.nextActions.length,
    },
  };
}

async function buildRuntimeHealthStatus({
  baseUrl,
  snapshotDir,
  alertDir,
  limit,
  keepCount,
  keepDays,
  probeLive,
  env = process.env,
  fetchImpl = fetch,
}) {
  const [cronProductionProof, operationsAdmission, alertTargetAdmission] = await Promise.all([
    cronInternals.buildRuntimeHealthCronProductionProof({
      baseUrl,
      fetchImpl,
    }),
    admissionInternals.buildRuntimeHealthOperationsAdmission({
      snapshotDir,
      alertDir,
      limit,
      keepCount,
      keepDays,
      env,
    }),
    targetAdmissionInternals.buildRuntimeHealthAlertTargetAdmission({
      env,
      probeLive,
      fetchImpl,
    }),
  ]);

  const nextActions = determineNextActions({
    cronProductionProof,
    operationsAdmission,
    alertTargetAdmission,
  });
  const status = {
    ok: cronProductionProof.ok && operationsAdmission.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    baseUrl: cronProductionProof.baseUrl,
    runtimeHealth: {
      httpStatus: cronProductionProof.runtimeHealth.status,
      posture: cronProductionProof.runtimeHealth.posture,
      readinessPercent: cronProductionProof.runtimeHealth.readinessPercent,
      blockedReasons: cronProductionProof.runtimeHealth.blockedReasons,
      liveCutover: cronProductionProof.runtimeHealth.liveCutover,
      fitnessTrafficMoved: cronProductionProof.runtimeHealth.fitnessTrafficMoved,
    },
    cron: {
      httpStatus: cronProductionProof.cron.status,
      publiclyLocked: cronProductionProof.cron.publiclyLocked,
      error: cronProductionProof.cron.error,
    },
    alertTarget: {
      ok: alertTargetAdmission.ok,
      type: alertTargetAdmission.target.type,
      configured: alertTargetAdmission.target.configured,
      shapeValid: alertTargetAdmission.target.shapeValid,
      liveProbeAttempted: alertTargetAdmission.liveProbe.attempted,
      liveProbeStatus: alertTargetAdmission.liveProbe.status,
      reasonCodes: alertTargetAdmission.reasonCodes,
    },
    operations: {
      retentionEnforcement: operationsAdmission.decisions.retentionEnforcement.status,
      scheduledProof: operationsAdmission.decisions.scheduledProof.status,
      alertDelivery: operationsAdmission.decisions.alertDelivery.status,
      alertDeliveryReasons: operationsAdmission.decisions.alertDelivery.reasonCodes,
      retentionEligibleForReview: operationsAdmission.retention.eligibleForReview,
      latestAlertEventType: operationsAdmission.rollup.latestAlertEventType,
    },
    nextActions,
  };

  return {
    ...status,
    event: classifyStatusEvent(status),
  };
}

function renderMarkdown(status) {
  const lines = [
    "# DiscordOS Runtime Health Status",
    "",
    `- result: \`${status.ok ? "pass" : "fail"}\``,
    `- destructive: \`${status.destructive ? "true" : "false"}\``,
    `- sends messages: \`${status.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${status.writesArtifacts ? "true" : "false"}\``,
    `- event type: \`${status.event.type}\``,
    `- event severity: \`${status.event.severity}\``,
    `- base url: \`${status.baseUrl}\``,
    `- runtime health status: \`${status.runtimeHealth.httpStatus}\``,
    `- runtime health posture: \`${status.runtimeHealth.posture || "unknown"}\``,
    `- runtime health readiness percent: \`${status.runtimeHealth.readinessPercent ?? "unknown"}\``,
    `- runtime health blocked reasons: \`${status.runtimeHealth.blockedReasons.join(",") || "none"}\``,
    `- live cutover: \`${status.runtimeHealth.liveCutover ? "true" : "false"}\``,
    `- fitness traffic moved: \`${status.runtimeHealth.fitnessTrafficMoved ? "true" : "false"}\``,
    `- cron status: \`${status.cron.httpStatus}\``,
    `- cron publicly locked: \`${status.cron.publiclyLocked ? "true" : "false"}\``,
    `- alert target type: \`${status.alertTarget.type}\``,
    `- alert target configured: \`${status.alertTarget.configured ? "true" : "false"}\``,
    `- alert target shape valid: \`${status.alertTarget.shapeValid ? "true" : "false"}\``,
    `- alert target live probe status: \`${status.alertTarget.liveProbeStatus}\``,
    `- alert target reasons: \`${status.alertTarget.reasonCodes.join(",") || "none"}\``,
    `- retention enforcement: \`${status.operations.retentionEnforcement}\``,
    `- scheduled proof: \`${status.operations.scheduledProof}\``,
    `- alert delivery: \`${status.operations.alertDelivery}\``,
    `- next actions: \`${status.nextActions.join(",")}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const status = await buildRuntimeHealthStatus(options);
    process.stdout.write(options.json ? `${JSON.stringify(status, null, 2)}\n` : renderMarkdown(status));
    if (!status.ok) {
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
    determineNextActions,
    classifyStatusEvent,
    buildRuntimeHealthStatus,
    renderMarkdown,
  },
};
