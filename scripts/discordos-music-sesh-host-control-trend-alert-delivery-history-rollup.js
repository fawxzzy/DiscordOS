const {
  _internals: historyInternals,
} = require("./discordos-music-sesh-host-control-trend-alert-delivery-history");

function parseArgs(args) {
  return historyInternals.parseArgs(args);
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function buildTrendAlertDeliveryHistoryRollup(historyResult) {
  const records = Array.isArray(historyResult.history.records) ? historyResult.history.records : [];
  return {
    rollupStatus: "rollup_ready",
    sourceHistoryStatus: historyResult.history.historyStatus,
    recordCount: historyResult.history.recordCount,
    maxRecords: historyResult.history.maxRecords,
    routeIds: unique(records.map((record) => record.routeId)),
    alertLevels: unique(records.map((record) => record.alertLevel)),
    deliveryDecisionVisible: records.every((record) => record.deliveryDecisionVisible === true),
    noSendBoundaryConfirmed: records.every((record) => record.noSendBoundaryConfirmed === true),
    noPlaybackBoundaryConfirmed: records.every((record) => record.noPlaybackBoundaryConfirmed === true),
    noProviderBoundaryConfirmed: records.every((record) => record.noProviderBoundaryConfirmed === true),
    repeatedPatternSummaryVisible: records.length > 0,
    sendsMessagesInRollup: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateTrendAlertDeliveryHistoryRollup({ historyResult, rollup }) {
  const reasonCodes = [...historyResult.reasonCodes];
  if (rollup.rollupStatus !== "rollup_ready" || rollup.sourceHistoryStatus !== "bounded_ready") {
    reasonCodes.push("host_control_trend_alert_delivery_history_rollup_status_invalid");
  }
  if (rollup.recordCount < 1 || rollup.recordCount > rollup.maxRecords || !rollup.repeatedPatternSummaryVisible) {
    reasonCodes.push("host_control_trend_alert_delivery_history_rollup_bounds_failed");
  }
  if (!rollup.deliveryDecisionVisible || !rollup.noSendBoundaryConfirmed || !rollup.noPlaybackBoundaryConfirmed || !rollup.noProviderBoundaryConfirmed) {
    reasonCodes.push("host_control_trend_alert_delivery_history_rollup_boundary_failed");
  }
  if (rollup.sendsMessagesInRollup || rollup.callsDiscordApi || historyResult.sendsMessages) {
    reasonCodes.push("host_control_trend_alert_delivery_history_rollup_send_attempted");
  }
  if (rollup.executesStorageWrite || historyResult.executesStorageWrite) {
    reasonCodes.push("host_control_trend_alert_delivery_history_rollup_storage_write_attempted");
  }
  if (historyResult.controlsPlayback || historyResult.callsMusicProviders) {
    reasonCodes.push("host_control_trend_alert_delivery_history_rollup_runtime_boundary_failed");
  }
  if (historyResult.slashCommandsAdmitted || rollup.slashCommandsAdmitted) {
    reasonCodes.push("host_control_trend_alert_delivery_history_rollup_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlTrendAlertDeliveryHistoryRollup(input = {}) {
  const historyResult = await historyInternals.buildMusicSeshHostControlTrendAlertDeliveryHistory(input);
  const rollup = buildTrendAlertDeliveryHistoryRollup(historyResult);
  const reasonCodes = validateTrendAlertDeliveryHistoryRollup({ historyResult, rollup });
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
    status: reasonCodes.length === 0 ? "music_sesh_host_control_trend_alert_delivery_history_rollup_ready" : "blocked",
    sourceStatus: historyResult.status,
    rollup,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_trend_alert_delivery_history_rollup_ready"
        : "discordos.music_sesh.host_control_trend_alert_delivery_history_rollup_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_trend_alert_delivery_history_rollup",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        recordCount: rollup.recordCount,
        routeCount: rollup.routeIds.length,
        alertLevelCount: rollup.alertLevels.length,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Trend Alert Delivery History Rollup",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- rollup status: \`${result.rollup.rollupStatus}\``,
    `- record count: \`${result.rollup.recordCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlTrendAlertDeliveryHistoryRollup(options);
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
    buildTrendAlertDeliveryHistoryRollup,
    validateTrendAlertDeliveryHistoryRollup,
    buildMusicSeshHostControlTrendAlertDeliveryHistoryRollup,
    renderMarkdown,
  },
};
