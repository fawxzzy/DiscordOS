const {
  _internals: historyInternals,
} = require("./discordos-button-route-audit-acknowledgement-dashboard-alert-history");

function parseArgs(args) {
  return historyInternals.parseArgs(args);
}

function buildAcknowledgementHistoryAlerting(historyResult) {
  const history = historyResult.history;
  const alertRequired = history.recordCount >= history.maxRecords;
  return {
    alertRequired,
    alertStatus: alertRequired ? "would_route_no_send" : "not_required",
    historyStatus: history.historyStatus,
    recordCount: history.recordCount,
    maxRecords: history.maxRecords,
    repeatedPatternVisible: history.recordCount > 0,
    preservesActorRedaction: history.preservesActorRedaction === true,
    preservesTokenRedaction: history.preservesTokenRedaction === true,
    sendsMessagesInAlerting: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateAcknowledgementHistoryAlerting({ historyResult, alerting }) {
  const reasonCodes = [...historyResult.reasonCodes];
  if (!alerting.repeatedPatternVisible || alerting.historyStatus !== "bounded_ready") {
    reasonCodes.push("button_route_audit_ack_history_alerting_visibility_missing");
  }
  if (!alerting.preservesActorRedaction || !alerting.preservesTokenRedaction) {
    reasonCodes.push("button_route_audit_ack_history_alerting_redaction_failed");
  }
  if (alerting.sendsMessagesInAlerting || alerting.callsDiscordApi || historyResult.sendsMessages || historyResult.callsDiscordApi) {
    reasonCodes.push("button_route_audit_ack_history_alerting_send_boundary_failed");
  }
  if (alerting.executesStorageWrite || historyResult.executesStorageWrite) {
    reasonCodes.push("button_route_audit_ack_history_alerting_storage_write_attempted");
  }
  if (alerting.alertRequired && alerting.alertStatus !== "would_route_no_send") {
    reasonCodes.push("button_route_audit_ack_history_alerting_admission_missing");
  }
  if (historyResult.slashCommandsAdmitted || alerting.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_ack_history_alerting_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAcknowledgementHistoryAlerting(input = {}) {
  const historyResult = await historyInternals.buildButtonRouteAuditAcknowledgementDashboardAlertHistory(input);
  const alerting = buildAcknowledgementHistoryAlerting(historyResult);
  const reasonCodes = validateAcknowledgementHistoryAlerting({ historyResult, alerting });
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
    status: reasonCodes.length === 0 ? "button_route_audit_acknowledgement_history_alerting_ready" : "blocked",
    sourceStatus: historyResult.status,
    alerting,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_acknowledgement_history_alerting_ready"
        : "discordos.button_route.audit_acknowledgement_history_alerting_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_acknowledgement_history_alerting",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: alerting.alertRequired,
        alertStatus: alerting.alertStatus,
        preservesRedaction: alerting.preservesActorRedaction && alerting.preservesTokenRedaction,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Acknowledgement History Alerting",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
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
    const result = await buildButtonRouteAuditAcknowledgementHistoryAlerting(options);
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
    buildAcknowledgementHistoryAlerting,
    validateAcknowledgementHistoryAlerting,
    buildButtonRouteAuditAcknowledgementHistoryAlerting,
    renderMarkdown,
  },
};
