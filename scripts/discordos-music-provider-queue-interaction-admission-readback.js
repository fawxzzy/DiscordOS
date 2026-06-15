const {
  _internals: gateInternals,
} = require("./discordos-music-provider-queue-interaction-admission-gate");

function parseArgs(args) {
  return gateInternals.parseArgs(args);
}

function buildProviderQueueAdmissionReadback(gateResult) {
  const gate = gateResult.gate;
  return {
    admissionStateVisible: Boolean(gate.admissionStatus),
    admissionStatus: gate.admissionStatus,
    customIdVisible: Boolean(gate.customId),
    providerTrackMetadataVisible: Boolean(gate.providerTrackId),
    signatureProofVisible: Boolean(gate.signedInteractionProof),
    queuesMetadataOnly: gate.queuesMetadataOnly === true,
    liveExecutionAttempted: gate.liveExecutionAttempted === true,
    noProviderBoundaryConfirmed: gateResult.callsMusicProviders === false && gate.callsMusicProviders === false,
    noPlaybackBoundaryConfirmed: gateResult.controlsPlayback === false && gate.controlsPlayback === false,
    slashCommandsAdmitted: false,
  };
}

function validateProviderQueueAdmissionReadback({ gateResult, readback }) {
  const reasonCodes = [...gateResult.reasonCodes];
  if (
    !readback.admissionStateVisible
    || !readback.customIdVisible
    || !readback.providerTrackMetadataVisible
    || !readback.signatureProofVisible
  ) {
    reasonCodes.push("provider_queue_interaction_admission_readback_identity_missing");
  }
  if (
    !readback.queuesMetadataOnly
    || readback.liveExecutionAttempted
    || !readback.noProviderBoundaryConfirmed
    || !readback.noPlaybackBoundaryConfirmed
  ) {
    reasonCodes.push("provider_queue_interaction_admission_readback_boundary_failed");
  }
  if (gateResult.slashCommandsAdmitted || readback.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_admission_readback_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueInteractionAdmissionReadback(input = {}) {
  const gateResult = await gateInternals.buildMusicProviderQueueInteractionAdmissionGate(input);
  const readback = buildProviderQueueAdmissionReadback(gateResult);
  const reasonCodes = validateProviderQueueAdmissionReadback({ gateResult, readback });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_provider_queue_interaction_admission_readback_ready" : "blocked",
    sourceStatus: gateResult.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_interaction_admission_readback_ready"
        : "discordos.music_provider.queue_interaction_admission_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_interaction_admission_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        admission: readback.admissionStatus,
        metadataOnly: readback.queuesMetadataOnly,
        liveExecutionAttempted: readback.liveExecutionAttempted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Interaction Admission Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.readback.admissionStatus}\``,
    `- metadata visible: \`${result.readback.providerTrackMetadataVisible ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueInteractionAdmissionReadback(options);
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
    buildProviderQueueAdmissionReadback,
    validateProviderQueueAdmissionReadback,
    buildMusicProviderQueueInteractionAdmissionReadback,
    renderMarkdown,
  },
};
