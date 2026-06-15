const crypto = require("node:crypto");
const {
  _internals: readbackInternals,
} = require("./discordos-music-provider-queue-surface-interaction-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function signCanaryInteraction(readback) {
  const source = [
    readback.interactionType,
    readback.customId,
    readback.providerTrackId,
  ].join(":");
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 24);
}

function buildLiveCanaryPlan(readback) {
  return {
    interactionType: readback.interactionType,
    customId: readback.customId,
    providerTrackId: readback.providerTrackId,
    signedInteractionProof: signCanaryInteraction(readback),
    liveAttempted: false,
    applyRequired: false,
    queuesMetadataOnly: readback.queuesMetadataOnly === true,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
  };
}

function validateLiveCanary({ readbackResult, canary }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (!canary.customId || !canary.providerTrackId || !canary.signedInteractionProof) {
    reasonCodes.push("provider_queue_interaction_live_canary_signature_missing");
  }
  if (!canary.queuesMetadataOnly || canary.callsMusicProviders || canary.controlsPlayback) {
    reasonCodes.push("provider_queue_interaction_live_canary_side_effect_boundary_failed");
  }
  if (readbackResult.slashCommandsAdmitted || canary.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_live_canary_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueInteractionLiveCanary(input = {}) {
  const readbackResult = await readbackInternals.buildMusicProviderQueueSurfaceInteractionReadback(input);
  const canary = buildLiveCanaryPlan(readbackResult.readback);
  const reasonCodes = validateLiveCanary({ readbackResult, canary });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_provider_queue_interaction_live_canary_ready" : "blocked",
    sourceStatus: readbackResult.status,
    canary,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_interaction_live_canary_ready"
        : "discordos.music_provider.queue_interaction_live_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_interaction_live_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        interactionType: canary.interactionType,
        liveAttempted: canary.liveAttempted,
        queuesMetadataOnly: canary.queuesMetadataOnly,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Interaction Live Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- custom id: \`${result.canary.customId || "none"}\``,
    `- live attempted: \`${result.canary.liveAttempted ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueInteractionLiveCanary(options);
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
    signCanaryInteraction,
    buildLiveCanaryPlan,
    validateLiveCanary,
    buildMusicProviderQueueInteractionLiveCanary,
    renderMarkdown,
  },
};
