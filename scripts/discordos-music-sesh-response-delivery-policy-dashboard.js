const {
  _internals: canaryInternals,
} = require("./discordos-music-sesh-response-delivery-live-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildDeliveryPolicyDashboard(canary) {
  return {
    testingOnly: canary.testingOnly === true,
    targetChannelId: canary.delivery.channelId,
    liveDeliveryRequested: canary.admission.requested,
    liveDeliveryAdmitted: canary.admission.admitted,
    admissionStatus: canary.admission.status,
    guardStatus: canary.deliveryGuard.status,
    contentLength: canary.deliveryGuard.contentLength,
    allowedMentionsDisabled: canary.deliveryGuard.allowedMentionsDisabled,
    noUnsafeMentions: canary.deliveryGuard.noUnsafeMentions,
    deliveryAttempted: canary.delivery.attempted,
    deliveryReadbackOk: canary.delivery.readbackOk,
    messageId: canary.delivery.messageId,
  };
}

function validateDeliveryPolicyDashboard({ canary, dashboard }) {
  const reasonCodes = [...canary.reasonCodes];
  if (canary.controlsPlayback || canary.callsMusicProviders || canary.slashCommandsAdmitted) {
    reasonCodes.push("response_delivery_policy_side_effect_boundary_failed");
  }
  if (!dashboard.allowedMentionsDisabled) {
    reasonCodes.push("response_delivery_policy_mentions_not_disabled");
  }
  if (!dashboard.noUnsafeMentions) {
    reasonCodes.push("response_delivery_policy_unsafe_mentions");
  }
  if (!dashboard.testingOnly) {
    reasonCodes.push("response_delivery_policy_testing_boundary_missing");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryPolicyDashboard(input = {}) {
  const canary = await canaryInternals.buildMusicSeshResponseDeliveryLiveCanary(input);
  const dashboard = buildDeliveryPolicyDashboard(canary);
  const reasonCodes = validateDeliveryPolicyDashboard({ canary, dashboard });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: canary.sendsMessages,
    writesArtifacts: false,
    callsDiscordApi: canary.callsDiscordApi,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "response_delivery_policy_dashboard_ready" : "blocked",
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_policy_dashboard_ready"
        : "discordos.music_sesh.response_delivery_policy_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_policy_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveDeliveryAdmitted: dashboard.liveDeliveryAdmitted,
        deliveryAttempted: dashboard.deliveryAttempted,
        allowedMentionsDisabled: dashboard.allowedMentionsDisabled,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Policy Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- testing only: \`${result.dashboard.testingOnly ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.dashboard.admissionStatus}\``,
    `- mentions disabled: \`${result.dashboard.allowedMentionsDisabled ? "true" : "false"}\``,
    `- readback: \`${result.dashboard.deliveryReadbackOk ? "pass" : "not_confirmed"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshResponseDeliveryPolicyDashboard(options);
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
    buildDeliveryPolicyDashboard,
    validateDeliveryPolicyDashboard,
    buildMusicSeshResponseDeliveryPolicyDashboard,
    renderMarkdown,
  },
};
