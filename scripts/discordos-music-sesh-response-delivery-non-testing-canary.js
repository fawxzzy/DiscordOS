const {
  _internals: gateInternals,
} = require("./discordos-music-sesh-response-delivery-channel-admission-gate");
const {
  _internals: channelTargetInternals,
} = require("./discordos-music-sesh-channel-target-status");

function parseArgs(args) {
  const parsed = gateInternals.parseArgs(args);
  return {
    ...parsed,
    admitNonTesting: !args.includes("--block-non-testing"),
  };
}

function buildNonTestingAdmissionPlan({ gate, musicSeshTarget, admitNonTesting }) {
  const targetChannelId = musicSeshTarget.channelId || gate.musicSeshTarget.channelId || null;
  const candidate = gate.admission.class === "music_sesh_candidate" || Boolean(targetChannelId);
  const admitted = admitNonTesting === true && candidate;
  return {
    targetChannelId,
    class: admitted ? "music_sesh_explicit_non_testing" : gate.admission.class,
    candidate,
    admitted,
    requiresReadback: true,
    allowedMentionsDisabled: gate.policy.allowedMentionsDisabled === true,
    noUnsafeMentions: gate.policy.noUnsafeMentions === true,
    sendsMessages: false,
  };
}

function validateNonTestingCanary({ gate, plan }) {
  const reasonCodes = [];
  if (gate.sendsMessages || gate.callsDiscordApi || gate.callsMusicProviders || gate.controlsPlayback) {
    reasonCodes.push("music_sesh_response_non_testing_canary_side_effect_boundary_failed");
  }
  if (gate.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_response_non_testing_canary_slash_command_admitted");
  }
  if (!plan.candidate) reasonCodes.push("music_sesh_response_non_testing_candidate_missing");
  if (!plan.admitted) reasonCodes.push("music_sesh_response_non_testing_not_explicitly_admitted");
  if (!plan.allowedMentionsDisabled || !plan.noUnsafeMentions) {
    reasonCodes.push("music_sesh_response_non_testing_mention_policy_unsafe");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryNonTestingCanary({
  env = process.env,
  fsImpl,
  admitNonTesting = true,
  ...input
} = {}) {
  const musicSeshTarget = await channelTargetInternals.buildMusicSeshChannelTargetStatus({ env, fsImpl });
  const gate = await gateInternals.buildMusicSeshResponseDeliveryChannelAdmissionGate({
    env,
    fsImpl,
    ...input,
    channelId: input.channelId || musicSeshTarget.channelId,
  });
  const plan = buildNonTestingAdmissionPlan({ gate, musicSeshTarget, admitNonTesting });
  const reasonCodes = validateNonTestingCanary({ gate, plan });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "response_delivery_non_testing_canary_ready" : "blocked",
    gateStatus: gate.status,
    plan,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_non_testing_canary_ready"
        : "discordos.music_sesh.response_delivery_non_testing_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_non_testing_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        admitted: plan.admitted,
        channelClass: plan.class,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Non-Testing Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admitted: \`${result.plan.admitted ? "true" : "false"}\``,
    `- class: \`${result.plan.class}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshResponseDeliveryNonTestingCanary(options);
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
    buildNonTestingAdmissionPlan,
    validateNonTestingCanary,
    buildMusicSeshResponseDeliveryNonTestingCanary,
    renderMarkdown,
  },
};
