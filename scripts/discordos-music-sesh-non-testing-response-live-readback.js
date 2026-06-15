const {
  _internals: canaryInternals,
} = require("./discordos-music-sesh-response-delivery-non-testing-canary");

function parseArgs(args) {
  const parsed = canaryInternals.parseArgs(args);
  return {
    ...parsed,
    live: args.includes("--live"),
    confirmNonTesting: args.includes("--confirm-non-testing"),
  };
}

function buildLiveReadbackPlan({ canary, live = false, confirmNonTesting = false }) {
  return {
    mode: live && confirmNonTesting ? "guarded_live_non_testing_readback" : "preview_non_testing_readback",
    wouldSend: live === true && confirmNonTesting === true,
    sendsMessages: live === true && confirmNonTesting === true,
    requiresLiveFlag: true,
    requiresNonTestingConfirmation: true,
    targetChannelId: canary.plan?.targetChannelId || null,
    admitted: canary.plan?.admitted === true,
    contentPreview: "Music Sesh status route is online.",
    allowedMentionsDisabled: canary.plan?.allowedMentionsDisabled === true,
    noUnsafeMentions: canary.plan?.noUnsafeMentions === true,
    readbackFields: ["message_id", "channel_id", "content_hash", "allowed_mentions"],
  };
}

function validateLiveReadback({ canary, plan }) {
  const reasonCodes = [...canary.reasonCodes];
  if (canary.callsMusicProviders || canary.controlsPlayback) {
    reasonCodes.push("music_sesh_non_testing_live_readback_side_effect_boundary_failed");
  }
  if (canary.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_non_testing_live_readback_slash_command_admitted");
  }
  if (!plan.admitted) reasonCodes.push("music_sesh_non_testing_live_readback_not_admitted");
  if (!plan.targetChannelId) reasonCodes.push("music_sesh_non_testing_live_readback_target_missing");
  if (!plan.allowedMentionsDisabled || !plan.noUnsafeMentions) {
    reasonCodes.push("music_sesh_non_testing_live_readback_mention_policy_unsafe");
  }
  if (plan.sendsMessages && (!plan.requiresLiveFlag || !plan.requiresNonTestingConfirmation)) {
    reasonCodes.push("music_sesh_non_testing_live_readback_double_guard_missing");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshNonTestingResponseLiveReadback(input = {}) {
  const canary = await canaryInternals.buildMusicSeshResponseDeliveryNonTestingCanary(input);
  const plan = buildLiveReadbackPlan({
    canary,
    live: input.live,
    confirmNonTesting: input.confirmNonTesting,
  });
  const reasonCodes = validateLiveReadback({ canary, plan });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: plan.sendsMessages,
    writesArtifacts: false,
    callsDiscordApi: plan.wouldSend,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_non_testing_response_live_readback_ready" : "blocked",
    sourceStatus: canary.status,
    plan,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.non_testing_response_live_readback_ready"
        : "discordos.music_sesh.non_testing_response_live_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.non_testing_response_live_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        mode: plan.mode,
        admitted: plan.admitted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Non-Testing Response Live Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- mode: \`${result.plan.mode}\``,
    `- admitted: \`${result.plan.admitted ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshNonTestingResponseLiveReadback(options);
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
    buildLiveReadbackPlan,
    validateLiveReadback,
    buildMusicSeshNonTestingResponseLiveReadback,
    renderMarkdown,
  },
};
