const {
  _internals: canaryInternals,
} = require("./discordos-button-route-audit-acknowledgement-alert-delivery-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildAcknowledgementAlertDeliveryReadback(canaryResult) {
  const canary = canaryResult.canary;
  return {
    deliveryAdmissionStatus: canary.deliveryAdmissionStatus,
    alertRequired: canary.alertRequired === true,
    alertStatus: canary.alertStatus,
    preservesActorRedaction: canary.preservesActorRedaction === true,
    preservesTokenRedaction: canary.preservesTokenRedaction === true,
    deliveryDecisionVisible: canary.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: canary.sendsMessagesInCanary === false && canaryResult.sendsMessages === false,
    noDiscordApiBoundaryConfirmed: canary.callsDiscordApi === false && canaryResult.callsDiscordApi === false,
    noStorageWriteBoundaryConfirmed: canary.executesStorageWrite === false && canaryResult.executesStorageWrite === false,
    slashCommandsAdmitted: false,
  };
}

function validateAcknowledgementAlertDeliveryReadback({ canaryResult, readback }) {
  const reasonCodes = [...canaryResult.reasonCodes];
  if (!readback.deliveryDecisionVisible) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_readback_visibility_missing");
  }
  if (!readback.preservesActorRedaction || !readback.preservesTokenRedaction) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_readback_redaction_failed");
  }
  if (!readback.noSendBoundaryConfirmed || !readback.noDiscordApiBoundaryConfirmed || canaryResult.sendsMessages || canaryResult.callsDiscordApi) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_readback_send_boundary_failed");
  }
  if (!readback.noStorageWriteBoundaryConfirmed || canaryResult.executesStorageWrite) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_readback_storage_write_attempted");
  }
  if (readback.alertRequired && readback.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("button_route_audit_ack_alert_delivery_readback_admission_missing");
  }
  if (canaryResult.slashCommandsAdmitted || readback.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_ack_alert_delivery_readback_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAcknowledgementAlertDeliveryReadback(input = {}) {
  const canaryResult = await canaryInternals.buildButtonRouteAuditAcknowledgementAlertDeliveryCanary(input);
  const readback = buildAcknowledgementAlertDeliveryReadback(canaryResult);
  const reasonCodes = validateAcknowledgementAlertDeliveryReadback({ canaryResult, readback });
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
    status: reasonCodes.length === 0 ? "button_route_audit_acknowledgement_alert_delivery_readback_ready" : "blocked",
    sourceStatus: canaryResult.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_acknowledgement_alert_delivery_readback_ready"
        : "discordos.button_route.audit_acknowledgement_alert_delivery_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_acknowledgement_alert_delivery_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: readback.alertRequired,
        admission: readback.deliveryAdmissionStatus,
        preservesRedaction: readback.preservesActorRedaction && readback.preservesTokenRedaction,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Acknowledgement Alert Delivery Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.readback.deliveryAdmissionStatus}\``,
    `- no-send boundary: \`${result.readback.noSendBoundaryConfirmed ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAcknowledgementAlertDeliveryReadback(options);
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
    buildAcknowledgementAlertDeliveryReadback,
    validateAcknowledgementAlertDeliveryReadback,
    buildButtonRouteAuditAcknowledgementAlertDeliveryReadback,
    renderMarkdown,
  },
};
