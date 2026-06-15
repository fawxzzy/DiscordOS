const {
  _internals: rollupInternals,
} = require("./discordos-board-reaction-repair-scheduler-observability-rollup");
const {
  _internals: notificationRouterInternals,
} = require("./discordos-notification-router");

function parseArgs(args) {
  return rollupInternals.parseArgs(args);
}

function classifyRollupAttention(rollup) {
  const needsAttention = rollup.repairAttemptCount > 0 || rollup.operatorStatus === "awaiting_apply_guard";
  return {
    needsAttention,
    severity: needsAttention ? "critical" : "info",
    reason: needsAttention ? "repair_or_apply_guard_attention" : "aligned_or_readback_only",
    skippedAlignedNoise: rollup.skippedAlignedCardCount > 0 && rollup.repairAttemptCount === 0,
  };
}

async function buildBoardReactionRepairSchedulerRollupAlerts({
  notificationRouter = notificationRouterInternals,
  ...input
} = {}) {
  const rollupResult = await rollupInternals.buildBoardReactionRepairSchedulerObservabilityRollup(input);
  const attention = classifyRollupAttention(rollupResult.rollup);
  const route = await notificationRouter.buildNotificationRouteDecision({
    source: "board-reaction",
    type: "discordos.board_reaction.drift_detected",
    severity: attention.severity,
  });
  const reasonCodes = [...new Set([
    ...rollupResult.reasonCodes,
    ...(attention.needsAttention && !route.ok ? route.reasonCodes : []),
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
    status: reasonCodes.length === 0 ? "board_reaction_repair_scheduler_rollup_alerts_ready" : "blocked",
    sourceStatus: rollupResult.status,
    rollup: rollupResult.rollup,
    attention,
    alertRoute: {
      routeAttempted: attention.needsAttention,
      routeStatus: attention.needsAttention ? route.routeDecision.status : "not_required",
      routeId: attention.needsAttention ? route.route?.id || null : null,
      target: attention.needsAttention ? route.route?.target || null : null,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.repair_scheduler_rollup_alerts_ready"
        : "discordos.board_reaction.repair_scheduler_rollup_alerts_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.repair_scheduler_rollup_alerts",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        needsAttention: attention.needsAttention,
        routeStatus: result.alertRoute.routeStatus,
        skippedAlignedNoise: attention.skippedAlignedNoise,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Repair Scheduler Rollup Alerts",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- needs attention: \`${result.attention.needsAttention ? "true" : "false"}\``,
    `- route status: \`${result.alertRoute.routeStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionRepairSchedulerRollupAlerts(options);
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
    classifyRollupAttention,
    buildBoardReactionRepairSchedulerRollupAlerts,
    renderMarkdown,
  },
};
