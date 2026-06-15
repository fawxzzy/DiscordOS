const {
  _internals: readbackInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-delivery-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function buildTrendAlertDeliveryDashboard(readbackResult) {
  const readback = readbackResult.readback;
  return {
    statusLine: readback.alertAdmission === "not_required" ? "clear" : "attention_ready",
    routeId: readback.routeId,
    target: readback.target,
    alertLevel: readback.alertLevel,
    deliveryDecisionVisible: readback.deliveryDecisionVisible === true,
    routeIdentityVisible: readback.routeIdentityVisible === true,
    noSendBoundaryConfirmed: readback.noSendBoundaryConfirmed === true,
    noPlaybackBoundaryConfirmed: readback.noPlaybackBoundaryConfirmed === true,
    noProviderBoundaryConfirmed: readback.noProviderBoundaryConfirmed === true,
    operatorScanReady: true,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryDashboard({ readbackResult, dashboard }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (!dashboard.deliveryDecisionVisible || !dashboard.routeIdentityVisible || !dashboard.operatorScanReady) {
    reasonCodes.push("host_control_trend_alert_delivery_dashboard_visibility_missing");
  }
  if (!dashboard.noSendBoundaryConfirmed || !dashboard.noPlaybackBoundaryConfirmed || !dashboard.noProviderBoundaryConfirmed) {
    reasonCodes.push("host_control_trend_alert_delivery_dashboard_boundary_failed");
  }
  if (readbackResult.slashCommandsAdmitted || dashboard.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_alert_delivery_dashboard_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryDashboard(input = {}) {
  const readbackResult = await readbackInternals.buildMusicSeshHostControlTrendAlertDeliveryReadback(input);
  const dashboard = buildTrendAlertDeliveryDashboard(readbackResult);
  const reasonCodes = validateTrendAlertDeliveryDashboard({ readbackResult, dashboard });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_dashboard_ready" : "blocked",
    sourceStatus: readbackResult.status,
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_dashboard_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        statusLine: dashboard.statusLine,
        routeId: dashboard.routeId,
        operatorScanReady: dashboard.operatorScanReady,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- status line: \`${result.dashboard.statusLine}\``,
    `- operator scan ready: \`${result.dashboard.operatorScanReady ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertDeliveryDashboard(options);
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
    buildTrendAlertDeliveryDashboard,
    validateTrendAlertDeliveryDashboard,
    buildMusicSeshHostControlTrendAlertDeliveryDashboard,
    renderMarkdown,
  },
};
