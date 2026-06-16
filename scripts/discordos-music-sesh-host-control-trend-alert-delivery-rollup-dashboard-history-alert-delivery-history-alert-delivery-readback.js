const {
  _internals: canaryInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryReadback(canaryResult) {
  const canary = canaryResult.canary;
  return {
    deliveryAdmissionStatus: canary.deliveryAdmissionStatus,
    alertRequired: canary.alertRequired === true,
    alertStatus: canary.alertStatus,
    historyStatus: canary.historyStatus,
    routesVisible: canary.routesVisible === true,
    alertLevelsVisible: canary.alertLevelsVisible === true,
    deliveryDecisionVisible: canary.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: canary.noSendBoundaryConfirmed === true,
    noPlaybackBoundaryConfirmed: canary.noPlaybackBoundaryConfirmed === true,
    noProviderBoundaryConfirmed: canary.noProviderBoundaryConfirmed === true,
    noDiscordApiBoundaryConfirmed: canary.callsDiscordApi === false && canaryResult.callsDiscordApi === false,
    noStorageWriteBoundaryConfirmed: canary.executesStorageWrite === false && canaryResult.executesStorageWrite === false,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryReadback({ canaryResult, readback }) {
  const reasonCodes = [...canaryResult.reasonCodes];
  if (!readback.deliveryDecisionVisible || !readback.routesVisible || !readback.alertLevelsVisible || readback.historyStatus !== "bounded_ready") {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback_visibility_missing");
  }
  if (!readback.noSendBoundaryConfirmed || !readback.noDiscordApiBoundaryConfirmed || canaryResult.sendsMessages || canaryResult.callsDiscordApi) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback_send_boundary_failed");
  }
  if (!readback.noStorageWriteBoundaryConfirmed || canaryResult.executesStorageWrite) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback_storage_write_attempted");
  }
  if (!readback.noPlaybackBoundaryConfirmed || !readback.noProviderBoundaryConfirmed || canaryResult.controlsPlayback || canaryResult.callsMusicProviders) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback_runtime_boundary_failed");
  }
  if (readback.alertRequired && readback.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback_admission_missing");
  }
  if (canaryResult.slashCommandsAdmitted || readback.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryReadback(input = {}) {
  const canaryResult = await canaryInternals.buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryCanary(input);
  const readback = buildTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryReadback(canaryResult);
  const reasonCodes = validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryReadback({ canaryResult, readback });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback_ready" : "blocked",
    sourceStatus: canaryResult.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: readback.alertRequired,
        admission: readback.deliveryAdmissionStatus,
        alertStatus: readback.alertStatus,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery Rollup Dashboard History Alert Delivery History Alert Delivery Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.readback.deliveryAdmissionStatus}\``,
    `- alert status: \`${result.readback.alertStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryReadback(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) process.exitCode = 1;
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
    buildTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryReadback,
    validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryReadback,
    buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryReadback,
    renderMarkdown,
  },
};
