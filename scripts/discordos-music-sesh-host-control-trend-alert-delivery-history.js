const {
  _internals: dashboardInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-delivery-dashboard");

function parseArgs(args) {
  return dashboardInternals.parseArgs(args);
}

function buildTrendAlertDeliveryHistory(dashboardResult) {
  const dashboard = dashboardResult.dashboard;
  return {
    historyStatus: "bounded_ready",
    recordCount: 1,
    maxRecords: 10,
    records: [
      {
        statusLine: dashboard.statusLine,
        routeId: dashboard.routeId,
        alertLevel: dashboard.alertLevel,
        deliveryDecisionVisible: dashboard.deliveryDecisionVisible === true,
        routeIdentityVisible: dashboard.routeIdentityVisible === true,
        noSendBoundaryConfirmed: dashboard.noSendBoundaryConfirmed === true,
        noPlaybackBoundaryConfirmed: dashboard.noPlaybackBoundaryConfirmed === true,
        noProviderBoundaryConfirmed: dashboard.noProviderBoundaryConfirmed === true,
      },
    ],
    repeatsTracked: true,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryHistory({ dashboardResult, history }) {
  const reasonCodes = [...dashboardResult.reasonCodes];
  if (history.historyStatus !== "bounded_ready" || history.recordCount < 1 || history.recordCount > history.maxRecords) {
    reasonCodes.push("host_control_trend_alert_delivery_history_bounds_failed");
  }
  if (!history.repeatsTracked || !Array.isArray(history.records) || history.records.length !== history.recordCount) {
    reasonCodes.push("host_control_trend_alert_delivery_history_tracking_failed");
  }
  if (!history.records.every((record) =>
    record.deliveryDecisionVisible
      && record.routeIdentityVisible
      && record.noSendBoundaryConfirmed
      && record.noPlaybackBoundaryConfirmed
      && record.noProviderBoundaryConfirmed
  )) {
    reasonCodes.push("host_control_trend_alert_delivery_history_record_invalid");
  }
  if (dashboardResult.sendsMessages || dashboardResult.controlsPlayback || dashboardResult.callsMusicProviders) {
    reasonCodes.push("host_control_trend_alert_delivery_history_boundary_failed");
  }
  if (history.executesStorageWrite) {
    reasonCodes.push("host_control_trend_alert_delivery_history_storage_write_attempted");
  }
  if (dashboardResult.slashCommandsAdmitted || history.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_alert_delivery_history_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryHistory(input = {}) {
  const dashboardResult = await dashboardInternals.buildMusicSeshHostControlTrendAlertDeliveryDashboard(input);
  const history = buildTrendAlertDeliveryHistory(dashboardResult);
  const reasonCodes = validateTrendAlertDeliveryHistory({ dashboardResult, history });
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
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_history_ready" : "blocked",
    sourceStatus: dashboardResult.status,
    history,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_history_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_history_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_history",
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
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery History",
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
    const result = await buildMusicSeshHostControlTrendAlertDeliveryHistory(options);
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
    buildTrendAlertDeliveryHistory,
    validateTrendAlertDeliveryHistory,
    buildMusicSeshHostControlTrendAlertDeliveryHistory,
    renderMarkdown,
  },
};
