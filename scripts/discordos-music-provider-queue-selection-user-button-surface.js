const {
  _internals: canaryInternals,
} = require("./discordos-music-provider-selection-to-queue-live-canary");
const {
  _internals: flowInternals,
} = require("./discordos-music-provider-queue-selection-button-flow");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildUserButtonSurface({ canary, title = "Music Sesh Provider Queue" }) {
  const selection = canary.selection || {};
  const button = flowInternals.buildSelectionButton({
    queuePreviewId: selection.customId?.split(":").at(-1) || "provider-preview-1",
    title: selection.title || "Provider Selected Track",
    providerTrackId: selection.providerTrackId,
  });
  return {
    title,
    interactionTypes: ["MESSAGE_COMPONENT"],
    buttonCount: 1,
    buttons: [button],
    payloadPreview: {
      content: "",
      embeds: [
        {
          title,
          description: "Pick a provider result to queue it as metadata. Playback stays outside this surface.",
          color: 5763719,
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: button.label,
              custom_id: button.customId,
            },
          ],
        },
      ],
      allowed_mentions: { parse: [] },
    },
  };
}

function validateUserButtonSurface({ canary, surface }) {
  const reasonCodes = [...canary.reasonCodes];
  reasonCodes.push(...flowInternals.validateSelectionButtons(surface.buttons));
  if (canary.sendsMessages || canary.callsMusicProviders || canary.controlsPlayback) {
    reasonCodes.push("provider_queue_user_button_surface_side_effect_boundary_failed");
  }
  if (canary.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_user_button_surface_slash_command_admitted");
  }
  if (surface.payloadPreview.allowed_mentions?.parse?.length !== 0) {
    reasonCodes.push("provider_queue_user_button_surface_mentions_not_disabled");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueSelectionUserButtonSurface(input = {}) {
  const canary = await canaryInternals.buildMusicProviderSelectionToQueueLiveCanary(input);
  const surface = buildUserButtonSurface({ canary });
  const reasonCodes = validateUserButtonSurface({ canary, surface });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: canary.executesStorageWrite,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "provider_queue_selection_user_button_surface_ready" : "blocked",
    canaryStatus: canary.status,
    surface,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_selection_user_button_surface_ready"
        : "discordos.music_provider.queue_selection_user_button_surface_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_selection_user_button_surface",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        buttonCount: surface.buttonCount,
        executesStorageWrite: result.executesStorageWrite,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Selection User Button Surface",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- buttons: \`${result.surface.buttonCount}\``,
    `- first custom id: \`${result.surface.buttons[0]?.customId || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueSelectionUserButtonSurface(options);
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
    buildUserButtonSurface,
    validateUserButtonSurface,
    buildMusicProviderQueueSelectionUserButtonSurface,
    renderMarkdown,
  },
};
