const {
  _internals: canaryInternals,
} = require("./discordos-music-provider-metadata-live-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildQueuePreviewFromProviderResult(result = {}, index = 0) {
  return {
    queuePreviewId: `provider-preview-${index + 1}`,
    providerTrackId: result.providerTrackId,
    title: result.title,
    artistName: result.artistName,
    durationMs: result.durationMs,
    sourceUrl: result.sourceUrl,
    userFacingLabel: [result.title, result.artistName].filter(Boolean).join(" - "),
    selectableByButton: true,
    slashCommandsAdmitted: false,
    controlsPlayback: false,
  };
}

function validateQueuePreviews(previews = []) {
  const reasonCodes = [];
  for (const [index, preview] of previews.entries()) {
    if (!preview.providerTrackId) reasonCodes.push(`preview_provider_track_id_missing:${index}`);
    if (!preview.title) reasonCodes.push(`preview_title_missing:${index}`);
    if (preview.controlsPlayback) reasonCodes.push(`preview_controls_playback:${index}`);
    if (preview.slashCommandsAdmitted) reasonCodes.push(`preview_slash_command_admitted:${index}`);
  }
  return reasonCodes;
}

async function buildMusicProviderMetadataSelectionPreview(input = {}) {
  const canaryInput = {
    providerAction: "search",
    query: "Music Sesh Selection Preview",
    resultLimit: 5,
    ...input,
  };
  const canary = await canaryInternals.buildMusicProviderMetadataLiveCanary(canaryInput);
  const fallbackPreview = canary.liveResult.normalizedResults.length === 0 && canaryInput.live !== true;
  const sourceResults = canary.liveResult.normalizedResults.length > 0
    ? canary.liveResult.normalizedResults
    : [
        {
          providerTrackId: "preview-track-1",
          title: "Music Sesh Preview Track",
          artistName: "Preview Artist",
          durationMs: 180000,
          sourceUrl: null,
        },
      ];
  const canaryReasonCodes = fallbackPreview
    ? canary.reasonCodes.filter((code) => code !== "music_provider_adapter_double_guard_missing")
    : canary.reasonCodes;
  const queuePreviews = sourceResults.map(buildQueuePreviewFromProviderResult);
  const reasonCodes = [...new Set([
    ...canaryReasonCodes,
    ...validateQueuePreviews(queuePreviews),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: canary.callsMusicProviders,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "metadata_selection_preview_ready" : "blocked",
    liveAttempted: canary.liveAttempted,
    fallbackPreview,
    queuePreviewCount: queuePreviews.length,
    queuePreviews,
    providerAdmission: canary.providerAdmission,
    liveAdmission: canary.liveAdmission,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.metadata_selection_preview_ready"
        : "discordos.music_provider.metadata_selection_preview_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.metadata_selection_preview",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        previewCount: result.queuePreviewCount,
        liveAttempted: result.liveAttempted,
        controlsPlayback: false,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Metadata Selection Preview",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- queue previews: \`${result.queuePreviewCount}\``,
    `- first preview: \`${result.queuePreviews[0]?.userFacingLabel || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderMetadataSelectionPreview(options);
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
    buildQueuePreviewFromProviderResult,
    validateQueuePreviews,
    buildMusicProviderMetadataSelectionPreview,
    renderMarkdown,
  },
};
