const {
  _internals: alertingInternals,
} = require("./discordos-music-sesh-response-delivery-rate-limit-alerting");

function parseArgs(args) {
  return alertingInternals.parseArgs(args);
}

function buildRateLimitAlertDeliveryCanary(alertingResult) {
  const alerting = alertingResult.alerting;
  return {
    alertRequired: alerting.alertRequired === true,
    deliveryAdmissionStatus: alerting.alertRequired ? "admitted_no_send" : "not_required",
    alertStatus: alerting.alertStatus,
    decision: alerting.decision,
    targetChannelId: alerting.targetChannelId,
    userContentExposed: false,
    mentionSafetyPreserved: alerting.mentionSafetyPreserved === true,
    sendsMessagesInCanary: false,
    callsDiscordApi: false,
    slashCommandsAdmitted: false,
  };
}

function validateRateLimitAlertDeliveryCanary({ alertingResult, canary }) {
  const reasonCodes = [...alertingResult.reasonCodes];
  if (canary.userContentExposed || !canary.mentionSafetyPreserved) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_canary_privacy_boundary_failed");
  }
  if (canary.sendsMessagesInCanary || canary.callsDiscordApi || alertingResult.sendsMessages || alertingResult.callsDiscordApi) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_canary_send_boundary_failed");
  }
  if (canary.alertRequired && canary.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_canary_admission_missing");
  }
  if (alertingResult.slashCommandsAdmitted || canary.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_canary_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryRateLimitAlertDeliveryCanary(input = {}) {
  const alertingResult = await alertingInternals.buildMusicSeshResponseDeliveryRateLimitAlerting(input);
  const canary = buildRateLimitAlertDeliveryCanary(alertingResult);
  const reasonCodes = validateRateLimitAlertDeliveryCanary({ alertingResult, canary });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_response_delivery_rate_limit_alert_delivery_canary_ready" : "blocked",
    sourceStatus: alertingResult.status,
    canary,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_canary_ready"
        : "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: canary.alertRequired,
        admission: canary.deliveryAdmissionStatus,
        userContentExposed: canary.userContentExposed,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Rate-Limit Alert Delivery Canary",
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
    const result = await buildMusicSeshResponseDeliveryRateLimitAlertDeliveryCanary(options);
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
    buildRateLimitAlertDeliveryCanary,
    validateRateLimitAlertDeliveryCanary,
    buildMusicSeshResponseDeliveryRateLimitAlertDeliveryCanary,
    renderMarkdown,
  },
};
