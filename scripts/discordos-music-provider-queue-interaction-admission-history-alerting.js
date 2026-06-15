const {
  _internals: historyInternals,
} = require("./discordos-music-provider-queue-interaction-admission-history");

function parseArgs(args) {
  return historyInternals.parseArgs(args);
}

function buildProviderQueueAdmissionHistoryAlerting(historyResult) {
  const history = historyResult.history;
  const alertRequired = history.recordCount >= history.maxRecords;
  return {
    alertRequired,
    alertStatus: alertRequired ? "would_route_no_send" : "not_required",
    historyStatus: history.historyStatus,
    recordCount: history.recordCount,
    maxRecords: history.maxRecords,
    repeatedPatternVisible: history.recordCount > 0,
    signatureProofVisible: history.records.every((record) => record.signatureProofVisible === true),
    providerTrackMetadataVisible: history.records.every((record) => record.providerTrackMetadataVisible === true),
    noProviderBoundaryConfirmed: history.records.every((record) => record.noProviderBoundaryConfirmed === true),
    noPlaybackBoundaryConfirmed: history.records.every((record) => record.noPlaybackBoundaryConfirmed === true),
    sendsMessagesInAlerting: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateProviderQueueAdmissionHistoryAlerting({ historyResult, alerting }) {
  const reasonCodes = [...historyResult.reasonCodes];
  if (!alerting.repeatedPatternVisible || alerting.historyStatus !== "bounded_ready") {
    reasonCodes.push("provider_queue_interaction_admission_history_alerting_visibility_missing");
  }
  if (!alerting.signatureProofVisible || !alerting.providerTrackMetadataVisible) {
    reasonCodes.push("provider_queue_interaction_admission_history_alerting_metadata_missing");
  }
  if (!alerting.noProviderBoundaryConfirmed || !alerting.noPlaybackBoundaryConfirmed || historyResult.callsMusicProviders || historyResult.controlsPlayback) {
    reasonCodes.push("provider_queue_interaction_admission_history_alerting_boundary_failed");
  }
  if (alerting.sendsMessagesInAlerting || alerting.callsDiscordApi || historyResult.sendsMessages) {
    reasonCodes.push("provider_queue_interaction_admission_history_alerting_send_attempted");
  }
  if (alerting.executesStorageWrite || historyResult.executesStorageWrite) {
    reasonCodes.push("provider_queue_interaction_admission_history_alerting_storage_write_attempted");
  }
  if (alerting.alertRequired && alerting.alertStatus !== "would_route_no_send") {
    reasonCodes.push("provider_queue_interaction_admission_history_alerting_admission_missing");
  }
  if (historyResult.slashCommandsAdmitted || alerting.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_admission_history_alerting_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueInteractionAdmissionHistoryAlerting(input = {}) {
  const historyResult = await historyInternals.buildMusicProviderQueueInteractionAdmissionHistory(input);
  const alerting = buildProviderQueueAdmissionHistoryAlerting(historyResult);
  const reasonCodes = validateProviderQueueAdmissionHistoryAlerting({ historyResult, alerting });
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
    status: reasonCodes.length === 0 ? "music_provider_queue_interaction_admission_history_alerting_ready" : "blocked",
    sourceStatus: historyResult.status,
    alerting,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_interaction_admission_history_alerting_ready"
        : "discordos.music_provider.queue_interaction_admission_history_alerting_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_interaction_admission_history_alerting",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: alerting.alertRequired,
        alertStatus: alerting.alertStatus,
        signatureProofVisible: alerting.signatureProofVisible,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Interaction Admission History Alerting",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- alert status: \`${result.alerting.alertStatus}\``,
    `- alert required: \`${result.alerting.alertRequired ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueInteractionAdmissionHistoryAlerting(options);
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
    buildProviderQueueAdmissionHistoryAlerting,
    validateProviderQueueAdmissionHistoryAlerting,
    buildMusicProviderQueueInteractionAdmissionHistoryAlerting,
    renderMarkdown,
  },
};
