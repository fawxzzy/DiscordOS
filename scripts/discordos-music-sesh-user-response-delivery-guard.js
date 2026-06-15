const {
  _internals: liveIngestInternals,
} = require("./discordos-chat-message-live-ingest");
const {
  _internals: preflightInternals,
} = require("./discordos-music-sesh-preflight");

const DELIVERY_ENV = "DISCORDOS_MUSIC_SESH_RESPONSE_DELIVERY";
const DELIVERY_ENV_VALUE = "enabled";
const DEFAULT_MUSIC_SESH_CHANNEL_ID = "1508139160853286942";

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

function parseArgs(args) {
  const options = {
    json: false,
    content: "computa music status",
    sessionId: "music-sesh-response-delivery",
    guildId: "1504668396338413670",
    channelId: DEFAULT_MUSIC_SESH_CHANNEL_ID,
    actorDiscordUserId: "1515220075366580224",
    allowDelivery: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--content") {
      options.content = readValue(args, index, "missing_content_value");
      index += 1;
    } else if (arg === "--session-id") {
      options.sessionId = readValue(args, index, "missing_session_id_value");
      index += 1;
    } else if (arg === "--guild-id") {
      options.guildId = readValue(args, index, "missing_guild_id_value");
      index += 1;
    } else if (arg === "--channel-id") {
      options.channelId = readValue(args, index, "missing_channel_id_value");
      index += 1;
    } else if (arg === "--actor-user-id") {
      options.actorDiscordUserId = readValue(args, index, "missing_actor_user_id_value");
      index += 1;
    } else if (arg === "--allow-delivery") {
      options.allowDelivery = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function resolveDeliveryAdmission({ allowDelivery, env }) {
  const envEnabled = env?.[DELIVERY_ENV] === DELIVERY_ENV_VALUE;
  if (!allowDelivery && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "delivery_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowDelivery && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "delivery_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["music_sesh_response_delivery_double_guard_missing"],
  };
}

function validateDeliveryPayload({ response, channelId }) {
  const content = String(response?.content || "");
  const reasonCodes = [];
  if (!content) {
    reasonCodes.push("delivery_response_content_missing");
  }
  if (content.length > 2000) {
    reasonCodes.push("delivery_response_content_too_long");
  }
  if (/<@!?&?\d+>|@everyone|@here/i.test(content)) {
    reasonCodes.push("delivery_response_unsafe_mentions");
  }
  if (response?.allowedMentionsDisabled !== true) {
    reasonCodes.push("delivery_mentions_not_disabled");
  }
  if (!preflightInternals.isSnowflake(channelId)) {
    reasonCodes.push("delivery_channel_id_invalid");
  }
  return {
    ok: reasonCodes.length === 0,
    contentLength: content.length,
    noUnsafeMentions: !/<@!?&?\d+>|@everyone|@here/i.test(content),
    allowedMentionsDisabled: response?.allowedMentionsDisabled === true,
    reasonCodes,
  };
}

async function buildMusicSeshUserResponseDeliveryGuard({
  env = process.env,
  fetchImpl = fetch,
  allowDelivery = false,
  ...input
} = {}) {
  const route = await liveIngestInternals.buildChatMessageLiveIngest({
    ...input,
    env,
    fetchImpl,
  });
  const deliveryAdmission = resolveDeliveryAdmission({ allowDelivery, env });
  const payloadValidation = validateDeliveryPayload({
    response: route.userResponse,
    channelId: input.channelId,
  });
  const deliveryDecision = {
    status: deliveryAdmission.admitted ? "deliverable" : "preview_only",
    channelId: input.channelId || DEFAULT_MUSIC_SESH_CHANNEL_ID,
    allowedMentions: { parse: [] },
    sendsMessagesInGuard: false,
  };
  const reasonCodes = [...new Set([
    ...route.reasonCodes,
    ...deliveryAdmission.reasonCodes,
    ...payloadValidation.reasonCodes,
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
    status: reasonCodes.length === 0 ? "user_response_delivery_guard_ready" : "blocked",
    route: {
      status: route.statusResponseRoute?.status || route.status,
      userResponsePresent: Boolean(route.userResponse),
    },
    deliveryAdmission,
    payloadValidation,
    deliveryDecision,
    userResponse: route.userResponse,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.user_response_delivery_guard_ready"
        : "discordos.music_sesh.user_response_delivery_guard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.user_response_delivery_guard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        deliveryStatus: deliveryDecision.status,
        contentLength: payloadValidation.contentLength,
        allowedMentionsDisabled: payloadValidation.allowedMentionsDisabled,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh User Response Delivery Guard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- delivery decision: \`${result.deliveryDecision.status}\``,
    `- content length: \`${result.payloadValidation.contentLength}\``,
    `- mentions disabled: \`${result.payloadValidation.allowedMentionsDisabled ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshUserResponseDeliveryGuard(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) {
      process.exitCode = 1;
    }
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
    DELIVERY_ENV,
    DELIVERY_ENV_VALUE,
    DEFAULT_MUSIC_SESH_CHANNEL_ID,
    parseArgs,
    resolveDeliveryAdmission,
    validateDeliveryPayload,
    buildMusicSeshUserResponseDeliveryGuard,
    renderMarkdown,
  },
};
