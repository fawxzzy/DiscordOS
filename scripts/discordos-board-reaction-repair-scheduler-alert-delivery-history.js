const {
  _internals: dashboardInternals,
} = require("./discordos-board-reaction-repair-scheduler-alert-delivery-dashboard");

function parseArgs(args) {
  return dashboardInternals.parseArgs(args);
}

function buildSchedulerAlertDeliveryHistory(dashboardResult) {
  const dashboard = dashboardResult.dashboard;
  return {
    historyStatus: "bounded_ready",
    recordCount: 1,
    maxRecords: 10,
    records: [
      {
        statusLine: dashboard.statusLine,
        alertAdmission: dashboard.alertAdmission,
        routeId: dashboard.routeId,
        target: dashboard.target,
        customReactionGuardsPreserved: dashboard.customReactionGuardsPreserved === true,
        readbackRequired: dashboard.readbackRequired === true,
        skippedAlignedNoise: dashboard.skippedAlignedNoise === true,
        noSendBoundaryConfirmed: dashboard.noSendBoundaryConfirmed === true,
      },
    ],
    repeatsTracked: true,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateSchedulerAlertDeliveryHistory({ dashboardResult, history }) {
  const reasonCodes = [...dashboardResult.reasonCodes];
  if (history.historyStatus !== "bounded_ready" || history.recordCount < 1 || history.recordCount > history.maxRecords) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_bounds_failed");
  }
  if (!history.repeatsTracked || !Array.isArray(history.records) || history.records.length !== history.recordCount) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_tracking_failed");
  }
  if (!history.records.every((record) =>
    record.customReactionGuardsPreserved
      && record.readbackRequired
      && record.skippedAlignedNoise
      && record.noSendBoundaryConfirmed
  )) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_record_invalid");
  }
  if (dashboardResult.sendsMessages || dashboardResult.callsDiscordApi) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_send_boundary_failed");
  }
  if (history.executesStorageWrite) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_storage_write_attempted");
  }
  if (dashboardResult.slashCommandsAdmitted || history.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_history_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionRepairSchedulerAlertDeliveryHistory(input = {}) {
  const dashboardResult = await dashboardInternals.buildBoardReactionRepairSchedulerAlertDeliveryDashboard(input);
  const history = buildSchedulerAlertDeliveryHistory(dashboardResult);
  const reasonCodes = validateSchedulerAlertDeliveryHistory({ dashboardResult, history });
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
    status: reasonCodes.length === 0 ? "board_reaction_repair_scheduler_alert_delivery_history_ready" : "blocked",
    sourceStatus: dashboardResult.status,
    history,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.repair_scheduler_alert_delivery_history_ready"
        : "discordos.board_reaction.repair_scheduler_alert_delivery_history_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.repair_scheduler_alert_delivery_history",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        recordCount: history.recordCount,
        historyStatus: history.historyStatus,
        repeatsTracked: history.repeatsTracked,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Repair Scheduler Alert Delivery History",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- history status: \`${result.history.historyStatus}\``,
    `- record count: \`${result.history.recordCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionRepairSchedulerAlertDeliveryHistory(options);
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
    buildSchedulerAlertDeliveryHistory,
    validateSchedulerAlertDeliveryHistory,
    buildBoardReactionRepairSchedulerAlertDeliveryHistory,
    renderMarkdown,
  },
};
