const {
  _internals: rollupInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-delivery-history-rollup");

function parseArgs(args) {
  return rollupInternals.parseArgs(args);
}

function buildTrendAlertDeliveryRollupDashboard(rollupResult) {
  const rollup = rollupResult.rollup;
  return {
    statusLine: "ready",
    rollupStatus: rollup.rollupStatus,
    sourceHistoryStatus: rollup.sourceHistoryStatus,
    recordCount: rollup.recordCount,
    maxRecords: rollup.maxRecords,
    routeCount: rollup.routeIds.length,
    alertLevelCount: rollup.alertLevels.length,
    routesVisible: rollup.routeIds.length > 0,
    alertLevelsVisible: rollup.alertLevels.length > 0,
    deliveryDecisionVisible: rollup.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: rollup.noSendBoundaryConfirmed === true,
    noPlaybackBoundaryConfirmed: rollup.noPlaybackBoundaryConfirmed === true,
    noProviderBoundaryConfirmed: rollup.noProviderBoundaryConfirmed === true,
    sendsMessagesInDashboard: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryRollupDashboard({ rollupResult, dashboard }) {
  const reasonCodes = [...rollupResult.reasonCodes];
  if (dashboard.statusLine !== "ready" || dashboard.rollupStatus !== "rollup_ready") {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_status_invalid");
  }
  if (!dashboard.routesVisible || !dashboard.alertLevelsVisible || !dashboard.deliveryDecisionVisible) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_visibility_missing");
  }
  if (!dashboard.noSendBoundaryConfirmed || !dashboard.noPlaybackBoundaryConfirmed || !dashboard.noProviderBoundaryConfirmed) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_boundary_failed");
  }
  if (dashboard.sendsMessagesInDashboard || dashboard.callsDiscordApi || rollupResult.sendsMessages) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_send_attempted");
  }
  if (dashboard.executesStorageWrite || rollupResult.executesStorageWrite) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_storage_write_attempted");
  }
  if (rollupResult.controlsPlayback || rollupResult.callsMusicProviders) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_runtime_boundary_failed");
  }
  if (rollupResult.slashCommandsAdmitted || dashboard.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_alert_delivery_rollup_dashboard_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryHistoryRollupDashboard(input = {}) {
  const rollupResult = await rollupInternals.buildMusicSeshHostControlTrendAlertDeliveryHistoryRollup(input);
  const dashboard = buildTrendAlertDeliveryRollupDashboard(rollupResult);
  const reasonCodes = validateTrendAlertDeliveryRollupDashboard({ rollupResult, dashboard });
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
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_history_rollup_dashboard_ready" : "blocked",
    sourceStatus: rollupResult.status,
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_history_rollup_dashboard_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_history_rollup_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_history_rollup_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        routeCount: dashboard.routeCount,
        alertLevelCount: dashboard.alertLevelCount,
        noSendBoundaryConfirmed: dashboard.noSendBoundaryConfirmed,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery History Rollup Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- status line: \`${result.dashboard.statusLine}\``,
    `- route count: \`${result.dashboard.routeCount}\``,
    `- alert level count: \`${result.dashboard.alertLevelCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertDeliveryHistoryRollupDashboard(options);
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
    buildTrendAlertDeliveryRollupDashboard,
    validateTrendAlertDeliveryRollupDashboard,
    buildMusicSeshHostControlTrendAlertDeliveryHistoryRollupDashboard,
    renderMarkdown,
  },
};
