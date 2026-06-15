const {
  _internals: canaryInternals,
} = require("./discordos-music-provider-queue-interaction-live-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildInteractionAdmissionGate(canary) {
  const admitted = Boolean(
    canary.canary.customId
      && canary.canary.providerTrackId
      && canary.canary.signedInteractionProof
      && canary.canary.queuesMetadataOnly
      && !canary.canary.callsMusicProviders
      && !canary.canary.controlsPlayback
  );
  return {
    admitted,
    admissionStatus: admitted ? "admitted_for_metadata_queue_only" : "blocked",
    customId: canary.canary.customId,
    providerTrackId: canary.canary.providerTrackId,
    signedInteractionProof: canary.canary.signedInteractionProof,
    liveExecutionAttempted: false,
    queuesMetadataOnly: canary.canary.queuesMetadataOnly === true,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
  };
}

function validateInteractionAdmissionGate({ canary, gate }) {
  const reasonCodes = [...canary.reasonCodes];
  if (!gate.admitted) reasonCodes.push("provider_queue_interaction_admission_not_admitted");
  if (gate.liveExecutionAttempted || gate.callsMusicProviders || gate.controlsPlayback) {
    reasonCodes.push("provider_queue_interaction_admission_side_effect_boundary_failed");
  }
  if (canary.slashCommandsAdmitted || gate.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_admission_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueInteractionAdmissionGate(input = {}) {
  const canary = await canaryInternals.buildMusicProviderQueueInteractionLiveCanary(input);
  const gate = buildInteractionAdmissionGate(canary);
  const reasonCodes = validateInteractionAdmissionGate({ canary, gate });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_provider_queue_interaction_admission_gate_ready" : "blocked",
    sourceStatus: canary.status,
    gate,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_interaction_admission_gate_ready"
        : "discordos.music_provider.queue_interaction_admission_gate_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_interaction_admission_gate",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        admitted: gate.admitted,
        queuesMetadataOnly: gate.queuesMetadataOnly,
        liveExecutionAttempted: gate.liveExecutionAttempted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Interaction Admission Gate",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.gate.admissionStatus}\``,
    `- custom id: \`${result.gate.customId || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueInteractionAdmissionGate(options);
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
    buildInteractionAdmissionGate,
    validateInteractionAdmissionGate,
    buildMusicProviderQueueInteractionAdmissionGate,
    renderMarkdown,
  },
};
