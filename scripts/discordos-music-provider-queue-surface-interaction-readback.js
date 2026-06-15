const {
  _internals: publishInternals,
} = require("./discordos-music-provider-queue-surface-publish-readback");

function parseArgs(args) {
  return publishInternals.parseArgs(args);
}

function buildInteractionReadback({ publishResult }) {
  const plan = publishResult.plan || {};
  const customId = plan.firstCustomId || null;
  const providerTrackId = plan.metadataReadback?.providerTrackId || null;
  return {
    interactionType: "MESSAGE_COMPONENT",
    customId,
    providerTrackId,
    mapsToQueueMetadata: Boolean(customId && providerTrackId),
    queuesMetadataOnly: true,
    controlsPlayback: false,
    callsMusicProviders: false,
    slashCommandsAdmitted: false,
  };
}

function validateInteractionReadback({ publishResult, readback }) {
  const reasonCodes = [...publishResult.reasonCodes];
  if (publishResult.callsMusicProviders || publishResult.controlsPlayback) {
    reasonCodes.push("provider_queue_interaction_readback_side_effect_boundary_failed");
  }
  if (publishResult.slashCommandsAdmitted || readback.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_readback_slash_command_admitted");
  }
  if (!readback.mapsToQueueMetadata) {
    reasonCodes.push("provider_queue_interaction_readback_metadata_missing");
  }
  if (!readback.queuesMetadataOnly || readback.controlsPlayback || readback.callsMusicProviders) {
    reasonCodes.push("provider_queue_interaction_readback_not_metadata_only");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueSurfaceInteractionReadback(input = {}) {
  const publishResult = await publishInternals.buildMusicProviderQueueSurfacePublishReadback(input);
  const readback = buildInteractionReadback({ publishResult });
  const reasonCodes = validateInteractionReadback({ publishResult, readback });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "provider_queue_surface_interaction_readback_ready" : "blocked",
    sourceStatus: publishResult.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_surface_interaction_readback_ready"
        : "discordos.music_provider.queue_surface_interaction_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_surface_interaction_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        mapsToQueueMetadata: readback.mapsToQueueMetadata,
        interactionType: readback.interactionType,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Surface Interaction Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- maps to queue metadata: \`${result.readback.mapsToQueueMetadata ? "true" : "false"}\``,
    `- metadata only: \`${result.readback.queuesMetadataOnly ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueSurfaceInteractionReadback(options);
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
    buildInteractionReadback,
    validateInteractionReadback,
    buildMusicProviderQueueSurfaceInteractionReadback,
    renderMarkdown,
  },
};
