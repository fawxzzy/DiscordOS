const {
  _internals: readbackInternals,
} = require("./discordos-music-provider-queue-interaction-admission-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function buildProviderQueueAdmissionDashboard(readbackResult) {
  const readback = readbackResult.readback;
  return {
    statusLine: readback.admissionStatus === "admitted_for_metadata_queue_only" ? "metadata_queue_admitted" : "blocked",
    admissionStatus: readback.admissionStatus,
    customIdVisible: readback.customIdVisible === true,
    providerTrackMetadataVisible: readback.providerTrackMetadataVisible === true,
    signatureProofVisible: readback.signatureProofVisible === true,
    queuesMetadataOnly: readback.queuesMetadataOnly === true,
    liveExecutionAttempted: readback.liveExecutionAttempted === true,
    noProviderBoundaryConfirmed: readback.noProviderBoundaryConfirmed === true,
    noPlaybackBoundaryConfirmed: readback.noPlaybackBoundaryConfirmed === true,
    operatorScanReady: true,
    slashCommandsAdmitted: false,
  };
}

function validateProviderQueueAdmissionDashboard({ readbackResult, dashboard }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (
    !dashboard.customIdVisible
    || !dashboard.providerTrackMetadataVisible
    || !dashboard.signatureProofVisible
    || !dashboard.operatorScanReady
  ) {
    reasonCodes.push("provider_queue_interaction_admission_dashboard_visibility_missing");
  }
  if (
    !dashboard.queuesMetadataOnly
    || dashboard.liveExecutionAttempted
    || !dashboard.noProviderBoundaryConfirmed
    || !dashboard.noPlaybackBoundaryConfirmed
  ) {
    reasonCodes.push("provider_queue_interaction_admission_dashboard_boundary_failed");
  }
  if (readbackResult.slashCommandsAdmitted || dashboard.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_admission_dashboard_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueInteractionAdmissionDashboard(input = {}) {
  const readbackResult = await readbackInternals.buildMusicProviderQueueInteractionAdmissionReadback(input);
  const dashboard = buildProviderQueueAdmissionDashboard(readbackResult);
  const reasonCodes = validateProviderQueueAdmissionDashboard({ readbackResult, dashboard });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_provider_queue_interaction_admission_dashboard_ready" : "blocked",
    sourceStatus: readbackResult.status,
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_interaction_admission_dashboard_ready"
        : "discordos.music_provider.queue_interaction_admission_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_interaction_admission_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        statusLine: dashboard.statusLine,
        queuesMetadataOnly: dashboard.queuesMetadataOnly,
        operatorScanReady: dashboard.operatorScanReady,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Interaction Admission Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- status line: \`${result.dashboard.statusLine}\``,
    `- operator scan ready: \`${result.dashboard.operatorScanReady ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueInteractionAdmissionDashboard(options);
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
    buildProviderQueueAdmissionDashboard,
    validateProviderQueueAdmissionDashboard,
    buildMusicProviderQueueInteractionAdmissionDashboard,
    renderMarkdown,
  },
};
