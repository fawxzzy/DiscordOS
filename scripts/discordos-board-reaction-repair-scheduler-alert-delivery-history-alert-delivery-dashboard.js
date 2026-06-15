const {
  _internals: readbackInternals,
} = require("./discordos-board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function buildSchedulerHistoryAlertDeliveryDashboard(readbackResult) {
  const readback = readbackResult.readback;
  return {
    statusLine: "ready",
    deliveryAdmissionStatus: readback.deliveryAdmissionStatus,
    alertRequired: readback.alertRequired === true,
    alertStatus: readback.alertStatus,
    customReactionGuardsPreserved: readback.customReactionGuardsPreserved === true,
    readbackRequired: readback.readbackRequired === true,
    skippedAlignedNoise: readback.skippedAlignedNoise === true,
    deliveryDecisionVisible: readback.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: readback.noSendBoundaryConfirmed === true,
    noDiscordApiBoundaryConfirmed: readback.noDiscordApiBoundaryConfirmed === true,
    noStorageWriteBoundaryConfirmed: readback.noStorageWriteBoundaryConfirmed === true,
    sendsMessagesInDashboard: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateSchedulerHistoryAlertDeliveryDashboard({ readbackResult, dashboard }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (dashboard.statusLine !== "ready") {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_dashboard_status_invalid");
  }
  if (!dashboard.deliveryDecisionVisible) {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_dashboard_visibility_missing");
  }
  if (!dashboard.customReactionGuardsPreserved || !dashboard.readbackRequired || !dashboard.skippedAlignedNoise) {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_dashboard_guard_boundary_failed");
  }
  if (!dashboard.noSendBoundaryConfirmed || !dashboard.noDiscordApiBoundaryConfirmed || dashboard.sendsMessagesInDashboard || dashboard.callsDiscordApi || readbackResult.sendsMessages || readbackResult.callsDiscordApi) {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_dashboard_send_boundary_failed");
  }
  if (!dashboard.noStorageWriteBoundaryConfirmed || dashboard.executesStorageWrite || readbackResult.executesStorageWrite) {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_dashboard_storage_write_attempted");
  }
  if (dashboard.alertRequired && dashboard.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_dashboard_admission_missing");
  }
  if (readbackResult.slashCommandsAdmitted || dashboard.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_scheduler_history_alert_delivery_dashboard_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryDashboard(input = {}) {
  const readbackResult = await readbackInternals.buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryReadback(input);
  const dashboard = buildSchedulerHistoryAlertDeliveryDashboard(readbackResult);
  const reasonCodes = validateSchedulerHistoryAlertDeliveryDashboard({ readbackResult, dashboard });
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
    status: reasonCodes.length === 0 ? "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_dashboard_ready" : "blocked",
    sourceStatus: readbackResult.status,
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.repair_scheduler_alert_delivery_history_alert_delivery_dashboard_ready"
        : "discordos.board_reaction.repair_scheduler_alert_delivery_history_alert_delivery_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.repair_scheduler_alert_delivery_history_alert_delivery_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: dashboard.alertRequired,
        admission: dashboard.deliveryAdmissionStatus,
        customReactionGuardsPreserved: dashboard.customReactionGuardsPreserved,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Repair Scheduler Alert Delivery History Alert Delivery Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- status line: \`${result.dashboard.statusLine}\``,
    `- admission: \`${result.dashboard.deliveryAdmissionStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryDashboard(options);
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
    buildSchedulerHistoryAlertDeliveryDashboard,
    validateSchedulerHistoryAlertDeliveryDashboard,
    buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryDashboard,
    renderMarkdown,
  },
};
