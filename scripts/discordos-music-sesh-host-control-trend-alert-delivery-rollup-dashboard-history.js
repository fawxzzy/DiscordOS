const {
  _internals: dashboardInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-delivery-history-rollup-dashboard");

function parseArgs(args) {
  return dashboardInternals.parseArgs(args);
}

function buildTrendAlertDeliveryRollupDashboardHistory(dashboardResult) {
  const dashboard = dashboardResult.dashboard;
  return {
    historyStatus: "bounded_ready",
    recordCount: 1,
    maxRecords: 10,
    records: [
      {
        statusLine: dashboard.statusLine,
        rollupStatus: dashboard.rollupStatus,
        routeCount: dashboard.routeCount,
        alertLevelCount: dashboard.alertLevelCount,
        routesVisible: dashboard.routesVisible === true,
        alertLevelsVisible: dashboard.alertLevelsVisible === true,
        deliveryDecisionVisible: dashboard.deliveryDecisionVisible === true,
        noSendBoundaryConfirmed: dashboard.noSendBoundaryConfirmed === true,
        noPlaybackBoundaryConfirmed: dashboard.noPlaybackBoundaryConfirmed === true,
        noProviderBoundaryConfirmed: dashboard.noProviderBoundaryConfirmed === true,
      },
    ],
    repeatsTracked: true,
    sendsMessagesInHistory: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryRollupDashboardHistory({ dashboardResult, history }) {
  const reasonCodes = [...dashboardResult.reasonCodes];
  if (history.historyStatus !== "bounded_ready" || history.recordCount < 1 || history.recordCount > history.maxRecords) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_bounds_failed");
  }
  if (!history.repeatsTracked || !Array.isArray(history.records) || history.records.length !== history.recordCount) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_tracking_failed");
  }
  if (!history.records.every((record) =>
    record.statusLine === "ready"
      && record.rollupStatus === "rollup_ready"
      && record.routesVisible
      && record.alertLevelsVisible
      && record.deliveryDecisionVisible
      && record.noSendBoundaryConfirmed
      && record.noPlaybackBoundaryConfirmed
      && record.noProviderBoundaryConfirmed
  )) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_record_invalid");
  }
  if (history.sendsMessagesInHistory || history.callsDiscordApi || dashboardResult.sendsMessages || dashboardResult.callsDiscordApi) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_send_attempted");
  }
  if (history.executesStorageWrite || dashboardResult.executesStorageWrite) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_storage_write_attempted");
  }
  if (dashboardResult.controlsPlayback || dashboardResult.callsMusicProviders) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_runtime_boundary_failed");
  }
  if (dashboardResult.slashCommandsAdmitted || history.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistory(input = {}) {
  const dashboardResult = await dashboardInternals.buildMusicSeshHostControlTrendAlertDeliveryHistoryRollupDashboard(input);
  const history = buildTrendAlertDeliveryRollupDashboardHistory(dashboardResult);
  const reasonCodes = validateTrendAlertDeliveryRollupDashboardHistory({ dashboardResult, history });
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
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_ready" : "blocked",
    sourceStatus: dashboardResult.status,
    history,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        recordCount: history.recordCount,
        historyStatus: history.historyStatus,
        repeatsTracked: history.repeatsTracked,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery Rollup Dashboard History",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- history status: \`${result.history.historyStatus}\``,
    `- record count: \`${result.history.recordCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistory(options);
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
    buildTrendAlertDeliveryRollupDashboardHistory,
    validateTrendAlertDeliveryRollupDashboardHistory,
    buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistory,
    renderMarkdown,
  },
};
