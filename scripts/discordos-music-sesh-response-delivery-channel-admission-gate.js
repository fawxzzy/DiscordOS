const {
  _internals: policyInternals,
} = require("./discordos-music-sesh-response-delivery-policy-dashboard");
const {
  _internals: channelTargetInternals,
} = require("./discordos-music-sesh-channel-target-status");

const DEFAULT_TESTING_CHANNEL_ID = "1515943795999510579";

function parseArgs(args) {
  const parsed = policyInternals.parseArgs(args);
  if (!args.includes("--channel-id")) {
    return {
      ...parsed,
      channelId: null,
    };
  }
  return parsed;
}

function classifyResponseChannel({ channelId, musicSeshTarget, testingChannelId }) {
  if (!channelId) {
    return {
      channelId: null,
      admitted: false,
      class: "missing",
      reasonCodes: ["response_delivery_channel_missing"],
    };
  }
  if (channelId === testingChannelId) {
    return {
      channelId,
      admitted: true,
      class: "testing",
      reasonCodes: [],
    };
  }
  if (channelId === musicSeshTarget.channelId) {
    return {
      channelId,
      admitted: false,
      class: "music_sesh_candidate",
      reasonCodes: ["response_delivery_music_sesh_channel_requires_explicit_expansion"],
    };
  }
  return {
    channelId,
    admitted: false,
    class: "unknown",
    reasonCodes: ["response_delivery_channel_not_admitted"],
  };
}

async function buildMusicSeshResponseDeliveryChannelAdmissionGate({
  env = process.env,
  fsImpl,
  ...input
} = {}) {
  const { channelId, ...policyInput } = input;
  const policy = await policyInternals.buildMusicSeshResponseDeliveryPolicyDashboard({
    env,
    ...policyInput,
    ...(channelId ? { channelId } : {}),
  });
  const musicSeshTarget = await channelTargetInternals.buildMusicSeshChannelTargetStatus({ env, fsImpl });
  const testingChannelId = input.testingChannelId || env.DISCORDOS_TESTING_CHANNEL_ID || DEFAULT_TESTING_CHANNEL_ID;
  const targetChannelId = channelId || testingChannelId;
  const admission = classifyResponseChannel({
    channelId: targetChannelId,
    musicSeshTarget,
    testingChannelId,
  });
  const reasonCodes = [...new Set([
    ...policy.reasonCodes,
    ...musicSeshTarget.reasonCodes,
    ...(admission.class === "testing" ? [] : admission.reasonCodes),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "response_delivery_channel_admission_gate_ready" : "blocked",
    admission,
    policy: {
      status: policy.status,
      allowedMentionsDisabled: policy.dashboard.allowedMentionsDisabled,
      noUnsafeMentions: policy.dashboard.noUnsafeMentions,
    },
    musicSeshTarget: {
      status: musicSeshTarget.status,
      channelId: musicSeshTarget.channelId,
      slashCommandsAdmitted: musicSeshTarget.slashCommandsAdmitted,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_channel_admission_gate_ready"
        : "discordos.music_sesh.response_delivery_channel_admission_gate_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_channel_admission_gate",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        admitted: admission.admitted,
        channelClass: admission.class,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Channel Admission Gate",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admitted: \`${result.admission.admitted ? "true" : "false"}\``,
    `- class: \`${result.admission.class}\``,
    `- mentions disabled: \`${result.policy.allowedMentionsDisabled ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshResponseDeliveryChannelAdmissionGate(options);
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
    DEFAULT_TESTING_CHANNEL_ID,
    classifyResponseChannel,
    buildMusicSeshResponseDeliveryChannelAdmissionGate,
    renderMarkdown,
  },
};
