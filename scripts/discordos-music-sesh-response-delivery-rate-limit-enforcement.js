const {
  _internals: policyInternals,
} = require("./discordos-music-sesh-response-delivery-rate-limit-policy");

function parseArgs(args) {
  return policyInternals.parseArgs(args);
}

function buildRateLimitEnforcementDecision({ policy, observedResponseCount = 2 }) {
  const remaining = Math.max(0, Number(policy.maxResponses || 0) - observedResponseCount);
  const admitted = observedResponseCount < Number(policy.maxResponses || 0);
  return {
    mode: "pre_delivery_enforcement",
    targetChannelId: policy.targetChannelId,
    observedResponseCount,
    maxResponses: policy.maxResponses,
    windowSeconds: policy.windowSeconds,
    remainingResponses: remaining,
    admitted,
    decision: admitted ? "allow" : "throttle",
    mentionSafetyPreserved: policy.allowedMentionsDisabled === true && policy.noUnsafeMentions === true,
    sendsMessagesInGuard: false,
    slashCommandsAdmitted: false,
  };
}

function validateRateLimitEnforcement({ policyResult, enforcement }) {
  const reasonCodes = [...policyResult.reasonCodes];
  if (!enforcement.targetChannelId) reasonCodes.push("music_sesh_rate_limit_enforcement_target_missing");
  if (!["allow", "throttle"].includes(enforcement.decision)) {
    reasonCodes.push("music_sesh_rate_limit_enforcement_decision_invalid");
  }
  if (!enforcement.mentionSafetyPreserved || enforcement.sendsMessagesInGuard) {
    reasonCodes.push("music_sesh_rate_limit_enforcement_boundary_failed");
  }
  if (policyResult.slashCommandsAdmitted || enforcement.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_rate_limit_enforcement_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryRateLimitEnforcement(input = {}) {
  const policyResult = await policyInternals.buildMusicSeshResponseDeliveryRateLimitPolicy(input);
  const enforcement = buildRateLimitEnforcementDecision({
    policy: policyResult.policy,
    observedResponseCount: input.observedResponseCount || 2,
  });
  const reasonCodes = validateRateLimitEnforcement({ policyResult, enforcement });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_response_delivery_rate_limit_enforcement_ready" : "blocked",
    sourceStatus: policyResult.status,
    enforcement,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_rate_limit_enforcement_ready"
        : "discordos.music_sesh.response_delivery_rate_limit_enforcement_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_rate_limit_enforcement",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        decision: enforcement.decision,
        remainingResponses: enforcement.remainingResponses,
        targetChannelId: enforcement.targetChannelId || "none",
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Rate-Limit Enforcement",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- decision: \`${result.enforcement.decision}\``,
    `- remaining responses: \`${result.enforcement.remainingResponses}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshResponseDeliveryRateLimitEnforcement(options);
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
    buildRateLimitEnforcementDecision,
    validateRateLimitEnforcement,
    buildMusicSeshResponseDeliveryRateLimitEnforcement,
    renderMarkdown,
  },
};
