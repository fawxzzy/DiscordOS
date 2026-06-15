const {
  _internals: surfaceInternals,
} = require("./discordos-music-provider-queue-selection-user-button-surface");

function parseArgs(args) {
  const parsed = surfaceInternals.parseArgs(args);
  return {
    ...parsed,
    live: args.includes("--live"),
  };
}

function buildPublishReadbackPlan({ surfaceResult, live = false }) {
  const payload = surfaceResult.surface?.payloadPreview || {};
  const button = surfaceResult.surface?.buttons?.[0] || null;
  return {
    mode: live ? "guarded_live_publish_readback" : "preview_publish_readback",
    wouldSend: live === true,
    sendsMessages: live === true,
    requiresLiveFlag: true,
    targetSurface: "music_sesh_control_post",
    messageComponentType: "MESSAGE_COMPONENT",
    allowedMentionsDisabled: payload.allowed_mentions?.parse?.length === 0,
    buttonCount: surfaceResult.surface?.buttonCount || 0,
    firstCustomId: button?.customId || null,
    metadataReadback: {
      providerTrackId: button?.providerTrackId || null,
      controlsPlayback: button?.controlsPlayback === true,
      slashCommandsAdmitted: button?.slashCommandsAdmitted === true,
    },
  };
}

function validatePublishReadback({ surfaceResult, plan }) {
  const reasonCodes = [...surfaceResult.reasonCodes];
  if (surfaceResult.callsMusicProviders || surfaceResult.controlsPlayback) {
    reasonCodes.push("provider_queue_surface_publish_readback_side_effect_boundary_failed");
  }
  if (surfaceResult.slashCommandsAdmitted || plan.metadataReadback.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_surface_publish_readback_slash_command_admitted");
  }
  if (!plan.allowedMentionsDisabled) {
    reasonCodes.push("provider_queue_surface_publish_readback_mentions_not_disabled");
  }
  if (plan.buttonCount < 1 || !plan.firstCustomId) {
    reasonCodes.push("provider_queue_surface_publish_readback_button_missing");
  }
  if (plan.metadataReadback.controlsPlayback) {
    reasonCodes.push("provider_queue_surface_publish_readback_controls_playback");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueSurfacePublishReadback(input = {}) {
  const { live = false, ...surfaceInput } = input;
  const surfaceResult = await surfaceInternals.buildMusicProviderQueueSelectionUserButtonSurface(surfaceInput);
  const plan = buildPublishReadbackPlan({ surfaceResult, live });
  const reasonCodes = validatePublishReadback({ surfaceResult, plan });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: plan.sendsMessages,
    writesArtifacts: false,
    callsDiscordApi: plan.wouldSend,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "provider_queue_surface_publish_readback_ready" : "blocked",
    sourceStatus: surfaceResult.status,
    plan,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_surface_publish_readback_ready"
        : "discordos.music_provider.queue_surface_publish_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_surface_publish_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        mode: plan.mode,
        buttonCount: plan.buttonCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Surface Publish Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- mode: \`${result.plan.mode}\``,
    `- button count: \`${result.plan.buttonCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueSurfacePublishReadback(options);
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
    buildPublishReadbackPlan,
    validatePublishReadback,
    buildMusicProviderQueueSurfacePublishReadback,
    renderMarkdown,
  },
};
