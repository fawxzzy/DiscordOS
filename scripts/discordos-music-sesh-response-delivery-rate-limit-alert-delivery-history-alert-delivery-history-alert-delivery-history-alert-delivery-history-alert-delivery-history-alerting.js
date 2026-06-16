const {
  _internals: historyInternals,
} = require("./discordos-music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history");

function parseArgs(args) {
  return historyInternals.parseArgs(args);
}

function buildRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting(historyResult) {
  const history = historyResult.history;
  const records = Array.isArray(history.records) ? history.records : [];
  const alertRequired = records.length > 1;
  return {
    historyStatus: history.historyStatus,
    repeatedPatternVisible: history.repeatsTracked === true,
    recordCount: history.recordCount,
    alertRequired,
    alertStatus: alertRequired ? "attention_routed_no_send" : "not_required",
    deliveryDecisionVisible: records.every((record) => record.deliveryDecisionVisible === true),
    userContentHidden: records.every((record) => record.userContentHidden === true),
    mentionSafetyPreserved: records.every((record) => record.mentionSafetyPreserved === true),
    noSendBoundaryConfirmed: records.every((record) => record.noSendBoundaryConfirmed === true),
    noDiscordApiBoundaryConfirmed: records.every((record) => record.noDiscordApiBoundaryConfirmed === true),
    sendsMessagesInAlerting: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting({ historyResult, alerting }) {
  const reasonCodes = [...historyResult.reasonCodes];
  if (alerting.historyStatus !== "bounded_ready" || !alerting.repeatedPatternVisible || alerting.recordCount < 1) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_history_invalid");
  }
  if (!alerting.deliveryDecisionVisible || !alerting.userContentHidden || !alerting.mentionSafetyPreserved) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_visibility_failed");
  }
  if (!alerting.noSendBoundaryConfirmed || !alerting.noDiscordApiBoundaryConfirmed || alerting.sendsMessagesInAlerting || alerting.callsDiscordApi || historyResult.sendsMessages || historyResult.callsDiscordApi) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_send_boundary_failed");
  }
  if (alerting.executesStorageWrite || historyResult.executesStorageWrite) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_storage_write_attempted");
  }
  if (alerting.alertRequired && alerting.alertStatus !== "attention_routed_no_send") {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_route_missing");
  }
  if (historyResult.slashCommandsAdmitted || alerting.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting(input = {}) {
  const historyResult = await historyInternals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistory(input);
  const alerting = buildRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting(historyResult);
  const reasonCodes = validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting({ historyResult, alerting });
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
    status: reasonCodes.length === 0 ? "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_ready" : "blocked",
    sourceStatus: historyResult.status,
    alerting,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_ready"
        : "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: alerting.alertRequired,
        alertStatus: alerting.alertStatus,
        recordCount: alerting.recordCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Rate-Limit Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery History Alerting",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- alert required: \`${result.alerting.alertRequired ? "true" : "false"}\``,
    `- alert status: \`${result.alerting.alertStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting(options);
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
    buildRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting,
    validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting,
    buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting,
    renderMarkdown,
  },
};
