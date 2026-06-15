const {
  _internals: routingInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-routing");

function parseArgs(args) {
  return routingInternals.parseArgs(args);
}

function buildTrendAlertDeliveryCanary(routing) {
  const attentionRequired = routing.routing.attentionRequired === true;
  const routed = routing.routing.routeStatus === "routed" && Boolean(routing.routing.routeId);
  return {
    alertWouldSend: attentionRequired && routed,
    deliveryAdmissionStatus: attentionRequired ? (routed ? "admitted_no_send" : "blocked") : "not_required",
    routeId: routing.routing.routeId,
    target: routing.routing.target,
    alertLevel: routing.trend.alertLevel,
    sendsMessagesInCanary: false,
    controlsPlayback: false,
    callsMusicProviders: false,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryCanary({ routing, canary }) {
  const reasonCodes = [...routing.reasonCodes];
  if (routing.sendsMessages || routing.controlsPlayback || routing.callsMusicProviders) {
    reasonCodes.push("host_control_trend_delivery_canary_side_effect_boundary_failed");
  }
  if (routing.slashCommandsAdmitted || canary.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_delivery_canary_slash_command_admitted");
  }
  if (routing.routing.attentionRequired && canary.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("host_control_trend_delivery_canary_route_not_admitted");
  }
  if (canary.sendsMessagesInCanary || canary.controlsPlayback || canary.callsMusicProviders) {
    reasonCodes.push("host_control_trend_delivery_canary_action_boundary_failed");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryCanary(input = {}) {
  const routing = await routingInternals.buildMusicSeshHostControlTrendAlertRouting(input);
  const canary = buildTrendAlertDeliveryCanary(routing);
  const reasonCodes = validateTrendAlertDeliveryCanary({ routing, canary });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_canary_ready" : "blocked",
    sourceStatus: routing.status,
    canary,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_canary_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertWouldSend: canary.alertWouldSend,
        admission: canary.deliveryAdmissionStatus,
        routeId: canary.routeId || "none",
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- alert would send: \`${result.canary.alertWouldSend ? "true" : "false"}\``,
    `- admission: \`${result.canary.deliveryAdmissionStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertDeliveryCanary(options);
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
    buildTrendAlertDeliveryCanary,
    validateTrendAlertDeliveryCanary,
    buildMusicSeshHostControlTrendAlertDeliveryCanary,
    renderMarkdown,
  },
};
