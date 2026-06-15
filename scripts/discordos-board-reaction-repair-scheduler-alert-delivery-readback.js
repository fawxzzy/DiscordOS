const {
  _internals: canaryInternals,
} = require("./discordos-board-reaction-repair-scheduler-alert-delivery-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildSchedulerAlertDeliveryReadback(canaryResult) {
  const canary = canaryResult.canary;
  return {
    deliveryDecisionVisible: Boolean(canary.deliveryAdmissionStatus),
    routeIdentityVisible: canary.deliveryAdmissionStatus === "not_required" || Boolean(canary.routeId),
    alertAdmission: canary.deliveryAdmissionStatus,
    routeId: canary.routeId || "none",
    target: canary.target || "none",
    customReactionGuardsPreserved: canary.customReactionGuardsPreserved === true,
    readbackRequired: canary.readbackRequired === true,
    skippedAlignedNoise: canary.skippedAlignedNoise === true,
    noSendBoundaryConfirmed: canaryResult.sendsMessages === false && canary.sendsMessagesInCanary === false,
    slashCommandsAdmitted: false,
  };
}

function validateSchedulerAlertDeliveryReadback({ canaryResult, readback }) {
  const reasonCodes = [...canaryResult.reasonCodes];
  if (!readback.deliveryDecisionVisible || !readback.routeIdentityVisible) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_readback_decision_missing");
  }
  if (!readback.customReactionGuardsPreserved || !readback.readbackRequired) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_readback_guard_missing");
  }
  if (!readback.noSendBoundaryConfirmed) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_readback_send_boundary_failed");
  }
  if (canaryResult.slashCommandsAdmitted || readback.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_readback_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionRepairSchedulerAlertDeliveryReadback(input = {}) {
  const canaryResult = await canaryInternals.buildBoardReactionRepairSchedulerAlertDeliveryCanary(input);
  const readback = buildSchedulerAlertDeliveryReadback(canaryResult);
  const reasonCodes = validateSchedulerAlertDeliveryReadback({ canaryResult, readback });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "board_reaction_repair_scheduler_alert_delivery_readback_ready" : "blocked",
    sourceStatus: canaryResult.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.repair_scheduler_alert_delivery_readback_ready"
        : "discordos.board_reaction.repair_scheduler_alert_delivery_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.repair_scheduler_alert_delivery_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        admission: readback.alertAdmission,
        routeId: readback.routeId,
        customReactionGuardsPreserved: readback.customReactionGuardsPreserved,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Repair Scheduler Alert Delivery Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
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
    const result = await buildBoardReactionRepairSchedulerAlertDeliveryReadback(options);
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
    buildSchedulerAlertDeliveryReadback,
    validateSchedulerAlertDeliveryReadback,
    buildBoardReactionRepairSchedulerAlertDeliveryReadback,
    renderMarkdown,
  },
};
