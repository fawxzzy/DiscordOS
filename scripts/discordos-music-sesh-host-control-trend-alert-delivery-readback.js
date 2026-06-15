const {
  _internals: canaryInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-delivery-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildTrendAlertDeliveryReadback(canaryResult) {
  const canary = canaryResult.canary;
  return {
    deliveryDecisionVisible: Boolean(canary.deliveryAdmissionStatus),
    routeIdentityVisible: canary.deliveryAdmissionStatus === "not_required" || Boolean(canary.routeId),
    alertAdmission: canary.deliveryAdmissionStatus,
    routeId: canary.routeId || "none",
    target: canary.target || "none",
    alertLevel: canary.alertLevel || "none",
    noSendBoundaryConfirmed: canaryResult.sendsMessages === false && canary.sendsMessagesInCanary === false,
    noPlaybackBoundaryConfirmed: canaryResult.controlsPlayback === false && canary.controlsPlayback === false,
    noProviderBoundaryConfirmed: canaryResult.callsMusicProviders === false && canary.callsMusicProviders === false,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryReadback({ canaryResult, readback }) {
  const reasonCodes = [...canaryResult.reasonCodes];
  if (!readback.deliveryDecisionVisible || !readback.routeIdentityVisible) {
    reasonCodes.push("host_control_trend_alert_delivery_readback_decision_missing");
  }
  if (!readback.noSendBoundaryConfirmed || !readback.noPlaybackBoundaryConfirmed || !readback.noProviderBoundaryConfirmed) {
    reasonCodes.push("host_control_trend_alert_delivery_readback_boundary_failed");
  }
  if (canaryResult.slashCommandsAdmitted || readback.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_alert_delivery_readback_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryReadback(input = {}) {
  const canaryResult = await canaryInternals.buildMusicSeshHostControlTrendAlertDeliveryCanary(input);
  const readback = buildTrendAlertDeliveryReadback(canaryResult);
  const reasonCodes = validateTrendAlertDeliveryReadback({ canaryResult, readback });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_readback_ready" : "blocked",
    sourceStatus: canaryResult.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_readback_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        admission: readback.alertAdmission,
        routeId: readback.routeId,
        noSendBoundaryConfirmed: readback.noSendBoundaryConfirmed,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.readback.alertAdmission}\``,
    `- route: \`${result.readback.routeId}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertDeliveryReadback(options);
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
    buildTrendAlertDeliveryReadback,
    validateTrendAlertDeliveryReadback,
    buildMusicSeshHostControlTrendAlertDeliveryReadback,
    renderMarkdown,
  },
};
