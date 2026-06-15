const {
  _internals: alertInternals,
} = require("./discordos-board-reaction-repair-scheduler-rollup-alerts");

function parseArgs(args) {
  return alertInternals.parseArgs(args);
}

function buildSchedulerAlertDeliveryCanary(alerts) {
  const attentionRequired = alerts.attention.needsAttention === true;
  const routed = alerts.alertRoute.routeStatus === "routed" && Boolean(alerts.alertRoute.routeId);
  return {
    alertWouldSend: attentionRequired && routed,
    deliveryAdmissionStatus: attentionRequired ? (routed ? "admitted_no_send" : "blocked") : "not_required",
    routeId: alerts.alertRoute.routeId,
    target: alerts.alertRoute.target,
    customReactionGuardsPreserved: alerts.rollup.customReactionGuardCount > 0,
    readbackRequired: alerts.rollup.readbackRequiredCount > 0,
    skippedAlignedNoise: alerts.attention.skippedAlignedNoise === true,
    sendsMessagesInCanary: false,
    slashCommandsAdmitted: false,
  };
}

function validateSchedulerAlertDeliveryCanary({ alerts, canary }) {
  const reasonCodes = [...alerts.reasonCodes];
  if (alerts.sendsMessages || alerts.callsDiscordApi || alerts.callsMusicProviders || alerts.controlsPlayback) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_side_effect_boundary_failed");
  }
  if (alerts.slashCommandsAdmitted || canary.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_slash_command_admitted");
  }
  if (!canary.customReactionGuardsPreserved || !canary.readbackRequired) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_guard_missing");
  }
  if (alerts.attention.needsAttention && canary.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_route_not_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionRepairSchedulerAlertDeliveryCanary(input = {}) {
  const alerts = await alertInternals.buildBoardReactionRepairSchedulerRollupAlerts(input);
  const canary = buildSchedulerAlertDeliveryCanary(alerts);
  const reasonCodes = validateSchedulerAlertDeliveryCanary({ alerts, canary });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "board_reaction_repair_scheduler_alert_delivery_canary_ready" : "blocked",
    sourceStatus: alerts.status,
    canary,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.repair_scheduler_alert_delivery_canary_ready"
        : "discordos.board_reaction.repair_scheduler_alert_delivery_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.repair_scheduler_alert_delivery_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertWouldSend: canary.alertWouldSend,
        admission: canary.deliveryAdmissionStatus,
        customReactionGuardsPreserved: canary.customReactionGuardsPreserved,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Repair Scheduler Alert Delivery Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
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
    const result = await buildBoardReactionRepairSchedulerAlertDeliveryCanary(options);
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
    buildSchedulerAlertDeliveryCanary,
    validateSchedulerAlertDeliveryCanary,
    buildBoardReactionRepairSchedulerAlertDeliveryCanary,
    renderMarkdown,
  },
};
