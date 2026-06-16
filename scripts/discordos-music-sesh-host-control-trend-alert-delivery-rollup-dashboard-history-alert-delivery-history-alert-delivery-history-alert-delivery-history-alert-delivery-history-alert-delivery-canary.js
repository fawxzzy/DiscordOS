const {
  _internals: alertingInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting");

function parseArgs(args) {
  return alertingInternals.parseArgs(args);
}

function buildTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(alertingResult) {
  const alerting = alertingResult.alerting;
  return {
    deliveryAdmissionStatus: alerting.alertRequired ? "admitted_no_send" : "no_alert_to_deliver",
    alertRequired: alerting.alertRequired === true,
    alertStatus: alerting.alertStatus,
    historyStatus: alerting.historyStatus,
    repeatedPatternVisible: alerting.repeatedPatternVisible === true,
    routesVisible: alerting.routesVisible === true,
    alertLevelsVisible: alerting.alertLevelsVisible === true,
    deliveryDecisionVisible: alerting.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: alerting.noSendBoundaryConfirmed === true,
    noPlaybackBoundaryConfirmed: alerting.noPlaybackBoundaryConfirmed === true,
    noProviderBoundaryConfirmed: alerting.noProviderBoundaryConfirmed === true,
    noDiscordApiBoundaryConfirmed: alerting.noDiscordApiBoundaryConfirmed === true,
    noStorageWriteBoundaryConfirmed: alerting.noStorageWriteBoundaryConfirmed === true,
    sendsMessagesInCanary: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary({ alertingResult, canary }) {
  const reasonCodes = [...alertingResult.reasonCodes];
  if (!canary.deliveryDecisionVisible || !canary.routesVisible || !canary.alertLevelsVisible || canary.historyStatus !== "bounded_ready" || !canary.repeatedPatternVisible) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_visibility_missing");
  }
  if (!canary.noPlaybackBoundaryConfirmed || !canary.noProviderBoundaryConfirmed || alertingResult.controlsPlayback || alertingResult.callsMusicProviders) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_runtime_boundary_failed");
  }
  if (!canary.noSendBoundaryConfirmed || !canary.noDiscordApiBoundaryConfirmed || canary.sendsMessagesInCanary || canary.callsDiscordApi || alertingResult.sendsMessages || alertingResult.callsDiscordApi) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_send_boundary_failed");
  }
  if (!canary.noStorageWriteBoundaryConfirmed || canary.executesStorageWrite || alertingResult.executesStorageWrite) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_storage_write_attempted");
  }
  if (canary.alertRequired && canary.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_admission_missing");
  }
  if (alertingResult.slashCommandsAdmitted || canary.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(input = {}) {
  const alertingResult = await alertingInternals.buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting(input);
  const canary = buildTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(alertingResult);
  const reasonCodes = validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary({ alertingResult, canary });
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
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_ready" : "blocked",
    sourceStatus: alertingResult.status,
    canary,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: canary.alertRequired,
        admission: canary.deliveryAdmissionStatus,
        routesVisible: canary.routesVisible,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery Rollup Dashboard History Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.canary.deliveryAdmissionStatus}\``,
    `- alert status: \`${result.canary.alertStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(options);
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
    buildTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary,
    validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary,
    buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary,
    renderMarkdown,
  },
};
