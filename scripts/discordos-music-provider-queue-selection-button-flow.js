const {
  _internals: previewInternals,
} = require("./discordos-music-provider-metadata-selection-preview");

function parseArgs(args) {
  return previewInternals.parseArgs(args);
}

function buildSelectionButton(preview, index = 0) {
  const previewId = preview.queuePreviewId || `provider-preview-${index + 1}`;
  const customId = `music_sesh:provider_select:${previewId}`;
  return {
    customId,
    label: String(preview.title || `Track ${index + 1}`).slice(0, 80),
    providerTrackId: preview.providerTrackId,
    queuePreviewId: previewId,
    style: "secondary",
    disabled: false,
    slashCommandsAdmitted: false,
    controlsPlayback: false,
  };
}

function validateSelectionButtons(buttons = []) {
  const reasonCodes = [];
  for (const [index, button] of buttons.entries()) {
    if (!button.providerTrackId) reasonCodes.push(`selection_button_provider_track_id_missing:${index}`);
    if (!button.customId.startsWith("music_sesh:provider_select:")) reasonCodes.push(`selection_button_custom_id_invalid:${index}`);
    if (button.customId.length > 100) reasonCodes.push(`selection_button_custom_id_too_long:${index}`);
    if (button.controlsPlayback) reasonCodes.push(`selection_button_controls_playback:${index}`);
    if (button.slashCommandsAdmitted) reasonCodes.push(`selection_button_slash_command_admitted:${index}`);
  }
  return reasonCodes;
}

function buildQueueSelectionPlan({ preview, button }) {
  return {
    queuePreviewId: preview.queuePreviewId,
    customId: button.customId,
    providerTrackId: preview.providerTrackId,
    title: preview.title,
    artistName: preview.artistName,
    selectionQueuesMetadata: true,
    sendsMessages: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
  };
}

async function buildMusicProviderQueueSelectionButtonFlow(input = {}) {
  const preview = await previewInternals.buildMusicProviderMetadataSelectionPreview(input);
  const buttons = preview.queuePreviews.map(buildSelectionButton);
  const queueSelectionPlans = preview.queuePreviews.map((queuePreview, index) =>
    buildQueueSelectionPlan({ preview: queuePreview, button: buttons[index] })
  );
  const reasonCodes = [...new Set([
    ...preview.reasonCodes,
    ...validateSelectionButtons(buttons),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: preview.callsMusicProviders,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "provider_queue_selection_button_flow_ready" : "blocked",
    liveAttempted: preview.liveAttempted,
    selectionButtonCount: buttons.length,
    buttons,
    queueSelectionPlans,
    preview: {
      status: preview.status,
      fallbackPreview: preview.fallbackPreview,
      queuePreviewCount: preview.queuePreviewCount,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_selection_button_flow_ready"
        : "discordos.music_provider.queue_selection_button_flow_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_selection_button_flow",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        buttonCount: result.selectionButtonCount,
        liveAttempted: result.liveAttempted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Selection Button Flow",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- selection buttons: \`${result.selectionButtonCount}\``,
    `- first custom id: \`${result.buttons[0]?.customId || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueSelectionButtonFlow(options);
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
    buildSelectionButton,
    validateSelectionButtons,
    buildQueueSelectionPlan,
    buildMusicProviderQueueSelectionButtonFlow,
    renderMarkdown,
  },
};
