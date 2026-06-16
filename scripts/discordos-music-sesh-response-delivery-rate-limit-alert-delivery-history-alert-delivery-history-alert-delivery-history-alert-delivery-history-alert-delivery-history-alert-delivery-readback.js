const {
  _internals: canaryInternals,
} = require("./discordos-music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback(canaryResult) {
  const canary = canaryResult.canary;
  return {
    deliveryAdmissionStatus: canary.deliveryAdmissionStatus,
    alertRequired: canary.alertRequired === true,
    alertStatus: canary.alertStatus,
    historyStatus: canary.historyStatus,
    repeatedPatternVisible: canary.repeatedPatternVisible === true,
    userContentHidden: canary.userContentHidden === true,
    mentionSafetyPreserved: canary.mentionSafetyPreserved === true,
    deliveryDecisionVisible: canary.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: canary.noSendBoundaryConfirmed === true && canaryResult.sendsMessages === false,
    noDiscordApiBoundaryConfirmed: canary.callsDiscordApi === false && canaryResult.callsDiscordApi === false,
    noStorageWriteBoundaryConfirmed: canary.executesStorageWrite === false && canaryResult.executesStorageWrite === false,
    slashCommandsAdmitted: false,
  };
}

function validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback({ canaryResult, readback }) {
  const reasonCodes = [...canaryResult.reasonCodes];
  if (!readback.deliveryDecisionVisible || readback.historyStatus !== "bounded_ready" || !readback.repeatedPatternVisible) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback_visibility_missing");
  }
  if (!readback.userContentHidden || !readback.mentionSafetyPreserved) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback_privacy_failed");
  }
  if (!readback.noSendBoundaryConfirmed || !readback.noDiscordApiBoundaryConfirmed || canaryResult.sendsMessages || canaryResult.callsDiscordApi) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback_send_boundary_failed");
  }
  if (!readback.noStorageWriteBoundaryConfirmed || canaryResult.executesStorageWrite) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback_storage_write_attempted");
  }
  if (readback.alertRequired && readback.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback_admission_missing");
  }
  if (canaryResult.slashCommandsAdmitted || readback.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback(input = {}) {
  const canaryResult = await canaryInternals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary(input);
  const readback = buildRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback(canaryResult);
  const reasonCodes = validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback({ canaryResult, readback });
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
    status: reasonCodes.length === 0 ? "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback_ready" : "blocked",
    sourceStatus: canaryResult.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback_ready"
        : "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: readback.alertRequired,
        admission: readback.deliveryAdmissionStatus,
        userContentHidden: readback.userContentHidden,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Rate-Limit Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.readback.deliveryAdmissionStatus}\``,
    `- alert status: \`${result.readback.alertStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback(options);
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
    buildRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback,
    validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback,
    buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback,
    renderMarkdown,
  },
};
