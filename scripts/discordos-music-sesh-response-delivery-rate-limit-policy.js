const {
  _internals: liveReadbackInternals,
} = require("./discordos-music-sesh-non-testing-response-live-readback");

function parseArgs(args) {
  return liveReadbackInternals.parseArgs(args);
}

function buildRateLimitPolicy({ liveReadback, windowSeconds = 60, maxResponses = 3 }) {
  const plan = liveReadback.plan || {};
  return {
    scope: "per_channel",
    targetChannelId: plan.targetChannelId || null,
    windowSeconds,
    maxResponses,
    burstAllowed: 1,
    policyMode: "read_model",
    allowedMentionsDisabled: plan.allowedMentionsDisabled === true,
    noUnsafeMentions: plan.noUnsafeMentions === true,
    slashCommandsAdmitted: false,
  };
}

function validateRateLimitPolicy({ liveReadback, policy }) {
  const reasonCodes = [...liveReadback.reasonCodes];
  if (liveReadback.callsMusicProviders || liveReadback.controlsPlayback) {
    reasonCodes.push("music_sesh_response_rate_limit_side_effect_boundary_failed");
  }
  if (liveReadback.slashCommandsAdmitted || policy.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_response_rate_limit_slash_command_admitted");
  }
  if (!policy.targetChannelId) reasonCodes.push("music_sesh_response_rate_limit_target_missing");
  if (!policy.allowedMentionsDisabled || !policy.noUnsafeMentions) {
    reasonCodes.push("music_sesh_response_rate_limit_mention_policy_unsafe");
  }
  if (policy.windowSeconds < 10 || policy.maxResponses < 1) {
    reasonCodes.push("music_sesh_response_rate_limit_bounds_invalid");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryRateLimitPolicy(input = {}) {
  const liveReadback = await liveReadbackInternals.buildMusicSeshNonTestingResponseLiveReadback(input);
  const policy = buildRateLimitPolicy({
    liveReadback,
    windowSeconds: input.windowSeconds || 60,
    maxResponses: input.maxResponses || 3,
  });
  const reasonCodes = validateRateLimitPolicy({ liveReadback, policy });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_response_delivery_rate_limit_policy_ready" : "blocked",
    sourceStatus: liveReadback.status,
    policy,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_rate_limit_policy_ready"
        : "discordos.music_sesh.response_delivery_rate_limit_policy_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_rate_limit_policy",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        scope: policy.scope,
        windowSeconds: policy.windowSeconds,
        maxResponses: policy.maxResponses,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Rate-Limit Policy",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- scope: \`${result.policy.scope}\``,
    `- max responses: \`${result.policy.maxResponses}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshResponseDeliveryRateLimitPolicy(options);
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
    buildRateLimitPolicy,
    validateRateLimitPolicy,
    buildMusicSeshResponseDeliveryRateLimitPolicy,
    renderMarkdown,
  },
};
