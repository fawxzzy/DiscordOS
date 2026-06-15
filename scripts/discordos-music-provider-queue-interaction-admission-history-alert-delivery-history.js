const {
  _internals: dashboardInternals,
} = require("./discordos-music-provider-queue-interaction-admission-history-alert-delivery-dashboard");

function parseArgs(args) {
  return dashboardInternals.parseArgs(args);
}

function buildProviderAdmissionHistoryAlertDeliveryHistory(dashboardResult) {
  const dashboard = dashboardResult.dashboard;
  return {
    historyStatus: "bounded_ready",
    recordCount: 1,
    maxRecords: 10,
    records: [
      {
        statusLine: dashboard.statusLine,
        deliveryAdmissionStatus: dashboard.deliveryAdmissionStatus,
        alertStatus: dashboard.alertStatus,
        signatureProofVisible: dashboard.signatureProofVisible === true,
        providerTrackMetadataVisible: dashboard.providerTrackMetadataVisible === true,
        noProviderBoundaryConfirmed: dashboard.noProviderBoundaryConfirmed === true,
        noPlaybackBoundaryConfirmed: dashboard.noPlaybackBoundaryConfirmed === true,
        deliveryDecisionVisible: dashboard.deliveryDecisionVisible === true,
        noSendBoundaryConfirmed: dashboard.noSendBoundaryConfirmed === true,
        noDiscordApiBoundaryConfirmed: dashboard.noDiscordApiBoundaryConfirmed === true,
        noStorageWriteBoundaryConfirmed: dashboard.noStorageWriteBoundaryConfirmed === true,
      },
    ],
    repeatsTracked: true,
    sendsMessagesInHistory: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateProviderAdmissionHistoryAlertDeliveryHistory({ dashboardResult, history }) {
  const reasonCodes = [...dashboardResult.reasonCodes];
  if (history.historyStatus !== "bounded_ready" || history.recordCount < 1 || history.recordCount > history.maxRecords) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_bounds_failed");
  }
  if (!history.repeatsTracked || !Array.isArray(history.records) || history.records.length !== history.recordCount) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_tracking_failed");
  }
  if (!history.records.every((record) =>
    record.statusLine === "ready"
      && record.signatureProofVisible
      && record.providerTrackMetadataVisible
      && record.noProviderBoundaryConfirmed
      && record.noPlaybackBoundaryConfirmed
      && record.deliveryDecisionVisible
      && record.noSendBoundaryConfirmed
      && record.noDiscordApiBoundaryConfirmed
      && record.noStorageWriteBoundaryConfirmed
  )) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_record_invalid");
  }
  if (history.sendsMessagesInHistory || history.callsDiscordApi || dashboardResult.sendsMessages || dashboardResult.callsDiscordApi) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_send_boundary_failed");
  }
  if (history.executesStorageWrite || dashboardResult.executesStorageWrite) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_storage_write_attempted");
  }
  if (dashboardResult.callsMusicProviders || dashboardResult.controlsPlayback) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_provider_boundary_failed");
  }
  if (dashboardResult.slashCommandsAdmitted || history.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryHistory(input = {}) {
  const dashboardResult = await dashboardInternals.buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryDashboard(input);
  const history = buildProviderAdmissionHistoryAlertDeliveryHistory(dashboardResult);
  const reasonCodes = validateProviderAdmissionHistoryAlertDeliveryHistory({ dashboardResult, history });
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
    status: reasonCodes.length === 0 ? "music_provider_queue_interaction_admission_history_alert_delivery_history_ready" : "blocked",
    sourceStatus: dashboardResult.status,
    history,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_interaction_admission_history_alert_delivery_history_ready"
        : "discordos.music_provider.queue_interaction_admission_history_alert_delivery_history_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_interaction_admission_history_alert_delivery_history",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        recordCount: history.recordCount,
        historyStatus: history.historyStatus,
        repeatsTracked: history.repeatsTracked,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Interaction Admission History Alert Delivery History",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
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
    const result = await buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryHistory(options);
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
    buildProviderAdmissionHistoryAlertDeliveryHistory,
    validateProviderAdmissionHistoryAlertDeliveryHistory,
    buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryHistory,
    renderMarkdown,
  },
};
