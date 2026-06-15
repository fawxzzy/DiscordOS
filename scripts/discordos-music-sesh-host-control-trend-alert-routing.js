const {
  _internals: trendInternals,
} = require("./discordos-music-sesh-host-control-history-trend-alerts");
const {
  _internals: notificationRouterInternals,
} = require("./discordos-notification-router");

function parseArgs(args) {
  return trendInternals.parseArgs(args);
}

async function buildMusicSeshHostControlTrendAlertRouting({
  notificationRouter = notificationRouterInternals,
  ...input
} = {}) {
  const trendResult = await trendInternals.buildMusicSeshHostControlHistoryTrendAlerts(input);
  const attentionRequired = trendResult.trend.attentionRequired === true;
  const route = await notificationRouter.buildNotificationRouteDecision({
    source: "product-workflow",
    type: "discordos.product_workflow.monitor_attention",
    severity: attentionRequired ? "critical" : "info",
  });
  const reasonCodes = [...new Set([
    ...trendResult.reasonCodes,
    ...(attentionRequired && !route.ok ? route.reasonCodes : []),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_routing_ready" : "blocked",
    sourceStatus: trendResult.status,
    trend: trendResult.trend,
    routing: {
      attentionRequired,
      routeAttempted: attentionRequired,
      severity: attentionRequired ? "critical" : "info",
      routeId: attentionRequired ? route.route?.id || null : null,
      target: attentionRequired ? route.route?.target || null : null,
      routeStatus: attentionRequired ? route.routeDecision.status : "not_required",
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_routing_ready"
        : "discordos.music_sesh.host_control_trend_alert_routing_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_routing",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertLevel: result.trend.alertLevel,
        routeStatus: result.routing.routeStatus,
        routeId: result.routing.routeId || "none",
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Routing",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- alert level: \`${result.trend.alertLevel}\``,
    `- route status: \`${result.routing.routeStatus}\``,
    `- route id: \`${result.routing.routeId || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertRouting(options);
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
    buildMusicSeshHostControlTrendAlertRouting,
    renderMarkdown,
  },
};
