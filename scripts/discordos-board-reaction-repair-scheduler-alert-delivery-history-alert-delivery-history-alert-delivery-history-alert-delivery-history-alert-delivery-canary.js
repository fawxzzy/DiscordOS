const {
  _internals: alertingInternals,
} = require("./discordos-board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting");

function parseArgs(args) {
  return alertingInternals.parseArgs(args);
}

function buildSchedulerHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(alertingResult) {
  const alerting = alertingResult.alerting;
  return {
    deliveryAdmissionStatus: alerting.alertRequired ? "admitted_no_send" : "no_alert_to_deliver",
    alertRequired: alerting.alertRequired === true,
    alertStatus: alerting.alertStatus,
    historyStatus: alerting.historyStatus,
    customReactionGuardsPreserved: alerting.customReactionGuardsPreserved === true,
    readbackRequired: alerting.readbackRequired === true,
    skippedAlignedNoise: alerting.skippedAlignedNoise === true,
    deliveryDecisionVisible: alerting.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: alerting.noSendBoundaryConfirmed === true,
    noDiscordApiBoundaryConfirmed: alerting.noDiscordApiBoundaryConfirmed === true,
    noStorageWriteBoundaryConfirmed: alerting.noStorageWriteBoundaryConfirmed === true,
    sendsMessagesInCanary: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateSchedulerHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary({ alertingResult, canary }) {
  const reasonCodes = [...alertingResult.reasonCodes];
  if (!canary.deliveryDecisionVisible || canary.historyStatus !== "bounded_ready") {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_visibility_missing");
  }
  if (!canary.customReactionGuardsPreserved || !canary.readbackRequired || !canary.skippedAlignedNoise) {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_guard_boundary_failed");
  }
  if (!canary.noSendBoundaryConfirmed || !canary.noDiscordApiBoundaryConfirmed || canary.sendsMessagesInCanary || canary.callsDiscordApi || alertingResult.sendsMessages || alertingResult.callsDiscordApi) {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_send_boundary_failed");
  }
  if (!canary.noStorageWriteBoundaryConfirmed || canary.executesStorageWrite || alertingResult.executesStorageWrite) {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_storage_write_attempted");
  }
  if (canary.alertRequired && canary.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_admission_missing");
  }
  if (alertingResult.slashCommandsAdmitted || canary.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(input = {}) {
  const alertingResult = await alertingInternals.buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting(input);
  const canary = buildSchedulerHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(alertingResult);
  const reasonCodes = validateSchedulerHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary({ alertingResult, canary });
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
    status: reasonCodes.length === 0 ? "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_ready" : "blocked",
    sourceStatus: alertingResult.status,
    canary,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_ready"
        : "discordos.board_reaction.repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: canary.alertRequired,
        admission: canary.deliveryAdmissionStatus,
        customReactionGuardsPreserved: canary.customReactionGuardsPreserved,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Repair Scheduler Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.canary.deliveryAdmissionStatus}\``,
    `- alert status: \`${result.canary.alertStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(options);
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
    buildSchedulerHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary,
    validateSchedulerHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary,
    buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary,
    renderMarkdown,
  },
};
