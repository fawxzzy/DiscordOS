const {
  _internals: historyInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history");

function parseArgs(args) {
  return historyInternals.parseArgs(args);
}

function buildTrendAlertDeliveryRollupDashboardHistoryAlerting(historyResult) {
  const history = historyResult.history;
  const records = Array.isArray(history.records) ? history.records : [];
  const alertRequired = records.length > 1;
  return {
    historyStatus: history.historyStatus,
    repeatedPatternVisible: history.repeatsTracked === true,
    recordCount: history.recordCount,
    alertRequired,
    alertStatus: alertRequired ? "attention_routed_no_send" : "not_required",
    routesVisible: records.every((record) => record.routesVisible === true),
    alertLevelsVisible: records.every((record) => record.alertLevelsVisible === true),
    deliveryDecisionVisible: records.every((record) => record.deliveryDecisionVisible === true),
    noSendBoundaryConfirmed: records.every((record) => record.noSendBoundaryConfirmed === true),
    noPlaybackBoundaryConfirmed: records.every((record) => record.noPlaybackBoundaryConfirmed === true),
    noProviderBoundaryConfirmed: records.every((record) => record.noProviderBoundaryConfirmed === true),
    sendsMessagesInAlerting: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryRollupDashboardHistoryAlerting({ historyResult, alerting }) {
  const reasonCodes = [...historyResult.reasonCodes];
  if (alerting.historyStatus !== "bounded_ready" || !alerting.repeatedPatternVisible || alerting.recordCount < 1) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alerting_history_invalid");
  }
  if (!alerting.routesVisible || !alerting.alertLevelsVisible || !alerting.deliveryDecisionVisible) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alerting_visibility_failed");
  }
  if (!alerting.noSendBoundaryConfirmed || alerting.sendsMessagesInAlerting || alerting.callsDiscordApi || historyResult.sendsMessages || historyResult.callsDiscordApi) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alerting_send_attempted");
  }
  if (alerting.executesStorageWrite || historyResult.executesStorageWrite) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alerting_storage_write_attempted");
  }
  if (!alerting.noPlaybackBoundaryConfirmed || !alerting.noProviderBoundaryConfirmed || historyResult.controlsPlayback || historyResult.callsMusicProviders) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alerting_runtime_boundary_failed");
  }
  if (alerting.alertRequired && alerting.alertStatus !== "attention_routed_no_send") {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alerting_route_missing");
  }
  if (historyResult.slashCommandsAdmitted || alerting.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alerting_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlerting(input = {}) {
  const historyResult = await historyInternals.buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistory(input);
  const alerting = buildTrendAlertDeliveryRollupDashboardHistoryAlerting(historyResult);
  const reasonCodes = validateTrendAlertDeliveryRollupDashboardHistoryAlerting({ historyResult, alerting });
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
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alerting_ready" : "blocked",
    sourceStatus: historyResult.status,
    alerting,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alerting_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alerting_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alerting",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: alerting.alertRequired,
        alertStatus: alerting.alertStatus,
        recordCount: alerting.recordCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery Rollup Dashboard History Alerting",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- alert required: \`${result.alerting.alertRequired ? "true" : "false"}\``,
    `- alert status: \`${result.alerting.alertStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlerting(options);
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
    buildTrendAlertDeliveryRollupDashboardHistoryAlerting,
    validateTrendAlertDeliveryRollupDashboardHistoryAlerting,
    buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlerting,
    renderMarkdown,
  },
};
