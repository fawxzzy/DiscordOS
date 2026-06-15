const {
  _internals: canaryInternals,
} = require("./discordos-music-sesh-response-delivery-rate-limit-alert-delivery-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildRateLimitAlertDeliveryReadback(canaryResult) {
  const canary = canaryResult.canary;
  return {
    deliveryAdmissionStatus: canary.deliveryAdmissionStatus,
    alertRequired: canary.alertRequired === true,
    alertStatus: canary.alertStatus,
    decision: canary.decision,
    targetChannelId: canary.targetChannelId,
    deliveryDecisionVisible: true,
    noSendBoundaryConfirmed: canary.sendsMessagesInCanary === false && canaryResult.sendsMessages === false,
    noDiscordApiBoundaryConfirmed: canary.callsDiscordApi === false && canaryResult.callsDiscordApi === false,
    userContentExposed: canary.userContentExposed === true,
    mentionSafetyPreserved: canary.mentionSafetyPreserved === true,
    slashCommandsAdmitted: false,
  };
}

function validateRateLimitAlertDeliveryReadback({ canaryResult, readback }) {
  const reasonCodes = [...canaryResult.reasonCodes];
  if (!readback.deliveryDecisionVisible) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_readback_visibility_missing");
  }
  if (!readback.noSendBoundaryConfirmed || !readback.noDiscordApiBoundaryConfirmed) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_readback_send_boundary_failed");
  }
  if (readback.userContentExposed || !readback.mentionSafetyPreserved) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_readback_privacy_boundary_failed");
  }
  if (readback.alertRequired && readback.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_readback_admission_missing");
  }
  if (canaryResult.slashCommandsAdmitted || readback.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_readback_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryRateLimitAlertDeliveryReadback(input = {}) {
  const canaryResult = await canaryInternals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryCanary(input);
  const readback = buildRateLimitAlertDeliveryReadback(canaryResult);
  const reasonCodes = validateRateLimitAlertDeliveryReadback({ canaryResult, readback });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_response_delivery_rate_limit_alert_delivery_readback_ready" : "blocked",
    sourceStatus: canaryResult.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_readback_ready"
        : "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: readback.alertRequired,
        admission: readback.deliveryAdmissionStatus,
        noSendBoundaryConfirmed: readback.noSendBoundaryConfirmed,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Rate-Limit Alert Delivery Readback",
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
    const result = await buildMusicSeshResponseDeliveryRateLimitAlertDeliveryReadback(options);
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
    buildRateLimitAlertDeliveryReadback,
    validateRateLimitAlertDeliveryReadback,
    buildMusicSeshResponseDeliveryRateLimitAlertDeliveryReadback,
    renderMarkdown,
  },
};
