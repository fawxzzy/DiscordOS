const crypto = require("node:crypto");
const {
  _internals: endpointInternals,
} = require("../api/discord-interactions");
const {
  _internals: supabaseRpcInternals,
} = require("./discordos-supabase-service-rpc");

const SYNTHETIC_SUPABASE_URL = "https://discordos-smoke.invalid";
const SYNTHETIC_SERVICE_ROLE_KEY = "discordos-smoke-service-role";

function parseArgs(args) {
  const options = {
    json: false,
    type: "PING",
    executeRoute: false,
    guildId: "1504668396338413670",
    channelId: "1515943795999510579",
    actorDiscordUserId: "1515220075366580224",
    messageId: "1516000000000000000",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--type") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_type_value");
      }
      options.type = value.trim();
      index += 1;
    } else if (arg === "--execute-route") {
      options.executeRoute = true;
    } else if (arg === "--guild-id") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_guild_id_value");
      }
      options.guildId = value.trim();
      index += 1;
    } else if (arg === "--channel-id") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_channel_id_value");
      }
      options.channelId = value.trim();
      index += 1;
    } else if (arg === "--actor-user-id") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_actor_user_id_value");
      }
      options.actorDiscordUserId = value.trim();
      index += 1;
    } else if (arg === "--message-id") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_message_id_value");
      }
      options.messageId = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function discordPublicKeyFromKey(publicKey) {
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  return publicKeyDer.subarray(publicKeyDer.length - 32).toString("hex");
}

function buildSmokeBody(type = "PING", {
  guildId = "1504668396338413670",
  channelId = "1515943795999510579",
  actorDiscordUserId = "1515220075366580224",
  messageId = "1516000000000000000",
} = {}) {
  if (type === "MESSAGE_COMPONENT") {
    return JSON.stringify({
      type: 3,
      guild_id: guildId,
      channel_id: channelId,
      member: {
        user: {
          id: actorDiscordUserId,
        },
      },
      message: {
        id: messageId,
        channel_id: channelId,
      },
      data: {
        custom_id: "music_sesh:queue",
        component_type: 2,
      },
    });
  }
  return JSON.stringify({ type: 1 });
}

function buildRouteAudit(response = {}) {
  const execution = response.execution || null;
  const storageWriteResult = execution?.writeAdapter?.storageWriteResult || null;
  return {
    interactionType: response.admission?.type || null,
    routeKind: response.admission?.route?.kind || null,
    customId: response.admission?.route?.customId || null,
    responseType: response.payload?.type || null,
    commandExecuted: false,
    slashCommandsAdmitted: false,
    storageWriteAttempted: storageWriteResult?.attempted === true,
    storageWriteStatus: storageWriteResult?.status || null,
    executionStatus: execution?.status || null,
    reasonCodeCount: Array.isArray(response.reasonCodes) ? response.reasonCodes.length : 0,
  };
}

function buildSyntheticRouteExecutionFetch(fetchImpl = fetch) {
  return async (url, init) => {
    const endpoint = String(url);
    if (endpoint === `${SYNTHETIC_SUPABASE_URL}/rest/v1/rpc/discordos_upsert_music_sesh_event`) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, synthetic: true }),
      };
    }
    return fetchImpl(url, init);
  };
}

function resolveRouteExecutionContext({
  executeRoute = false,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  if (!executeRoute) {
    return {
      env,
      fetchImpl,
    };
  }

  const executionEnv = {
    ...env,
    DISCORDOS_BUTTON_INTERACTION_EXECUTION: "enabled",
  };
  const writeGuardEnabled = executionEnv.DISCORDOS_MUSIC_SESH_WRITE_ADAPTER === "enabled";
  const rpcConfig = supabaseRpcInternals.getServiceRoleRpcConfig(executionEnv);

  if (writeGuardEnabled && rpcConfig.ok) {
    return {
      env: executionEnv,
      fetchImpl,
    };
  }

  return {
    env: {
      ...executionEnv,
      DISCORDOS_MUSIC_SESH_WRITE_ADAPTER: "enabled",
      DISCORDOS_SUPABASE_URL: SYNTHETIC_SUPABASE_URL,
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: SYNTHETIC_SERVICE_ROLE_KEY,
    },
    fetchImpl: buildSyntheticRouteExecutionFetch(fetchImpl),
  };
}

async function buildSignedInteractionEndpointSmoke({
  type = "PING",
  nowSeconds = 100,
  executeRoute = false,
  guildId = "1504668396338413670",
  channelId = "1515943795999510579",
  actorDiscordUserId = "1515220075366580224",
  messageId = "1516000000000000000",
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyHex = discordPublicKeyFromKey(publicKey);
  const body = buildSmokeBody(type, {
    guildId,
    channelId,
    actorDiscordUserId,
    messageId,
  });
  const timestamp = String(nowSeconds);
  const signature = crypto.sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString("hex");
  const executionContext = resolveRouteExecutionContext({
    executeRoute,
    env,
    fetchImpl,
  });
  const response = await endpointInternals.buildDiscordInteractionResponse({
    method: "POST",
    headers: {
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
    rawBody: body,
    publicKey: publicKeyHex,
    nowSeconds,
    env: executionContext.env,
    fetchImpl: executionContext.fetchImpl,
  });
  const reasonCodes = [...response.reasonCodes];
  if (!response.signaturePreflight?.signatureVerified) {
    reasonCodes.push("signature_not_verified");
  }
  const routeAudit = buildRouteAudit(response);

  const result = {
    ok: response.ok && reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    executesCommand: false,
    executesRoute: response.execution?.executesStorageWrite === true,
    status: response.ok && reasonCodes.length === 0 ? "signed_endpoint_smoke_ready" : "blocked",
    interactionType: type,
    responseType: response.payload?.type || null,
    signatureVerified: response.signaturePreflight?.signatureVerified === true,
    admissionStatus: response.admission?.status || null,
    executionStatus: response.execution?.status || null,
    routeAudit,
    reasonCodes: [...new Set(reasonCodes)],
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.discord_interaction.signed_endpoint_smoke_ready"
        : "discordos.discord_interaction.signed_endpoint_smoke_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.discord_interaction.signed_endpoint_smoke",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        interactionType: result.interactionType,
        responseType: result.responseType,
        signatureVerified: result.signatureVerified,
        storageWriteAttempted: result.routeAudit.storageWriteAttempted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Signed Interaction Endpoint Smoke",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- executes command: \`${result.executesCommand ? "true" : "false"}\``,
    `- executes route: \`${result.executesRoute ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- interaction type: \`${result.interactionType}\``,
    `- response type: \`${result.responseType || "none"}\``,
    `- signature verified: \`${result.signatureVerified ? "true" : "false"}\``,
    `- admission status: \`${result.admissionStatus || "none"}\``,
    `- execution status: \`${result.executionStatus || "none"}\``,
    `- audit route kind: \`${result.routeAudit.routeKind || "none"}\``,
    `- audit storage write: \`${result.routeAudit.storageWriteStatus || "none"}\``,
    `- slash commands admitted: \`${result.routeAudit.slashCommandsAdmitted ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildSignedInteractionEndpointSmoke(options);
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
    parseArgs,
    discordPublicKeyFromKey,
    buildSmokeBody,
    buildRouteAudit,
    buildSyntheticRouteExecutionFetch,
    resolveRouteExecutionContext,
    buildSignedInteractionEndpointSmoke,
    renderMarkdown,
  },
};
