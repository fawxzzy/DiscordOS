const {
  _internals: readbackInternals,
} = require("./discordos-button-route-audit-acknowledgement-alert-delivery-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function buildAcknowledgementAlertDeliveryDashboard(readbackResult) {
  const readback = readbackResult.readback;
  return {
    statusLine: "ready",
    deliveryAdmissionStatus: readback.deliveryAdmissionStatus,
    alertRequired: readback.alertRequired === true,
    alertStatus: readback.alertStatus,
    redactionStatus: readback.preservesActorRedaction && readback.preservesTokenRedaction ? "preserved" : "failed",
    preservesActorRedaction: readback.preservesActorRedaction === true,
    preservesTokenRedaction: readback.preservesTokenRedaction === true,
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

function validateAcknowledgementAlertDeliveryDashboard({ readbackResult, dashboard }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (dashboard.statusLine !== "ready") {
    reasonCodes.push("button_route_audit_ack_alert_delivery_dashboard_status_invalid");
  }
  if (!dashboard.deliveryDecisionVisible) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_dashboard_visibility_missing");
  }
  if (dashboard.redactionStatus !== "preserved" || !dashboard.preservesActorRedaction || !dashboard.preservesTokenRedaction) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_dashboard_redaction_failed");
  }
  if (!dashboard.noSendBoundaryConfirmed || !dashboard.noDiscordApiBoundaryConfirmed || dashboard.sendsMessagesInDashboard || dashboard.callsDiscordApi || readbackResult.sendsMessages || readbackResult.callsDiscordApi) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_dashboard_send_boundary_failed");
  }
  if (!dashboard.noStorageWriteBoundaryConfirmed || dashboard.executesStorageWrite || readbackResult.executesStorageWrite) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_dashboard_storage_write_attempted");
  }
  if (dashboard.alertRequired && dashboard.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("button_route_audit_ack_alert_delivery_dashboard_admission_missing");
  }
  if (readbackResult.slashCommandsAdmitted || dashboard.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_dashboard_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAcknowledgementAlertDeliveryDashboard(input = {}) {
  const readbackResult = await readbackInternals.buildButtonRouteAuditAcknowledgementAlertDeliveryReadback(input);
  const dashboard = buildAcknowledgementAlertDeliveryDashboard(readbackResult);
  const reasonCodes = validateAcknowledgementAlertDeliveryDashboard({ readbackResult, dashboard });
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
    status: reasonCodes.length === 0 ? "button_route_audit_acknowledgement_alert_delivery_dashboard_ready" : "blocked",
    sourceStatus: readbackResult.status,
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_acknowledgement_alert_delivery_dashboard_ready"
        : "discordos.button_route.audit_acknowledgement_alert_delivery_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_acknowledgement_alert_delivery_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: dashboard.alertRequired,
        admission: dashboard.deliveryAdmissionStatus,
        redactionStatus: dashboard.redactionStatus,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Acknowledgement Alert Delivery Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- status line: \`${result.dashboard.statusLine}\``,
    `- redaction status: \`${result.dashboard.redactionStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAcknowledgementAlertDeliveryDashboard(options);
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
    buildAcknowledgementAlertDeliveryDashboard,
    validateAcknowledgementAlertDeliveryDashboard,
    buildButtonRouteAuditAcknowledgementAlertDeliveryDashboard,
    renderMarkdown,
  },
};
