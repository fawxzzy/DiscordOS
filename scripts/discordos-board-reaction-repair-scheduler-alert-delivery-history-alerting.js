const {
  _internals: historyInternals,
} = require("./discordos-board-reaction-repair-scheduler-alert-delivery-history");

function parseArgs(args) {
  return historyInternals.parseArgs(args);
}

function buildSchedulerAlertDeliveryHistoryAlerting(historyResult) {
  const history = historyResult.history;
  const alertRequired = history.recordCount >= history.maxRecords;
  return {
    alertRequired,
    alertStatus: alertRequired ? "would_route_no_send" : "not_required",
    historyStatus: history.historyStatus,
    recordCount: history.recordCount,
    maxRecords: history.maxRecords,
    repeatedPatternVisible: history.recordCount > 0,
    customReactionGuardsPreserved: history.records.every((record) => record.customReactionGuardsPreserved === true),
    readbackRequired: history.records.every((record) => record.readbackRequired === true),
    skippedAlignedNoise: history.records.every((record) => record.skippedAlignedNoise === true),
    noSendBoundaryConfirmed: history.records.every((record) => record.noSendBoundaryConfirmed === true),
    sendsMessagesInAlerting: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateSchedulerAlertDeliveryHistoryAlerting({ historyResult, alerting }) {
  const reasonCodes = [...historyResult.reasonCodes];
  if (!alerting.repeatedPatternVisible || alerting.historyStatus !== "bounded_ready") {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_alerting_visibility_missing");
  }
  if (!alerting.customReactionGuardsPreserved || !alerting.readbackRequired || !alerting.skippedAlignedNoise || !alerting.noSendBoundaryConfirmed) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_alerting_boundary_failed");
  }
  if (alerting.sendsMessagesInAlerting || alerting.callsDiscordApi || historyResult.sendsMessages || historyResult.callsDiscordApi) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_alerting_send_attempted");
  }
  if (alerting.executesStorageWrite || historyResult.executesStorageWrite) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_alerting_storage_write_attempted");
  }
  if (alerting.alertRequired && alerting.alertStatus !== "would_route_no_send") {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_alerting_admission_missing");
  }
  if (historyResult.slashCommandsAdmitted || alerting.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_alerting_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlerting(input = {}) {
  const historyResult = await historyInternals.buildBoardReactionRepairSchedulerAlertDeliveryHistory(input);
  const alerting = buildSchedulerAlertDeliveryHistoryAlerting(historyResult);
  const reasonCodes = validateSchedulerAlertDeliveryHistoryAlerting({ historyResult, alerting });
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
    status: reasonCodes.length === 0 ? "board_reaction_repair_scheduler_alert_delivery_history_alerting_ready" : "blocked",
    sourceStatus: historyResult.status,
    alerting,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.repair_scheduler_alert_delivery_history_alerting_ready"
        : "discordos.board_reaction.repair_scheduler_alert_delivery_history_alerting_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.repair_scheduler_alert_delivery_history_alerting",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: alerting.alertRequired,
        alertStatus: alerting.alertStatus,
        customReactionGuardsPreserved: alerting.customReactionGuardsPreserved,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Repair Scheduler Alert Delivery History Alerting",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- alert status: \`${result.alerting.alertStatus}\``,
    `- alert required: \`${result.alerting.alertRequired ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlerting(options);
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
    buildSchedulerAlertDeliveryHistoryAlerting,
    validateSchedulerAlertDeliveryHistoryAlerting,
    buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlerting,
    renderMarkdown,
  },
};
