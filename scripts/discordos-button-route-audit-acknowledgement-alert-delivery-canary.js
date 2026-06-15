const {
  _internals: alertingInternals,
} = require("./discordos-button-route-audit-acknowledgement-history-alerting");

function parseArgs(args) {
  return alertingInternals.parseArgs(args);
}

function buildAcknowledgementAlertDeliveryCanary(alertingResult) {
  const alerting = alertingResult.alerting;
  return {
    deliveryAdmissionStatus: alerting.alertRequired ? "admitted_no_send" : "no_alert_to_deliver",
    alertRequired: alerting.alertRequired === true,
    alertStatus: alerting.alertStatus,
    preservesActorRedaction: alerting.preservesActorRedaction === true,
    preservesTokenRedaction: alerting.preservesTokenRedaction === true,
    deliveryDecisionVisible: true,
    sendsMessagesInCanary: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateAcknowledgementAlertDeliveryCanary({ alertingResult, canary }) {
  const reasonCodes = [...alertingResult.reasonCodes];
  if (!canary.deliveryDecisionVisible) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_canary_visibility_missing");
  }
  if (!canary.preservesActorRedaction || !canary.preservesTokenRedaction) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_canary_redaction_failed");
  }
  if (canary.sendsMessagesInCanary || canary.callsDiscordApi || alertingResult.sendsMessages || alertingResult.callsDiscordApi) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_canary_send_boundary_failed");
  }
  if (canary.executesStorageWrite || alertingResult.executesStorageWrite) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_canary_storage_write_attempted");
  }
  if (canary.alertRequired && canary.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("button_route_audit_ack_alert_delivery_canary_admission_missing");
  }
  if (alertingResult.slashCommandsAdmitted || canary.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_canary_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAcknowledgementAlertDeliveryCanary(input = {}) {
  const alertingResult = await alertingInternals.buildButtonRouteAuditAcknowledgementHistoryAlerting(input);
  const canary = buildAcknowledgementAlertDeliveryCanary(alertingResult);
  const reasonCodes = validateAcknowledgementAlertDeliveryCanary({ alertingResult, canary });
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
    status: reasonCodes.length === 0 ? "button_route_audit_acknowledgement_alert_delivery_canary_ready" : "blocked",
    sourceStatus: alertingResult.status,
    canary,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_acknowledgement_alert_delivery_canary_ready"
        : "discordos.button_route.audit_acknowledgement_alert_delivery_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_acknowledgement_alert_delivery_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: canary.alertRequired,
        admission: canary.deliveryAdmissionStatus,
        preservesRedaction: canary.preservesActorRedaction && canary.preservesTokenRedaction,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Acknowledgement Alert Delivery Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.canary.deliveryAdmissionStatus}\``,
    `- alert required: \`${result.canary.alertRequired ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAcknowledgementAlertDeliveryCanary(options);
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
    buildAcknowledgementAlertDeliveryCanary,
    validateAcknowledgementAlertDeliveryCanary,
    buildButtonRouteAuditAcknowledgementAlertDeliveryCanary,
    renderMarkdown,
  },
};
