const {
  _internals: readbackInternals,
} = require("./discordos-board-reaction-repair-scheduler-alert-delivery-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function buildSchedulerAlertDeliveryDashboard(readbackResult) {
  const readback = readbackResult.readback;
  return {
    statusLine: readback.alertAdmission === "not_required" ? "clear" : "attention_ready",
    alertAdmission: readback.alertAdmission,
    routeId: readback.routeId,
    target: readback.target,
    customReactionGuardsPreserved: readback.customReactionGuardsPreserved === true,
    readbackRequired: readback.readbackRequired === true,
    skippedAlignedNoise: readback.skippedAlignedNoise === true,
    noSendBoundaryConfirmed: readback.noSendBoundaryConfirmed === true,
    operatorScanReady: true,
    slashCommandsAdmitted: false,
  };
}

function validateSchedulerAlertDeliveryDashboard({ readbackResult, dashboard }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (!dashboard.operatorScanReady || !dashboard.customReactionGuardsPreserved || !dashboard.readbackRequired) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_dashboard_visibility_missing");
  }
  if (!dashboard.noSendBoundaryConfirmed) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_dashboard_send_boundary_failed");
  }
  if (readbackResult.slashCommandsAdmitted || dashboard.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_scheduler_alert_delivery_dashboard_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionRepairSchedulerAlertDeliveryDashboard(input = {}) {
  const readbackResult = await readbackInternals.buildBoardReactionRepairSchedulerAlertDeliveryReadback(input);
  const dashboard = buildSchedulerAlertDeliveryDashboard(readbackResult);
  const reasonCodes = validateSchedulerAlertDeliveryDashboard({ readbackResult, dashboard });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "board_reaction_repair_scheduler_alert_delivery_dashboard_ready" : "blocked",
    sourceStatus: readbackResult.status,
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.repair_scheduler_alert_delivery_dashboard_ready"
        : "discordos.board_reaction.repair_scheduler_alert_delivery_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.repair_scheduler_alert_delivery_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        statusLine: dashboard.statusLine,
        customReactionGuardsPreserved: dashboard.customReactionGuardsPreserved,
        operatorScanReady: dashboard.operatorScanReady,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Repair Scheduler Alert Delivery Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- status line: \`${result.dashboard.statusLine}\``,
    `- operator scan ready: \`${result.dashboard.operatorScanReady ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionRepairSchedulerAlertDeliveryDashboard(options);
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
    buildSchedulerAlertDeliveryDashboard,
    validateSchedulerAlertDeliveryDashboard,
    buildBoardReactionRepairSchedulerAlertDeliveryDashboard,
    renderMarkdown,
  },
};
