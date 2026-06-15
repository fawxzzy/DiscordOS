const {
  _internals: observabilityInternals,
} = require("./discordos-music-sesh-response-delivery-rate-limit-observability");

function parseArgs(args) {
  return observabilityInternals.parseArgs(args);
}

function buildRateLimitAlerting(observabilityResult) {
  const observability = observabilityResult.observability;
  const throttleNeedsAttention = observability.operatorStatus === "attention_required";
  return {
    decision: observability.decision,
    alertRequired: throttleNeedsAttention,
    alertStatus: throttleNeedsAttention ? "would_route_no_send" : "not_required",
    targetChannelId: observability.targetChannelId,
    remainingResponses: observability.remainingResponses,
    maxResponses: observability.maxResponses,
    windowSeconds: observability.windowSeconds,
    userContentExposed: false,
    mentionSafetyPreserved: observability.mentionSafetyPreserved === true,
    sendsMessagesInAlerting: false,
    slashCommandsAdmitted: false,
  };
}

function validateRateLimitAlerting({ observabilityResult, alerting }) {
  const reasonCodes = [...observabilityResult.reasonCodes];
  if (alerting.userContentExposed || !alerting.mentionSafetyPreserved) {
    reasonCodes.push("music_sesh_rate_limit_alerting_privacy_boundary_failed");
  }
  if (alerting.sendsMessagesInAlerting || observabilityResult.sendsMessages) {
    reasonCodes.push("music_sesh_rate_limit_alerting_send_boundary_failed");
  }
  if (alerting.alertRequired && alerting.alertStatus !== "would_route_no_send") {
    reasonCodes.push("music_sesh_rate_limit_alerting_route_missing");
  }
  if (observabilityResult.slashCommandsAdmitted || alerting.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_rate_limit_alerting_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryRateLimitAlerting(input = {}) {
  const observabilityResult = await observabilityInternals.buildMusicSeshResponseDeliveryRateLimitObservability(input);
  const alerting = buildRateLimitAlerting(observabilityResult);
  const reasonCodes = validateRateLimitAlerting({ observabilityResult, alerting });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_response_delivery_rate_limit_alerting_ready" : "blocked",
    sourceStatus: observabilityResult.status,
    alerting,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_rate_limit_alerting_ready"
        : "discordos.music_sesh.response_delivery_rate_limit_alerting_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_rate_limit_alerting",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        decision: alerting.decision,
        alertRequired: alerting.alertRequired,
        alertStatus: alerting.alertStatus,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Rate-Limit Alerting",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- decision: \`${result.alerting.decision}\``,
    `- alert status: \`${result.alerting.alertStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshResponseDeliveryRateLimitAlerting(options);
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
    buildRateLimitAlerting,
    validateRateLimitAlerting,
    buildMusicSeshResponseDeliveryRateLimitAlerting,
    renderMarkdown,
  },
};
