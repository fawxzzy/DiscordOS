const {
  _internals: deliveryGuardInternals,
} = require("./discordos-music-sesh-user-response-delivery-guard");
const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const LIVE_DELIVERY_ENV = "DISCORDOS_MUSIC_SESH_RESPONSE_LIVE_CANARY";
const LIVE_DELIVERY_ENV_VALUE = "enabled";

function parseArgs(args) {
  const deliveryArgs = [];
  const options = {
    live: false,
    apply: false,
    testingChannelId: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--live") {
      options.live = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === "--testing-channel-id") {
      const value = args[index + 1];
      if (!value) throw new Error("missing_testing_channel_id_value");
      options.testingChannelId = value.trim();
      index += 1;
    } else {
      deliveryArgs.push(arg);
      if (["--content", "--session-id", "--guild-id", "--channel-id", "--actor-user-id"].includes(arg)) {
        const value = args[index + 1];
        if (!value) throw new Error(`missing_value:${arg}`);
        deliveryArgs.push(value);
        index += 1;
      }
    }
  }
  return {
    ...deliveryGuardInternals.parseArgs(deliveryArgs),
    ...options,
  };
}

function resolveLiveDeliveryAdmission({ live, apply, allowDelivery, env }) {
  const envEnabled = env?.[LIVE_DELIVERY_ENV] === LIVE_DELIVERY_ENV_VALUE;
  if (!live && !apply) {
    return { requested: false, admitted: false, status: "live_delivery_not_requested", reasonCodes: [] };
  }
  if (live && apply && allowDelivery && envEnabled) {
    return { requested: true, admitted: true, status: "live_delivery_admitted", reasonCodes: [] };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["music_sesh_response_live_canary_double_guard_missing"],
  };
}

async function discordRequest({ path, token, method = "GET", body = null, fetchImpl = fetch }) {
  const response = await fetchImpl(`${updatePostInternals.DISCORD_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = typeof response.json === "function" ? await response.json().catch(() => null) : null;
  return { ok: response.ok, status: response.status, payload };
}

async function sendTestingMessage({ channelId, token, content, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${channelId}/messages`,
    token,
    method: "POST",
    body: {
      content,
      allowed_mentions: { parse: [] },
    },
    fetchImpl,
  });
}

async function fetchTestingMessage({ channelId, messageId, token, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${channelId}/messages/${messageId}`,
    token,
    fetchImpl,
  });
}

async function buildMusicSeshResponseDeliveryLiveCanary({
  env = process.env,
  fetchImpl = fetch,
  live = false,
  apply = false,
  testingChannelId = null,
  ...input
} = {}) {
  const deliveryInput = {
    content: "computa music status",
    sessionId: "music-sesh-response-delivery-live-canary",
    guildId: "1504668396338413670",
    channelId: deliveryGuardInternals.DEFAULT_MUSIC_SESH_CHANNEL_ID,
    actorDiscordUserId: "1515220075366580224",
    ...input,
  };
  const deliveryGuard = await deliveryGuardInternals.buildMusicSeshUserResponseDeliveryGuard({
    ...deliveryInput,
    env,
    fetchImpl,
  });
  const admission = resolveLiveDeliveryAdmission({
    live,
    apply,
    allowDelivery: deliveryInput.allowDelivery,
    env,
  });
  const resolvedTestingChannelId = testingChannelId || env.DISCORDOS_TESTING_CHANNEL_ID || null;
  const reasonCodes = [...new Set([...deliveryGuard.reasonCodes, ...admission.reasonCodes])];
  if (live && apply && !resolvedTestingChannelId) reasonCodes.push("testing_channel_id_missing");
  if (live && apply && !env.DISCORDOS_BOT_TOKEN) reasonCodes.push("bot_token_missing");

  let delivery = {
    attempted: false,
    ok: false,
    httpStatus: null,
    messageId: null,
    channelId: resolvedTestingChannelId,
    readbackOk: false,
  };
  if (live && apply && admission.admitted && reasonCodes.length === 0) {
    const sent = await sendTestingMessage({
      channelId: resolvedTestingChannelId,
      token: env.DISCORDOS_BOT_TOKEN,
      content: deliveryGuard.userResponse.content,
      fetchImpl,
    });
    delivery = {
      ...delivery,
      attempted: true,
      ok: sent.ok,
      httpStatus: sent.status,
      messageId: sent.payload?.id || null,
      channelId: sent.payload?.channel_id || resolvedTestingChannelId,
    };
    if (!sent.ok) {
      reasonCodes.push("testing_response_delivery_failed");
    } else {
      const fetched = await fetchTestingMessage({
        channelId: delivery.channelId,
        messageId: delivery.messageId,
        token: env.DISCORDOS_BOT_TOKEN,
        fetchImpl,
      });
      delivery.readbackOk = fetched.ok && fetched.payload?.content === deliveryGuard.userResponse.content;
      if (!delivery.readbackOk) reasonCodes.push("testing_response_delivery_readback_failed");
    }
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const result = {
    ok: uniqueReasonCodes.length === 0,
    destructive: false,
    sendsMessages: delivery.ok,
    writesArtifacts: false,
    callsDiscordApi: delivery.attempted,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: uniqueReasonCodes.length === 0 ? "response_delivery_live_canary_ready" : "blocked",
    testingOnly: true,
    admission,
    deliveryGuard: {
      status: deliveryGuard.status,
      contentLength: deliveryGuard.payloadValidation.contentLength,
      allowedMentionsDisabled: deliveryGuard.payloadValidation.allowedMentionsDisabled,
      noUnsafeMentions: deliveryGuard.payloadValidation.noUnsafeMentions,
    },
    delivery,
    reasonCodes: uniqueReasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_live_canary_ready"
        : "discordos.music_sesh.response_delivery_live_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_live_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        sendsMessages: result.sendsMessages,
        testingOnly: true,
        readbackOk: result.delivery.readbackOk,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Live Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- testing only: \`${result.testingOnly ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- message id: \`${result.delivery.messageId || "none"}\``,
    `- readback: \`${result.delivery.readbackOk ? "pass" : "not_confirmed"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshResponseDeliveryLiveCanary(options);
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
    LIVE_DELIVERY_ENV,
    LIVE_DELIVERY_ENV_VALUE,
    parseArgs,
    resolveLiveDeliveryAdmission,
    sendTestingMessage,
    fetchTestingMessage,
    buildMusicSeshResponseDeliveryLiveCanary,
    renderMarkdown,
  },
};
