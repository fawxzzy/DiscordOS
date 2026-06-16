const {
  _internals: alertingInternals,
} = require("./discordos-button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting");

function parseArgs(args) {
  return alertingInternals.parseArgs(args);
}

function buildAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(alertingResult) {
  const alerting = alertingResult.alerting;
  return {
    deliveryAdmissionStatus: alerting.alertRequired ? "admitted_no_send" : "no_alert_to_deliver",
    alertRequired: alerting.alertRequired === true,
    alertStatus: alerting.alertStatus,
    historyStatus: alerting.historyStatus,
    redactionStatus: alerting.redactionStatus,
    preservesActorRedaction: alerting.preservesActorRedaction === true,
    preservesTokenRedaction: alerting.preservesTokenRedaction === true,
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

function validateAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary({ alertingResult, canary }) {
  const reasonCodes = [...alertingResult.reasonCodes];
  if (!canary.deliveryDecisionVisible || canary.historyStatus !== "bounded_ready") {
    reasonCodes.push("button_route_audit_ack_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_visibility_missing");
  }
  if (canary.redactionStatus !== "preserved" || !canary.preservesActorRedaction || !canary.preservesTokenRedaction) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_redaction_failed");
  }
  if (!canary.noSendBoundaryConfirmed || !canary.noDiscordApiBoundaryConfirmed || canary.sendsMessagesInCanary || canary.callsDiscordApi || alertingResult.sendsMessages || alertingResult.callsDiscordApi) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_send_boundary_failed");
  }
  if (!canary.noStorageWriteBoundaryConfirmed || canary.executesStorageWrite || alertingResult.executesStorageWrite) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_storage_write_attempted");
  }
  if (canary.alertRequired && canary.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("button_route_audit_ack_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_admission_missing");
  }
  if (alertingResult.slashCommandsAdmitted || canary.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(input = {}) {
  const alertingResult = await alertingInternals.buildButtonRouteAuditAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting(input);
  const canary = buildAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(alertingResult);
  const reasonCodes = validateAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary({ alertingResult, canary });
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
    status: reasonCodes.length === 0 ? "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_ready" : "blocked",
    sourceStatus: alertingResult.status,
    canary,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_ready"
        : "discordos.button_route.audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: canary.alertRequired,
        admission: canary.deliveryAdmissionStatus,
        redactionStatus: canary.redactionStatus,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Acknowledgement Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.canary.deliveryAdmissionStatus}\``,
    `- redaction status: \`${result.canary.redactionStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(options);
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
    buildAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary,
    validateAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary,
    buildButtonRouteAuditAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary,
    renderMarkdown,
  },
};
