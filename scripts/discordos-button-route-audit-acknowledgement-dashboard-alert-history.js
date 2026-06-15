const {
  _internals: dashboardInternals,
} = require("./discordos-button-route-audit-acknowledgement-readback-dashboard");

function parseArgs(args) {
  return dashboardInternals.parseArgs(args);
}

function buildAcknowledgementDashboardAlertHistory(dashboardResult) {
  const dashboard = dashboardResult.dashboard;
  const record = {
    routeId: dashboard.routeId,
    closedAlertStateVisible: dashboard.closedAlertStateVisible === true,
    handledStateVisible: dashboard.handledStateVisible === true,
    redactionStatus: dashboard.redactionStatus,
    actorFingerprintPresent: dashboard.actorFingerprintPresent === true,
  };
  return {
    historyStatus: "bounded_ready",
    recordCount: 1,
    maxRecords: 10,
    records: [record],
    preservesActorRedaction: dashboard.exposesActorIds === false,
    preservesTokenRedaction: dashboard.exposesTokens === false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateAcknowledgementDashboardAlertHistory({ dashboardResult, history }) {
  const reasonCodes = [...dashboardResult.reasonCodes];
  if (history.historyStatus !== "bounded_ready" || history.recordCount < 1 || history.recordCount > history.maxRecords) {
    reasonCodes.push("button_route_audit_ack_dashboard_history_bounds_failed");
  }
  if (!history.records.every((record) => record.closedAlertStateVisible && record.redactionStatus === "redacted")) {
    reasonCodes.push("button_route_audit_ack_dashboard_history_record_invalid");
  }
  if (!history.preservesActorRedaction || !history.preservesTokenRedaction) {
    reasonCodes.push("button_route_audit_ack_dashboard_history_redaction_failed");
  }
  if (dashboardResult.executesStorageWrite || history.executesStorageWrite) {
    reasonCodes.push("button_route_audit_ack_dashboard_history_storage_write_attempted");
  }
  if (dashboardResult.slashCommandsAdmitted || history.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_ack_dashboard_history_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAcknowledgementDashboardAlertHistory(input = {}) {
  const dashboardResult = await dashboardInternals.buildButtonRouteAuditAcknowledgementReadbackDashboard(input);
  const history = buildAcknowledgementDashboardAlertHistory(dashboardResult);
  const reasonCodes = validateAcknowledgementDashboardAlertHistory({ dashboardResult, history });
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
    status: reasonCodes.length === 0 ? "button_route_audit_acknowledgement_dashboard_alert_history_ready" : "blocked",
    sourceStatus: dashboardResult.status,
    history,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_acknowledgement_dashboard_alert_history_ready"
        : "discordos.button_route.audit_acknowledgement_dashboard_alert_history_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_acknowledgement_dashboard_alert_history",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        recordCount: history.recordCount,
        historyStatus: history.historyStatus,
        preservesRedaction: history.preservesActorRedaction && history.preservesTokenRedaction,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Acknowledgement Dashboard Alert History",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
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
    const result = await buildButtonRouteAuditAcknowledgementDashboardAlertHistory(options);
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
    buildAcknowledgementDashboardAlertHistory,
    validateAcknowledgementDashboardAlertHistory,
    buildButtonRouteAuditAcknowledgementDashboardAlertHistory,
    renderMarkdown,
  },
};
