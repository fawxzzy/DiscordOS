const {
  _internals: enforcementInternals,
} = require("./discordos-music-sesh-response-delivery-rate-limit-enforcement");

function parseArgs(args) {
  return enforcementInternals.parseArgs(args);
}

function buildRateLimitObservability(enforcement) {
  return {
    targetChannelId: enforcement.enforcement.targetChannelId,
    decision: enforcement.enforcement.decision,
    admitted: enforcement.enforcement.admitted,
    remainingResponses: enforcement.enforcement.remainingResponses,
    maxResponses: enforcement.enforcement.maxResponses,
    windowSeconds: enforcement.enforcement.windowSeconds,
    mentionSafetyPreserved: enforcement.enforcement.mentionSafetyPreserved === true,
    userContentExposed: false,
    operatorStatus: enforcement.enforcement.decision === "throttle" ? "attention_required" : "ready",
    slashCommandsAdmitted: false,
  };
}

function validateRateLimitObservability({ enforcement, observability }) {
  const reasonCodes = [...enforcement.reasonCodes];
  if (!observability.targetChannelId) reasonCodes.push("music_sesh_rate_limit_observability_target_missing");
  if (observability.userContentExposed || !observability.mentionSafetyPreserved) {
    reasonCodes.push("music_sesh_rate_limit_observability_privacy_boundary_failed");
  }
  if (enforcement.slashCommandsAdmitted || observability.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_rate_limit_observability_slash_command_admitted");
  }
  if (!["ready", "attention_required"].includes(observability.operatorStatus)) {
    reasonCodes.push("music_sesh_rate_limit_observability_status_invalid");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryRateLimitObservability(input = {}) {
  const enforcement = await enforcementInternals.buildMusicSeshResponseDeliveryRateLimitEnforcement(input);
  const observability = buildRateLimitObservability(enforcement);
  const reasonCodes = validateRateLimitObservability({ enforcement, observability });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_response_delivery_rate_limit_observability_ready" : "blocked",
    sourceStatus: enforcement.status,
    observability,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_rate_limit_observability_ready"
        : "discordos.music_sesh.response_delivery_rate_limit_observability_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_rate_limit_observability",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        decision: observability.decision,
        remainingResponses: observability.remainingResponses,
        operatorStatus: observability.operatorStatus,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Rate-Limit Observability",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- decision: \`${result.observability.decision}\``,
    `- operator status: \`${result.observability.operatorStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshResponseDeliveryRateLimitObservability(options);
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
    buildRateLimitObservability,
    validateRateLimitObservability,
    buildMusicSeshResponseDeliveryRateLimitObservability,
    renderMarkdown,
  },
};
