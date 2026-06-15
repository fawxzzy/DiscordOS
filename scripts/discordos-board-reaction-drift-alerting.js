const {
  _internals: driftInternals,
} = require("./discordos-board-lifecycle-reaction-drift-monitor");
const {
  _internals: notificationRouterInternals,
} = require("./discordos-notification-router");

function parseArgs(args) {
  return driftInternals.parseArgs(args);
}

async function buildBoardReactionDriftAlerting({
  notificationRouter = notificationRouterInternals,
  ...input
} = {}) {
  const monitor = await driftInternals.buildBoardLifecycleReactionDriftMonitor(input);
  const driftDetected = monitor.drift.driftCount > 0;
  const route = await notificationRouter.buildNotificationRouteDecision({
    source: "board-reaction",
    type: "discordos.board_reaction.drift_detected",
    severity: driftDetected ? "critical" : "info",
  });
  const reasonCodes = [...new Set([
    ...monitor.reasonCodes.filter((code) => code !== "board_reaction_drift_detected"),
    ...(driftDetected && !route.ok ? route.reasonCodes : []),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: monitor.callsDiscordApi,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "board_reaction_drift_alerting_ready" : "blocked",
    driftDetected,
    drift: monitor.drift,
    monitor: {
      status: monitor.status,
      liveAttempted: monitor.liveAttempted,
    },
    notificationRoute: {
      ok: route.ok,
      routeId: route.route?.id || null,
      target: route.route?.target || null,
      targetEnv: route.route?.targetEnv || null,
      severity: route.intent.severity,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.drift_alerting_ready"
        : "discordos.board_reaction.drift_alerting_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.drift_alerting",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        driftDetected,
        driftCount: monitor.drift.driftCount,
        routeId: result.notificationRoute.routeId || "none",
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Drift Alerting",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- drift detected: \`${result.driftDetected ? "true" : "false"}\``,
    `- drift count: \`${result.drift.driftCount}\``,
    `- route: \`${result.notificationRoute.routeId || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionDriftAlerting(options);
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
    buildBoardReactionDriftAlerting,
    renderMarkdown,
  },
};
