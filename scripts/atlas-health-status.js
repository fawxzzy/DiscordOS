const path = require("node:path");
const {
  _internals: atlasHealthInternals,
} = require("./atlas-health-watch");

function parseArgs(args) {
  const options = {
    json: false,
    configPath: atlasHealthInternals.DEFAULT_CONFIG_PATH,
    timeoutMs: atlasHealthInternals.DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_config_value");
      }
      options.configPath = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--timeout-ms") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 100 || value > 60000) {
        throw new Error("invalid_timeout_ms");
      }
      options.timeoutMs = value;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function flagEnabled(env, name) {
  return env[name] === "enabled";
}

function buildAlertReadiness({ env = process.env } = {}) {
  const target = atlasHealthInternals.getAlertTarget(env);
  const watchEnabled = flagEnabled(env, "DISCORDOS_ATLAS_HEALTH_WATCH_ENABLED");
  const alertSendEnabled = flagEnabled(env, "DISCORDOS_ATLAS_HEALTH_ALERT_SEND");
  const reasonCodes = [];

  if (!watchEnabled) {
    reasonCodes.push("atlas_health_watch_env_disabled");
  }
  if (!alertSendEnabled) {
    reasonCodes.push("atlas_health_alert_send_env_disabled");
  }
  if (!target.configured) {
    reasonCodes.push("atlas_health_alert_target_missing");
  }

  return {
    ready: watchEnabled && alertSendEnabled && target.configured,
    watchEnabled,
    alertSendEnabled,
    targetConfigured: target.configured,
    targetType: target.type,
    reasonCodes,
  };
}

function determineNextActions({ watch, alertReadiness }) {
  const actions = [];

  if (!watch.ok) {
    actions.push("inspect_critical_atlas_health_targets");
  }
  if (!alertReadiness.watchEnabled) {
    actions.push("enable_discordos_atlas_health_watch_env");
  }
  if (!alertReadiness.alertSendEnabled) {
    actions.push("enable_discordos_atlas_health_alert_send_env");
  }
  if (!alertReadiness.targetConfigured) {
    actions.push("configure_atlas_health_alert_target");
  }
  if (actions.length === 0) {
    actions.push("continue_atlas_health_monitoring");
  }

  return actions;
}

function summarizeWatchCadence(watch) {
  const runDays = Array.isArray(watch.usageEstimate?.runDays)
    ? watch.usageEstimate.runDays
    : [];
  const timezone = watch.usageEstimate?.timezone || "unknown";
  const configuredSchedule = watch.usageEstimate?.configuredSchedule || "unknown";
  const cadenceStatus = watch.skipped === true && watch.skipReason === "atlas_health_schedule_not_due"
    ? "schedule_not_due"
    : "checked";

  return {
    status: cadenceStatus,
    configuredSchedule,
    runDays,
    timezone,
    skipped: watch.skipped === true,
    skipReason: watch.skipReason || null,
  };
}

function classifyAtlasHealthStatusEvent(status) {
  return {
    type: status.ok ? "atlas.health_status.ready" : "atlas.health_status.action_required",
    severity: status.ok ? "info" : "warning",
    subject: "atlas.health",
    status: status.ok ? "pass" : "fail",
    dimensions: {
      healthWatchStatus: status.watch.ok ? "pass" : "fail",
      cadenceStatus: status.watch.cadenceStatus,
      skipped: status.watch.skipped === true,
      targetCount: status.watch.targetCount,
      criticalCount: status.watch.criticalCount,
      alertReady: status.alertReadiness.ready,
      nextActionCount: status.nextActions.length,
    },
  };
}

async function buildAtlasHealthStatus({
  configPath = atlasHealthInternals.DEFAULT_CONFIG_PATH,
  timeoutMs = atlasHealthInternals.DEFAULT_TIMEOUT_MS,
  env = process.env,
  fetchImpl = fetch,
  fsImpl,
  now = new Date(),
} = {}) {
  const watch = await atlasHealthInternals.buildAtlasHealthWatch({
    configPath,
    timeoutMs,
    env,
    fetchImpl,
    fsImpl,
    now,
    send: false,
  });
  const alertReadiness = buildAlertReadiness({ env });
  const nextActions = determineNextActions({ watch, alertReadiness });
  const cadence = summarizeWatchCadence(watch);
  const status = {
    ok: watch.ok && alertReadiness.ready,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    generatedAt: now.toISOString(),
    watch: {
      ok: watch.ok,
      eventType: watch.event.type,
      skipped: cadence.skipped,
      skipReason: cadence.skipReason,
      cadenceStatus: cadence.status,
      targetCount: watch.targetCount,
      passCount: watch.passCount,
      failCount: watch.failCount,
      criticalCount: watch.criticalCount,
      criticalTargets: watch.criticalTargets.map((target) => ({
        id: target.id,
        owner: target.owner,
        reasonCodes: target.reasonCodes,
      })),
      targetFilter: watch.targetFilter,
      usageEstimate: watch.usageEstimate,
      configuredSchedule: cadence.configuredSchedule,
      runDays: cadence.runDays,
      timezone: cadence.timezone,
      alertDeliveryDryRunStatus: watch.alertDelivery.status,
      alertDeliveryDryRunReasonCodes: watch.alertDelivery.reasonCodes,
    },
    alertReadiness,
    nextActions,
  };

  return {
    ...status,
    event: classifyAtlasHealthStatusEvent(status),
  };
}

function renderMarkdown(status) {
  const lines = [
    "# ATLAS Health Status",
    "",
    `- result: \`${status.ok ? "pass" : "fail"}\``,
    `- destructive: \`${status.destructive ? "true" : "false"}\``,
    `- sends messages: \`${status.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${status.writesArtifacts ? "true" : "false"}\``,
    `- event type: \`${status.event.type}\``,
    `- event severity: \`${status.event.severity}\``,
    `- next actions: \`${status.nextActions.join(",")}\``,
    "",
    "## Watch",
    "",
    `- result: \`${status.watch.ok ? "pass" : "fail"}\``,
    `- event type: \`${status.watch.eventType}\``,
    `- cadence status: \`${status.watch.cadenceStatus}\``,
    `- skipped: \`${status.watch.skipped ? "true" : "false"}\``,
    `- skip reason: \`${status.watch.skipReason || "none"}\``,
    `- targets: \`${status.watch.targetCount}\``,
    `- passing: \`${status.watch.passCount}\``,
    `- failing: \`${status.watch.failCount}\``,
    `- critical: \`${status.watch.criticalCount}\``,
    `- configured schedule: \`${status.watch.configuredSchedule}\``,
    `- run days: \`${Array.isArray(status.watch.runDays) ? status.watch.runDays.join(",") || "all" : "all"}\``,
    `- timezone: \`${status.watch.timezone || "unknown"}\``,
    `- runs per month: \`${status.watch.usageEstimate.runsPerMonth}\``,
    `- target checks per month: \`${status.watch.usageEstimate.targetChecksPerMonth}\``,
    `- dry-run delivery status: \`${status.watch.alertDeliveryDryRunStatus}\``,
    `- dry-run delivery reason codes: \`${status.watch.alertDeliveryDryRunReasonCodes.join(",") || "none"}\``,
    `- target filter active: \`${status.watch.targetFilter?.active === true ? "true" : "false"}\``,
    `- original targets: \`${status.watch.targetFilter?.originalTargetCount ?? status.watch.targetCount}\``,
    `- allowlist targets: \`${status.watch.targetFilter?.allowlistIds?.join(",") || "none"}\``,
    `- excluded targets: \`${status.watch.targetFilter?.excludeIds?.join(",") || "none"}\``,
    "",
    "## Alert Readiness",
    "",
    `- ready: \`${status.alertReadiness.ready ? "true" : "false"}\``,
    `- watch env enabled: \`${status.alertReadiness.watchEnabled ? "true" : "false"}\``,
    `- alert send env enabled: \`${status.alertReadiness.alertSendEnabled ? "true" : "false"}\``,
    `- target configured: \`${status.alertReadiness.targetConfigured ? "true" : "false"}\``,
    `- target type: \`${status.alertReadiness.targetType}\``,
    `- reason codes: \`${status.alertReadiness.reasonCodes.join(",") || "none"}\``,
  ];

  for (const target of status.watch.criticalTargets) {
    lines.push(`- critical target: \`${target.id}\` owner=\`${target.owner}\` reasons=\`${target.reasonCodes.join(",")}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const status = await buildAtlasHealthStatus(options);
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
    flagEnabled,
    buildAlertReadiness,
    determineNextActions,
    summarizeWatchCadence,
    classifyAtlasHealthStatusEvent,
    buildAtlasHealthStatus,
    renderMarkdown,
  },
};
