const {
  _internals: signatureInternals,
} = require("../scripts/discordos-discord-interaction-signature-preflight");
const {
  _internals: admissionInternals,
} = require("../scripts/discordos-interaction-handler-admission");
const {
  _internals: buttonRouterInternals,
} = require("../scripts/discordos-music-sesh-button-router");
const {
  _internals: computaInternals,
} = require("../scripts/discordos-computa-runtime");

const DISCORD_INTERACTION_RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  MODAL: 9,
};

const DISCORD_MESSAGE_FLAG_EPHEMERAL = 64;
const FITNESS_VERIFY_BUTTON_CUSTOM_ID = "fitness_verify_open";
const FITNESS_VERIFY_MODAL_CUSTOM_ID = "fitness_verify_modal";
const FITNESS_VERIFY_TOKEN_INPUT_CUSTOM_ID = "fitness_token";
const DEFAULT_DISCORDOS_GUILD_ID = "1504668396338413670";
const DISCORD_MEMBER_NUMBER_PREFIX_PATTERN = /^#\d+\s+\u00b7\s+/u;
const DISCORD_MEMBER_NUMBER_SUFFIX_PATTERN = /\s+\u00b7\s+\d+$/u;
const DEFAULT_MEMBER_DISPLAY_NAME = "Member";

function normalizeHeader(headers = {}, name) {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) {
    return direct[0] || "";
  }
  return typeof direct === "string" ? direct : "";
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function interactionTypeName(type) {
  if (type === 1) {
    return "PING";
  }
  if (type === 2) {
    return "APPLICATION_COMMAND";
  }
  if (type === 3) {
    return "MESSAGE_COMPONENT";
  }
  if (type === 5) {
    return "MODAL_SUBMIT";
  }
  return "UNKNOWN";
}

function surfaceFromCommandName(name) {
  if (name === "board-card") {
    return "board";
  }
  if (name === "mod-review") {
    return "moderation";
  }
  if (name === "music") {
    return "music";
  }
  return null;
}

function extractMusicOptions(data = {}) {
  const options = Array.isArray(data.options) ? data.options : [];
  const byName = new Map(options.map((option) => [option.name, option.value]));
  return {
    sessionId: String(byName.get("session") || "music-sesh-interaction"),
    action: String(byName.get("action") || "queue_item"),
    itemTitle: String(byName.get("title") || "Interaction Track"),
  };
}

function buildAdmissionInput(interaction) {
  const type = interactionTypeName(interaction?.type);
  const commandName = interaction?.data?.name || "music";
  const musicOptions = extractMusicOptions(interaction?.data);
  return {
    type,
    surface: surfaceFromCommandName(commandName) || "music",
    command: commandName,
    customId: interaction?.data?.custom_id || null,
    ...musicOptions,
  };
}

function shouldExecuteButtonRoute({ env = process.env, admission }) {
  return env.DISCORDOS_BUTTON_INTERACTION_EXECUTION === "enabled"
    && admission?.route?.kind === "message_component"
    && admission?.ok === true;
}

function buildButtonExecutionInput(interaction = {}, admissionInput = {}) {
  return {
    customId: admissionInput.customId,
    sessionId: interaction?.message?.id
      ? `interaction-${interaction.message.id}`
      : "music-sesh-interaction",
    guildId: interaction.guild_id || null,
    channelId: interaction.channel_id || interaction.message?.channel_id || null,
    actorDiscordUserId: interaction.member?.user?.id || interaction.user?.id || null,
    allowStorageWrite: true,
    apply: true,
  };
}

function buildEphemeralMessageResponse(content) {
  return {
    type: DISCORD_INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: DISCORD_MESSAGE_FLAG_EPHEMERAL,
    },
  };
}

function buildVerifyModalResponse() {
  return {
    type: DISCORD_INTERACTION_RESPONSE_TYPE.MODAL,
    data: {
      custom_id: FITNESS_VERIFY_MODAL_CUSTOM_ID,
      title: "Fitness Verification",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: FITNESS_VERIFY_TOKEN_INPUT_CUSTOM_ID,
              style: 1,
              label: "Fitness verification token",
              placeholder: "FWX-XXXX-XXXX",
              required: true,
              max_length: 80,
            },
          ],
        },
      ],
    },
  };
}

function readOptionalEnv(name, env = process.env) {
  const value = env?.[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveDiscordInteractionUser(interaction = {}) {
  const user = interaction?.member?.user || interaction?.user || {};
  return {
    id: typeof user.id === "string" ? user.id : null,
    username: typeof user.username === "string" ? user.username : null,
    currentDisplayName: [
      interaction?.member?.nick,
      interaction?.member?.user?.global_name,
      interaction?.user?.global_name,
      user?.username,
    ].find((value) => typeof value === "string" && value.trim().length > 0) || null,
  };
}

function extractModalTextInputValue(components = [], targetCustomId = FITNESS_VERIFY_TOKEN_INPUT_CUSTOM_ID) {
  const rows = Array.isArray(components) ? components : [];
  for (const row of rows) {
    const rowComponents = Array.isArray(row?.components) ? row.components : [];
    for (const component of rowComponents) {
      if (component?.custom_id === targetCustomId && typeof component?.value === "string") {
        return component.value.trim();
      }
    }
  }

  return null;
}

function isFitnessVerifyButtonInteraction(interaction = {}) {
  return interaction?.type === 3 && interaction?.data?.custom_id === FITNESS_VERIFY_BUTTON_CUSTOM_ID;
}

function isFitnessVerifyModalSubmit(interaction = {}) {
  return interaction?.type === 5 && interaction?.data?.custom_id === FITNESS_VERIFY_MODAL_CUSTOM_ID;
}

function resolveFitnessVerifyBridgeConfig(env = process.env) {
  return {
    endpoint: readOptionalEnv("DISCORDOS_FITNESS_VERIFY_ENDPOINT", env)
      || readOptionalEnv("FITNESS_DISCORD_VERIFY_ENDPOINT", env),
    secret: readOptionalEnv("DISCORDOS_FITNESS_VERIFY_SECRET", env)
      || readOptionalEnv("DISCORD_VERIFICATION_BOT_SECRET", env),
    guildId: readOptionalEnv("DISCORDOS_GUILD_ID", env)
      || readOptionalEnv("DISCORD_GUILD_ID", env)
      || DEFAULT_DISCORDOS_GUILD_ID,
    verifiedRoleId: readOptionalEnv("DISCORDOS_VERIFIED_ROLE_ID", env)
      || readOptionalEnv("DISCORD_VERIFIED_ROLE_ID", env),
    unverifiedRoleId: readOptionalEnv("DISCORDOS_UNVERIFIED_ROLE_ID", env)
      || readOptionalEnv("DISCORD_UNVERIFIED_ROLE_ID", env),
    botToken: readOptionalEnv("DISCORDOS_BOT_TOKEN", env)
      || readOptionalEnv("DISCORD_BOT_TOKEN", env),
  };
}

function resolveDiscordMemberLinkConfig(env = process.env) {
  return {
    supabaseUrl: readOptionalEnv("DISCORDOS_MEMBER_LINK_SUPABASE_URL", env)
      || readOptionalEnv("DISCORDOS_SUPABASE_URL", env),
    serviceRoleKey: readOptionalEnv("DISCORDOS_MEMBER_LINK_SUPABASE_SERVICE_ROLE_KEY", env)
      || readOptionalEnv("DISCORDOS_SUPABASE_SERVICE_ROLE_KEY", env),
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function postFitnessVerifyBridge({
  endpoint,
  secret,
  token,
  discordUserId,
  discordUsername,
  fetchImpl = fetch,
}) {
  if (!hasValue(endpoint) || !hasValue(secret)) {
    return { ok: false, code: "verification_bridge_not_configured" };
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-discord-verification-secret": secret,
      },
      body: JSON.stringify({
        token,
        discordUserId,
        ...(hasValue(discordUsername) ? { discordUsername } : {}),
      }),
    });
    const body = await readJsonResponse(response);

    if (response.ok && body?.ok === true) {
      return {
        ok: true,
        fitnessUserId: typeof body.memberId === "string" ? body.memberId : null,
        userNumber: Number.isInteger(body.userNumber) ? body.userNumber : null,
        userKind: typeof body.userKind === "string" ? body.userKind : null,
      };
    }

    if (
      (response.status === 400 || response.status === 404)
      && typeof body?.code === "string"
      && (
        body.code === "DISCORD_VERIFICATION_INVALID_BODY"
        || body.code === "DISCORD_VERIFICATION_INVALID_OR_EXPIRED"
      )
    ) {
      return { ok: false, code: "verification_invalid_or_expired" };
    }

    return {
      ok: false,
      code: "verification_bridge_failed",
      status: response.status,
    };
  } catch {
    return { ok: false, code: "verification_bridge_failed" };
  }
}

async function discordBotRequest({
  path,
  token,
  method = "GET",
  body,
  fetchImpl = fetch,
}) {
  if (!hasValue(token)) {
    return { ok: false, status: 503 };
  }

  try {
    const response = await fetchImpl(`https://discord.com/api/v10${path}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch {
    return { ok: false, status: 503 };
  }
}

async function applyVerifiedRole({
  guildId,
  verifiedRoleId,
  actorDiscordUserId,
  botToken,
  fetchImpl = fetch,
}) {
  if (!hasValue(guildId) || !hasValue(verifiedRoleId) || !hasValue(actorDiscordUserId) || !hasValue(botToken)) {
    return { ok: false, code: "verification_role_config_missing" };
  }

  const result = await discordBotRequest({
    path: `/guilds/${guildId}/members/${actorDiscordUserId}/roles/${verifiedRoleId}`,
    token: botToken,
    method: "PUT",
    fetchImpl,
  });

  if (result.ok && result.status === 204) {
    return { ok: true };
  }

  return {
    ok: false,
    code: result.status === 403 ? "verification_role_assignment_forbidden" : "verification_role_assignment_failed",
    status: result.status,
  };
}

function shouldDisplayDiscordMemberNumber({ userKind, userNumber }) {
  return userKind === "human" && Number.isInteger(userNumber) && Number(userNumber) >= 0;
}

function sanitizeDiscordDisplayName(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  const withoutExistingPrefix = normalized.replace(DISCORD_MEMBER_NUMBER_PREFIX_PATTERN, "").trim();
  const withoutExistingSuffix = withoutExistingPrefix.replace(DISCORD_MEMBER_NUMBER_SUFFIX_PATTERN, "").trim();
  return withoutExistingSuffix || DEFAULT_MEMBER_DISPLAY_NAME;
}

function formatDiscordMemberNickname({ userNumber, currentDisplayName }) {
  const suffix = ` \u00b7 ${userNumber}`;
  const safeDisplayName = sanitizeDiscordDisplayName(currentDisplayName);
  const availableNameLength = 32 - suffix.length;

  if (availableNameLength <= 0) {
    return suffix.slice(-32).trimStart();
  }

  return `${safeDisplayName.slice(0, availableNameLength)}${suffix}`;
}

async function updateDiscordGuildMemberNickname({
  guildId,
  actorDiscordUserId,
  nickname,
  botToken,
  fetchImpl = fetch,
}) {
  if (!hasValue(guildId) || !hasValue(actorDiscordUserId) || !hasValue(nickname) || !hasValue(botToken)) {
    return { ok: false, code: "verification_nickname_config_missing" };
  }

  const result = await discordBotRequest({
    path: `/guilds/${guildId}/members/${actorDiscordUserId}`,
    token: botToken,
    method: "PATCH",
    body: { nick: nickname },
    fetchImpl,
  });

  if (result.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    code: result.status === 403
      ? "DISCORD_NICKNAME_UPDATE_FORBIDDEN"
      : result.status === 404
        ? "DISCORD_NICKNAME_UPDATE_NOT_FOUND"
        : "DISCORD_NICKNAME_UPDATE_FAILED",
    status: result.status,
  };
}

async function clearUnverifiedRole({
  guildId,
  unverifiedRoleId,
  actorDiscordUserId,
  botToken,
  fetchImpl = fetch,
}) {
  if (!hasValue(guildId) || !hasValue(unverifiedRoleId) || !hasValue(actorDiscordUserId) || !hasValue(botToken)) {
    return;
  }

  await discordBotRequest({
    path: `/guilds/${guildId}/members/${actorDiscordUserId}/roles/${unverifiedRoleId}`,
    token: botToken,
    method: "DELETE",
    fetchImpl,
  });
}

async function upsertDiscordMemberLink({
  supabaseUrl,
  serviceRoleKey,
  fitnessUserId,
  discordUserId,
  discordUsername,
  userNumber,
  userKind,
  verifiedRoleGrantedAt,
  nicknameSyncStatus,
  nicknameSyncedAt,
  lastErrorCode,
  fetchImpl = fetch,
}) {
  if (
    !hasValue(supabaseUrl)
    || !hasValue(serviceRoleKey)
    || !hasValue(fitnessUserId)
    || !hasValue(discordUserId)
  ) {
    return { ok: false, code: "verification_member_link_config_missing" };
  }

  try {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/upsert_discord_member_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        input_fitness_user_id: fitnessUserId,
        input_discord_user_id: discordUserId,
        input_discord_username: hasValue(discordUsername) ? discordUsername : null,
        input_user_number: Number.isInteger(userNumber) ? userNumber : null,
        input_user_kind: hasValue(userKind) ? userKind : "unknown",
        input_verified_role_granted_at: verifiedRoleGrantedAt,
        input_nickname_sync_status: nicknameSyncStatus,
        input_nickname_synced_at: nicknameSyncedAt,
        input_last_error_code: hasValue(lastErrorCode) ? lastErrorCode : null,
      }),
    });

    const body = await readJsonResponse(response);
    const result = Array.isArray(body) ? body[0] : body;
    if (response.ok && hasValue(result?.id)) {
      return { ok: true, linkId: result.id };
    }

    return { ok: false, code: "verification_member_link_upsert_failed", status: response.status };
  } catch {
    return { ok: false, code: "verification_member_link_upsert_failed" };
  }
}

async function buildFitnessVerifyResponse({
  interaction,
  env = process.env,
  fetchImpl = fetch,
}) {
  if (isFitnessVerifyButtonInteraction(interaction)) {
    return {
      ok: true,
      statusCode: 200,
      payload: buildVerifyModalResponse(),
      admission: {
        ok: true,
        executesRoute: false,
        route: {
          kind: "message_component",
          responseType: DISCORD_INTERACTION_RESPONSE_TYPE.MODAL,
          command: "fitness_verify_open",
        },
        reasonCodes: [],
      },
      execution: null,
      reasonCodes: [],
    };
  }

  if (!isFitnessVerifyModalSubmit(interaction)) {
    return null;
  }

  const token = extractModalTextInputValue(interaction?.data?.components);
  const actor = resolveDiscordInteractionUser(interaction);
  if (!hasValue(token) || !hasValue(actor.id)) {
    return {
      ok: true,
      statusCode: 200,
      payload: buildEphemeralMessageResponse("That token is invalid or expired. Generate a fresh key in Fitness and try again."),
      admission: {
        ok: true,
        executesRoute: false,
        route: {
          kind: "modal_submit",
          responseType: DISCORD_INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          command: "fitness_verify_modal",
        },
        reasonCodes: ["verification_input_invalid"],
      },
      execution: null,
      reasonCodes: ["verification_input_invalid"],
    };
  }

  const config = resolveFitnessVerifyBridgeConfig(env);
  const memberLinkConfig = resolveDiscordMemberLinkConfig(env);
  const verifyResult = await postFitnessVerifyBridge({
    endpoint: config.endpoint,
    secret: config.secret,
    token,
    discordUserId: actor.id,
    discordUsername: actor.username,
    fetchImpl,
  });

  if (!verifyResult.ok && verifyResult.code === "verification_invalid_or_expired") {
    return {
      ok: true,
      statusCode: 200,
      payload: buildEphemeralMessageResponse("That token is invalid or expired. Generate a fresh key in Fitness and try again."),
      admission: {
        ok: true,
        executesRoute: false,
        route: {
          kind: "modal_submit",
          responseType: DISCORD_INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          command: "fitness_verify_modal",
        },
        reasonCodes: ["verification_invalid_or_expired"],
      },
      execution: null,
      reasonCodes: ["verification_invalid_or_expired"],
    };
  }

  if (!verifyResult.ok) {
    return {
      ok: true,
      statusCode: 200,
      payload: buildEphemeralMessageResponse("Verification is temporarily unavailable. DM fawxzzy with a screenshot of Discord Connector and your one-time key."),
      admission: {
        ok: true,
        executesRoute: false,
        route: {
          kind: "modal_submit",
          responseType: DISCORD_INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          command: "fitness_verify_modal",
        },
        reasonCodes: [verifyResult.code],
      },
      execution: null,
      reasonCodes: [verifyResult.code],
    };
  }

  const verifiedRoleGrantedAt = new Date().toISOString();
  const roleResult = await applyVerifiedRole({
    guildId: config.guildId,
    verifiedRoleId: config.verifiedRoleId,
    actorDiscordUserId: actor.id,
    botToken: config.botToken,
    fetchImpl,
  });

  if (!roleResult.ok) {
    return {
      ok: true,
      statusCode: 200,
      payload: buildEphemeralMessageResponse("Your key was accepted, but Discord could not grant access right now. DM fawxzzy and mention the verify-role issue."),
      admission: {
        ok: true,
        executesRoute: false,
        route: {
          kind: "modal_submit",
          responseType: DISCORD_INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          command: "fitness_verify_modal",
        },
        reasonCodes: [roleResult.code],
      },
      execution: null,
      reasonCodes: [roleResult.code],
    };
  }

  await clearUnverifiedRole({
    guildId: config.guildId,
    unverifiedRoleId: config.unverifiedRoleId,
    actorDiscordUserId: actor.id,
    botToken: config.botToken,
    fetchImpl,
  });

  const shouldDisplayMemberNumber = shouldDisplayDiscordMemberNumber({
    userKind: verifyResult.userKind,
    userNumber: verifyResult.userNumber,
  });
  let nicknameSyncStatus = shouldDisplayMemberNumber ? "failed" : "skipped";
  let nicknameSyncedAt = null;
  let lastErrorCode = null;

  if (shouldDisplayMemberNumber) {
    const nicknameResult = await updateDiscordGuildMemberNickname({
      guildId: config.guildId,
      actorDiscordUserId: actor.id,
      nickname: formatDiscordMemberNickname({
        userNumber: verifyResult.userNumber,
        currentDisplayName: actor.currentDisplayName,
      }),
      botToken: config.botToken,
      fetchImpl,
    });

    if (nicknameResult.ok) {
      nicknameSyncStatus = "synced";
      nicknameSyncedAt = new Date().toISOString();
    } else {
      lastErrorCode = nicknameResult.code;
    }
  }

  await upsertDiscordMemberLink({
    supabaseUrl: memberLinkConfig.supabaseUrl,
    serviceRoleKey: memberLinkConfig.serviceRoleKey,
    fitnessUserId: verifyResult.fitnessUserId,
    discordUserId: actor.id,
    discordUsername: actor.username,
    userNumber: verifyResult.userNumber,
    userKind: verifyResult.userKind || "unknown",
    verifiedRoleGrantedAt,
    nicknameSyncStatus,
    nicknameSyncedAt,
    lastErrorCode,
    fetchImpl,
  });

  const successMessage = Number.isInteger(verifyResult.userNumber)
    ? nicknameSyncStatus === "synced"
      ? `Verified as Member ${verifyResult.userNumber}. You now have access to the server.`
      : `Verified as Member ${verifyResult.userNumber}. Your access is active, but Discord could not update your nickname.`
    : "Verified. You now have access to the server.";

  return {
    ok: true,
    statusCode: 200,
    payload: buildEphemeralMessageResponse(successMessage),
    admission: {
      ok: true,
      executesRoute: false,
      route: {
        kind: "modal_submit",
        responseType: DISCORD_INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        command: "fitness_verify_modal",
      },
      reasonCodes: [],
    },
    execution: null,
    reasonCodes: [],
  };
}

async function readRawBody(req) {
  if (typeof req.rawBody === "string") {
    return req.rawBody;
  }
  if (Buffer.isBuffer(req.rawBody)) {
    return req.rawBody.toString("utf8");
  }
  if (typeof req.body === "string") {
    return req.body;
  }
  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function responseForAdmission(admission, execution = null) {
  if (!admission.ok) {
    return {
      statusCode: 400,
      payload: {
        type: 4,
        data: {
          content: "Interaction route is not admitted.",
          flags: 64,
        },
      },
    };
  }
  if (execution && !execution.ok) {
    return {
      statusCode: 400,
      payload: {
        type: 4,
        data: {
          content: "DiscordOS button route execution was blocked.",
          flags: 64,
        },
      },
    };
  }
  if (admission.route?.kind === "pong") {
    return {
      statusCode: 200,
      payload: {
        type: 1,
      },
    };
  }
  return {
    statusCode: 200,
    payload: {
      type: 4,
      data: {
        content: execution?.executesStorageWrite
          ? "DiscordOS button route executed."
          : "DiscordOS button route admitted.",
        flags: 64,
      },
    },
  };
}

async function buildDiscordInteractionResponse({
  method = "POST",
  headers = {},
  rawBody,
  publicKey,
  nowSeconds = Math.floor(Date.now() / 1000),
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  if (method !== "POST") {
    return {
      ok: false,
      statusCode: 405,
      payload: { ok: false, error: "METHOD_NOT_ALLOWED" },
      reasonCodes: ["method_not_allowed"],
    };
  }
  if (!hasValue(publicKey)) {
    return {
      ok: false,
      statusCode: 503,
      payload: { ok: false, error: "DISCORD_PUBLIC_KEY_MISSING" },
      reasonCodes: ["discord_public_key_missing"],
    };
  }

  const body = String(rawBody || "");
  const signature = normalizeHeader(headers, "x-signature-ed25519");
  const timestamp = normalizeHeader(headers, "x-signature-timestamp");
  const signaturePreflight = signatureInternals.buildDiscordInteractionSignaturePreflight({
    publicKey,
    timestamp,
    signature,
    body,
    verify: true,
  }, nowSeconds);

  if (!signaturePreflight.ok) {
    return {
      ok: false,
      statusCode: 401,
      payload: { ok: false, error: "INVALID_INTERACTION_SIGNATURE" },
      signaturePreflight,
      reasonCodes: signaturePreflight.reasonCodes,
    };
  }

  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      payload: { ok: false, error: "INVALID_INTERACTION_BODY" },
      signaturePreflight,
      reasonCodes: ["interaction_body_invalid"],
    };
  }

  const admissionInput = buildAdmissionInput(interaction);
  const fitnessVerifyResponse = await buildFitnessVerifyResponse({
    interaction,
    env,
    fetchImpl,
  });
  if (fitnessVerifyResponse) {
    return {
      ...fitnessVerifyResponse,
      signaturePreflight,
    };
  }

  if (interaction?.type === 2 && interaction?.data?.name === "computa") {
    const payload = await computaInternals.handleComputaInteraction({
      interaction,
      env,
      fetchImpl,
    });
    return {
      ok: true,
      statusCode: 200,
      payload,
      signaturePreflight,
      admission: {
        ok: true,
        executesRoute: false,
        route: {
          kind: "application_command",
          responseType: payload.type,
          command: "computa",
        },
        reasonCodes: [],
      },
      execution: null,
      reasonCodes: [],
    };
  }

  const admission = admissionInternals.buildInteractionHandlerAdmission(admissionInput);
  let execution = null;
  if (shouldExecuteButtonRoute({ env, admission })) {
    execution = await buttonRouterInternals.buildMusicSeshButtonRouter({
      ...buildButtonExecutionInput(interaction, admissionInput),
      env,
      fetchImpl,
    });
  }
  const response = responseForAdmission(admission, execution);
  return {
    ok: admission.ok && (!execution || execution.ok),
    statusCode: response.statusCode,
    payload: response.payload,
    signaturePreflight,
    admission,
    execution,
    reasonCodes: [...new Set([
      ...admission.reasonCodes,
      ...(execution?.reasonCodes || []),
    ])],
  };
}

module.exports = async function discordInteractions(req, res) {
  const result = await buildDiscordInteractionResponse({
    method: req.method,
    headers: req.headers,
    rawBody: await readRawBody(req),
    publicKey: computaInternals.resolvePublicKey(process.env),
  });

  return res.status(result.statusCode).json(result.payload);
};

module.exports._internals = {
  normalizeHeader,
  interactionTypeName,
  surfaceFromCommandName,
  extractMusicOptions,
  buildEphemeralMessageResponse,
  buildVerifyModalResponse,
  readOptionalEnv,
  resolveDiscordInteractionUser,
  extractModalTextInputValue,
  isFitnessVerifyButtonInteraction,
  isFitnessVerifyModalSubmit,
  resolveFitnessVerifyBridgeConfig,
  resolveDiscordMemberLinkConfig,
  readJsonResponse,
  postFitnessVerifyBridge,
  discordBotRequest,
  applyVerifiedRole,
  shouldDisplayDiscordMemberNumber,
  sanitizeDiscordDisplayName,
  formatDiscordMemberNickname,
  updateDiscordGuildMemberNickname,
  clearUnverifiedRole,
  upsertDiscordMemberLink,
  buildFitnessVerifyResponse,
  buildAdmissionInput,
  shouldExecuteButtonRoute,
  buildButtonExecutionInput,
  readRawBody,
  responseForAdmission,
  buildDiscordInteractionResponse,
};
