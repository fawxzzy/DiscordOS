const {
  _internals: dashboardInternals,
} = require("./discordos-music-provider-queue-interaction-admission-dashboard");

function parseArgs(args) {
  return dashboardInternals.parseArgs(args);
}

function buildProviderQueueAdmissionHistory(dashboardResult) {
  const dashboard = dashboardResult.dashboard;
  return {
    historyStatus: "bounded_ready",
    recordCount: 1,
    maxRecords: 10,
    records: [
      {
        statusLine: dashboard.statusLine,
        admissionStatus: dashboard.admissionStatus,
        customIdVisible: dashboard.customIdVisible === true,
        providerTrackMetadataVisible: dashboard.providerTrackMetadataVisible === true,
        signatureProofVisible: dashboard.signatureProofVisible === true,
        queuesMetadataOnly: dashboard.queuesMetadataOnly === true,
        liveExecutionAttempted: dashboard.liveExecutionAttempted === true,
        noProviderBoundaryConfirmed: dashboard.noProviderBoundaryConfirmed === true,
        noPlaybackBoundaryConfirmed: dashboard.noPlaybackBoundaryConfirmed === true,
      },
    ],
    repeatsTracked: true,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateProviderQueueAdmissionHistory({ dashboardResult, history }) {
  const reasonCodes = [...dashboardResult.reasonCodes];
  if (history.historyStatus !== "bounded_ready" || history.recordCount < 1 || history.recordCount > history.maxRecords) {
    reasonCodes.push("provider_queue_interaction_admission_history_bounds_failed");
  }
  if (!history.repeatsTracked || !Array.isArray(history.records) || history.records.length !== history.recordCount) {
    reasonCodes.push("provider_queue_interaction_admission_history_tracking_failed");
  }
  if (!history.records.every((record) =>
    record.customIdVisible
      && record.providerTrackMetadataVisible
      && record.signatureProofVisible
      && record.queuesMetadataOnly
      && !record.liveExecutionAttempted
      && record.noProviderBoundaryConfirmed
      && record.noPlaybackBoundaryConfirmed
  )) {
    reasonCodes.push("provider_queue_interaction_admission_history_record_invalid");
  }
  if (dashboardResult.callsMusicProviders || dashboardResult.controlsPlayback) {
    reasonCodes.push("provider_queue_interaction_admission_history_boundary_failed");
  }
  if (history.executesStorageWrite) {
    reasonCodes.push("provider_queue_interaction_admission_history_storage_write_attempted");
  }
  if (dashboardResult.slashCommandsAdmitted || history.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_admission_history_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueInteractionAdmissionHistory(input = {}) {
  const dashboardResult = await dashboardInternals.buildMusicProviderQueueInteractionAdmissionDashboard(input);
  const history = buildProviderQueueAdmissionHistory(dashboardResult);
  const reasonCodes = validateProviderQueueAdmissionHistory({ dashboardResult, history });
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
    status: reasonCodes.length === 0 ? "music_provider_queue_interaction_admission_history_ready" : "blocked",
    sourceStatus: dashboardResult.status,
    history,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_interaction_admission_history_ready"
        : "discordos.music_provider.queue_interaction_admission_history_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_interaction_admission_history",
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
    "# DiscordOS Music Provider Queue Interaction Admission History",
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
    const result = await buildMusicProviderQueueInteractionAdmissionHistory(options);
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
    buildProviderQueueAdmissionHistory,
    validateProviderQueueAdmissionHistory,
    buildMusicProviderQueueInteractionAdmissionHistory,
    renderMarkdown,
  },
};
