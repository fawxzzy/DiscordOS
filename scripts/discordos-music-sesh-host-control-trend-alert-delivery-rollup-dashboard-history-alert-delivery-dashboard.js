const {
  _internals: readbackInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function buildTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryDashboard(readbackResult) {
  const readback = readbackResult.readback;
  return {
    statusLine: "ready",
    deliveryAdmissionStatus: readback.deliveryAdmissionStatus,
    alertRequired: readback.alertRequired === true,
    alertStatus: readback.alertStatus,
    historyStatus: readback.historyStatus,
    routesVisible: readback.routesVisible === true,
    alertLevelsVisible: readback.alertLevelsVisible === true,
    deliveryDecisionVisible: readback.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: readback.noSendBoundaryConfirmed === true,
    noPlaybackBoundaryConfirmed: readback.noPlaybackBoundaryConfirmed === true,
    noProviderBoundaryConfirmed: readback.noProviderBoundaryConfirmed === true,
    noDiscordApiBoundaryConfirmed: readback.noDiscordApiBoundaryConfirmed === true,
    noStorageWriteBoundaryConfirmed: readback.noStorageWriteBoundaryConfirmed === true,
    sendsMessagesInDashboard: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryDashboard({ readbackResult, dashboard }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (dashboard.statusLine !== "ready" || !dashboard.deliveryDecisionVisible || !dashboard.routesVisible || !dashboard.alertLevelsVisible || dashboard.historyStatus !== "bounded_ready") {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard_visibility_missing");
  }
  if (!dashboard.noSendBoundaryConfirmed || !dashboard.noDiscordApiBoundaryConfirmed || dashboard.sendsMessagesInDashboard || dashboard.callsDiscordApi || readbackResult.sendsMessages || readbackResult.callsDiscordApi) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard_send_boundary_failed");
  }
  if (!dashboard.noStorageWriteBoundaryConfirmed || dashboard.executesStorageWrite || readbackResult.executesStorageWrite) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard_storage_write_attempted");
  }
  if (!dashboard.noPlaybackBoundaryConfirmed || !dashboard.noProviderBoundaryConfirmed || readbackResult.controlsPlayback || readbackResult.callsMusicProviders) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard_runtime_boundary_failed");
  }
  if (dashboard.alertRequired && dashboard.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard_admission_missing");
  }
  if (readbackResult.slashCommandsAdmitted || dashboard.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryDashboard(input = {}) {
  const readbackResult = await readbackInternals.buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryReadback(input);
  const dashboard = buildTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryDashboard(readbackResult);
  const reasonCodes = validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryDashboard({ readbackResult, dashboard });
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
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard_ready" : "blocked",
    sourceStatus: readbackResult.status,
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: dashboard.alertRequired,
        admission: dashboard.deliveryAdmissionStatus,
        statusLine: dashboard.statusLine,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery Rollup Dashboard History Alert Delivery Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- status line: \`${result.dashboard.statusLine}\``,
    `- admission: \`${result.dashboard.deliveryAdmissionStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryDashboard(options);
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
    buildTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryDashboard,
    validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryDashboard,
    buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryDashboard,
    renderMarkdown,
  },
};
