const {
  _internals: updatePostInternals,
} = require("./discord-update-post");
const {
  _internals: musicSeshPublishInternals,
} = require("./discordos-music-sesh-control-post-publish");
const {
  _internals: pollAuthInternals,
} = require("./discordos-message-command-poll-auth");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DEFAULT_COMPUTA_OWNER_USER_ID = "552278941159784460";
const DEFAULT_TWITCH_URL = "https://www.twitch.tv/fawxzzy";
const DEFAULT_TIKTOK_URL = "https://www.tiktok.com/@fawxzzy";
const DEFAULT_GRAND_RISING_EMOJI = "GM:1507443437916524675";
const DEFAULT_GOODNIGHT_EMOJI = "goodnight:1507597897343041700";
const DEFAULT_MAIN_CHANNEL_ID = "1504674484068552784";
const DEFAULT_UPDATES_CHANNEL_ID = "1504671871512346695";
const DEFAULT_APPLICATION_ID = "1504700208251146371";
const DEFAULT_GUILD_ID = "1504668396338413670";
const DEFAULT_SUCCESS_REACTION = "fawxzzy:1507384062166302851";
const DEFAULT_WARNING_REACTION = "fawxzzy:1507384094424694785";
const COMMAND_CARD_MARKER = "discordos-computa-command-menu:v1";
const OWNER_CARD_MARKER = "discordos-computa-owner-command-menu:v1";
const MESSAGE_POLL_LIMIT = 25;
const MESSAGE_COMMAND_MAX_PER_RUN = 3;

const PENDING_MIGRATION_MESSAGE = "This Computa action has not been fully migrated into DiscordOS yet.";

const MESSAGE_COMMANDS = {
  menu: "computa",
  ownerMenu: "computa owner",
};

const MESSAGE_TRIGGERS = {
  menu: [
    "computa",
    "comp0uta",
  ],
  ownerMenu: [
    "computa owner",
    "comp0uta owner",
  ],
  setupFeedback: [
    "computa setup feedback",
  ],
  setupMusicSesh: [
    "computa setup music sesh",
    "computa music sesh setup",
    "computa setup spotify club",
    "computa spotify club setup",
  ],
  repairCommandCard: [
    "computa repair command card",
    "computa repair computa",
  ],
  repairFeedbackLauncher: [
    "computa repair feedback launcher",
    "computa repair feedback setup",
  ],
  releaseCheck: [
    "computa release check",
    "computa check release",
    "computa ledger check",
    "computa check ledger",
  ],
  archiveCheckedCards: [
    "computa archive checked cards",
    "computa archive checked",
    "computa archive resolved cards",
    "computa feedback archive checked cards",
  ],
  syncFeedbackReactions: [
    "computa sync feedback reactions",
    "computa feedback sync reactions",
    "computa sync checked cards",
  ],
  grandRising: [
    "good morning computa",
    "goodmorning computa",
    "good morning comp0uta",
    "goodmorning comp0uta",
    "good morning cumpta",
    "goodmorning cumpta",
    "morning computa",
    "morning comp0uta",
    "morning cumpta",
    "grand rising computa",
    "grandrising computa",
    "good morning",
    "goodmorning",
    "morning",
    "grand rising",
    "grandrising",
  ],
  goodnight: [
    "good night computa",
    "goodnight computa",
    "good night comp0uta",
    "goodnight comp0uta",
    "good night cumpta",
    "goodnight cumpta",
    "good night",
    "goodnight",
    "night computa",
    "night comp0uta",
    "night cumpta",
    "night",
    "nite computa",
    "nite comp0uta",
    "nite cumpta",
    "nite",
    "gn computa",
    "gn comp0uta",
    "gn cumpta",
    "gn",
  ],
};

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function readOptionalEnv(name, env = process.env) {
  return hasValue(env?.[name]) ? env[name].trim() : null;
}

function resolveApplicationId(env = process.env) {
  return readOptionalEnv("DISCORDOS_APPLICATION_ID", env) || DEFAULT_APPLICATION_ID;
}

function resolveGuildId(env = process.env) {
  return readOptionalEnv("DISCORDOS_GUILD_ID", env) || DEFAULT_GUILD_ID;
}

function resolveMainChannelId(env = process.env) {
  return readOptionalEnv("DISCORDOS_MAIN_CHANNEL_ID", env) || DEFAULT_MAIN_CHANNEL_ID;
}

function resolveUpdatesChannelId(env = process.env) {
  return readOptionalEnv("DISCORDOS_UPDATES_CHANNEL_ID", env) || DEFAULT_UPDATES_CHANNEL_ID;
}

function resolveBotToken(env = process.env) {
  return readOptionalEnv("DISCORDOS_BOT_TOKEN", env) || readOptionalEnv("DISCORD_BOT_TOKEN", env);
}

function resolvePublicKey(env = process.env) {
  return readOptionalEnv("DISCORDOS_PUBLIC_KEY", env) || readOptionalEnv("DISCORD_PUBLIC_KEY", env);
}

function resolveOwnerUserId(env = process.env) {
  return readOptionalEnv("DISCORDOS_COMPUTA_OWNER_USER_ID", env) || DEFAULT_COMPUTA_OWNER_USER_ID;
}

function resolveTwitchUrl(env = process.env) {
  return readOptionalEnv("DISCORDOS_COMPUTA_LIVE_TWITCH_URL", env) || DEFAULT_TWITCH_URL;
}

function resolveTikTokUrl(env = process.env) {
  return readOptionalEnv("DISCORDOS_COMPUTA_LIVE_TIKTOK_URL", env) || DEFAULT_TIKTOK_URL;
}

function resolveGrandRisingContent(env = process.env) {
  return readOptionalEnv("DISCORDOS_GRAND_RISING_CONTENT", env)
    || `<:${readOptionalEnv("DISCORDOS_GRAND_RISING_EMOJI", env) || DEFAULT_GRAND_RISING_EMOJI}> Grand Rising`;
}

function resolveGoodnightContent(env = process.env) {
  return readOptionalEnv("DISCORDOS_GOODNIGHT_CONTENT", env)
    || `<:${readOptionalEnv("DISCORDOS_GOODNIGHT_EMOJI", env) || DEFAULT_GOODNIGHT_EMOJI}> Goodnight`;
}

function resolveSuccessReaction(env = process.env) {
  return readOptionalEnv("DISCORDOS_MESSAGE_COMMAND_SUCCESS_REACTION", env) || DEFAULT_SUCCESS_REACTION;
}

function resolveWarningReaction(env = process.env) {
  return readOptionalEnv("DISCORDOS_MESSAGE_COMMAND_WARNING_REACTION", env) || DEFAULT_WARNING_REACTION;
}

function normalizeDiscordMessageCommandContent(content) {
  return String(content || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function buildGuildCommandsDefinition() {
  return [
    {
      name: "computa",
      description: "Open Computa operator tools.",
      options: [
        { type: 1, name: "menu", description: "Post or refresh the public Computa command card in this channel." },
        { type: 1, name: "owner", description: "Post or refresh the owner-only Computa command card in this channel." },
        { type: 1, name: "setup-feedback", description: "Refresh the Feedback launcher from this channel." },
        { type: 1, name: "setup-music-sesh", description: "Refresh the Music Sesh panel from this channel." },
        { type: 1, name: "repair-command-card", description: "Repost the public Computa command card in this channel." },
        { type: 1, name: "repair-feedback-launcher", description: "Repost the Feedback launcher from this channel." },
        { type: 1, name: "release-check", description: "Check Feedback release workflow state." },
        { type: 1, name: "archive-checked-cards", description: "Archive resolved feedback cards that already show the success reaction." },
        { type: 1, name: "sync-feedback-reactions", description: "Sync success reactions on resolved feedback cards." },
        {
          type: 1,
          name: "post-update",
          description: "Post a formatted update in the updates channel.",
          options: [
            { type: 3, name: "title", description: "Update title.", required: true },
            { type: 3, name: "body", description: "Update body.", required: true },
          ],
        },
        {
          type: 1,
          name: "post-live",
          description: "Post a live announcement in the updates channel.",
          options: [
            {
              type: 3,
              name: "provider",
              description: "Saved provider shortcut.",
              required: false,
              choices: [
                { name: "twitch", value: "twitch" },
                { name: "tiktok", value: "tiktok" },
              ],
            },
            {
              type: 3,
              name: "url",
              description: "Custom live link.",
              required: false,
            },
          ],
        },
        { type: 1, name: "grand-rising", description: "Post the Grand Rising greeting in this channel." },
        { type: 1, name: "goodmorning", description: "Post the Good Morning greeting in this channel." },
        { type: 1, name: "goodnight", description: "Post the Goodnight greeting in this channel." },
      ],
    },
  ];
}

function buildCommandCardPayload() {
  return {
    content: "",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "Computa",
        description: [
          "`computa` - Show this command card.",
          "`computa owner` - Show the owner command card.",
          "`goodmorning computa` - Post the morning greeting.",
          "`goodnight computa` - Post the night greeting.",
        ].join("\n"),
        color: 5763719,
        footer: { text: COMMAND_CARD_MARKER },
      },
    ],
  };
}

function buildOwnerCommandCardPayload() {
  return {
    content: "",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "Computa Owner",
        description: [
          "`computa` - Show the public command card.",
          "`computa owner` - Show this owner command card.",
          "`computa setup music sesh` - Refresh the Music Sesh panel.",
          "`computa post update [Title | body]` - Post a formatted update.",
          "`computa post live twitch` - Post the saved Twitch live announcement.",
          "`computa post live tiktok` - Post the saved TikTok live announcement.",
          "`computa post live [link]` - Post a custom live announcement.",
          "`computa setup feedback` - Pending migration to DiscordOS.",
          "`computa repair feedback launcher` - Pending migration to DiscordOS.",
          "`computa release check` - Pending migration to DiscordOS.",
          "`computa archive checked cards` - Pending migration to DiscordOS.",
          "`computa sync feedback reactions` - Pending migration to DiscordOS.",
        ].join("\n"),
        color: 5763719,
        footer: { text: OWNER_CARD_MARKER },
      },
    ],
  };
}

function buildPublicInteractionResponse(payload) {
  return {
    type: 4,
    data: payload,
  };
}

function buildEphemeralInteractionResponse(content) {
  return {
    type: 4,
    data: {
      content,
      flags: 64,
      allowed_mentions: { parse: [] },
    },
  };
}

function buildPendingMigrationResponse(actionLabel) {
  return `${actionLabel} is still pending full DiscordOS migration.`;
}

async function sendDiscordMessage({ channelId, token, payload, fetchImpl = fetch, method = "POST", messageId = null }) {
  const targetPath = messageId
    ? `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`
    : `${DISCORD_API_BASE}/channels/${channelId}/messages`;
  const response = await fetchImpl(targetPath, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bot ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const body = hasValue(text) ? JSON.parse(text) : null;
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function deleteDiscordMessage({ channelId, messageId, token, fetchImpl = fetch }) {
  const response = await fetchImpl(`${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
    headers: {
      authorization: `Bot ${token}`,
    },
  });
  return { ok: response.ok, status: response.status };
}

async function addDiscordReaction({ channelId, messageId, emoji, token, fetchImpl = fetch }) {
  const response = await fetchImpl(
    `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    {
      method: "PUT",
      headers: {
        authorization: `Bot ${token}`,
      },
    },
  );
  return { ok: response.ok, status: response.status };
}

async function fetchDiscordChannelMessages({ channelId, token, limit = MESSAGE_POLL_LIMIT, fetchImpl = fetch }) {
  const response = await fetchImpl(`${DISCORD_API_BASE}/channels/${channelId}/messages?limit=${limit}`, {
    method: "GET",
    headers: {
      authorization: `Bot ${token}`,
    },
  });
  const text = await response.text();
  const body = hasValue(text) ? JSON.parse(text) : null;
  return {
    ok: response.ok,
    status: response.status,
    messages: Array.isArray(body) ? body : [],
  };
}

function messageHasReaction(message, emojis = []) {
  const acceptedIdentifiers = new Set(
    emojis.flatMap((emoji) => {
      const normalized = String(emoji || "").trim();
      if (!normalized) {
        return [];
      }
      const parts = normalized.split(":").map((part) => part.trim()).filter(Boolean);
      return [normalized, ...parts];
    }),
  );
  const reactions = Array.isArray(message?.reactions) ? message.reactions : [];
  return reactions.some((reaction) => {
    const emojiId = reaction?.emoji?.id;
    const emojiName = reaction?.emoji?.name;
    return acceptedIdentifiers.has(emojiId) || acceptedIdentifiers.has(emojiName);
  });
}

function findBotMessageByFooter(messages, applicationId, footerMarker) {
  return messages.find((message) => {
    if (String(message?.author?.id || "") !== String(applicationId || "")) {
      return false;
    }
    const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
    return embeds.some((embed) => embed?.footer?.text === footerMarker);
  }) || null;
}

async function upsertCommandCard({
  channelId,
  token,
  applicationId,
  footerMarker,
  payload,
  fetchImpl = fetch,
}) {
  const recentMessages = await fetchDiscordChannelMessages({
    channelId,
    token,
    limit: 25,
    fetchImpl,
  });
  if (!recentMessages.ok) {
    return recentMessages;
  }

  const existing = findBotMessageByFooter(recentMessages.messages, applicationId, footerMarker);
  if (!existing?.id) {
    return sendDiscordMessage({ channelId, token, payload, fetchImpl });
  }

  const updateResult = await sendDiscordMessage({
    channelId,
    token,
    payload,
    fetchImpl,
    method: "PATCH",
    messageId: existing.id,
  });
  if (updateResult.ok) {
    return updateResult;
  }

  await deleteDiscordMessage({
    channelId,
    messageId: existing.id,
    token,
    fetchImpl,
  });
  return sendDiscordMessage({ channelId, token, payload, fetchImpl });
}

function resolveDiscordInteractionUserId(interaction) {
  return interaction?.member?.user?.id || interaction?.user?.id || null;
}

function isOwnerUserId(userId, env = process.env) {
  return hasValue(userId) && String(userId) === resolveOwnerUserId(env);
}

function normalizeSubcommandOptions(subcommandOption = {}) {
  const options = Array.isArray(subcommandOption.options) ? subcommandOption.options : [];
  const byName = new Map(options.map((option) => [option.name, option.value]));
  return {
    title: hasValue(byName.get("title")) ? String(byName.get("title")).trim() : null,
    body: hasValue(byName.get("body")) ? String(byName.get("body")).trim() : null,
    provider: hasValue(byName.get("provider")) ? String(byName.get("provider")).trim().toLowerCase() : null,
    url: hasValue(byName.get("url")) ? String(byName.get("url")).trim() : null,
  };
}

function extractInteractionSubcommand(interaction) {
  const options = Array.isArray(interaction?.data?.options) ? interaction.data.options : [];
  const subcommand = options.find((option) => option?.type === 1) || null;
  return {
    name: hasValue(subcommand?.name) ? subcommand.name.trim() : "menu",
    options: normalizeSubcommandOptions(subcommand),
  };
}

function buildLiveAnnouncementContent({ provider, url, env = process.env }) {
  const targetUrl = hasValue(url)
    ? url
    : provider === "twitch"
      ? resolveTwitchUrl(env)
      : provider === "tiktok"
        ? resolveTikTokUrl(env)
        : null;
  if (!targetUrl) {
    return null;
  }
  return `@everyone Fawxzzy is live: ${targetUrl}`;
}

async function postUpdate({ title, body, env = process.env, fetchImpl = fetch }) {
  return updatePostInternals.buildDiscordUpdatePost({
    title,
    body,
    apply: true,
    env,
    fetchImpl,
  });
}

async function postMusicSeshPanel({ env = process.env, fetchImpl = fetch }) {
  return musicSeshPublishInternals.buildMusicSeshControlPostPublish({
    allowPublish: true,
    apply: true,
    env: {
      ...env,
      DISCORDOS_MUSIC_SESH_CONTROL_POST: "enabled",
    },
    fetchImpl,
  });
}

async function postLiveAnnouncement({ provider, url, env = process.env, fetchImpl = fetch }) {
  const channelId = resolveUpdatesChannelId(env);
  const token = resolveBotToken(env);
  const content = buildLiveAnnouncementContent({ provider, url, env });
  if (!hasValue(channelId) || !hasValue(token) || !hasValue(content)) {
    return { ok: false, code: "live_post_invalid" };
  }

  return sendDiscordMessage({
    channelId,
    token,
    payload: {
      content,
      allowed_mentions: { parse: ["everyone"] },
    },
    fetchImpl,
  });
}

function resolveMessageCommandKind(message, env = process.env) {
  const normalized = normalizeDiscordMessageCommandContent(message?.content);
  if (MESSAGE_TRIGGERS.menu.includes(normalized)) return "menu";
  if (MESSAGE_TRIGGERS.ownerMenu.includes(normalized)) return "owner";
  if (MESSAGE_TRIGGERS.setupMusicSesh.includes(normalized)) return "setup-music-sesh";
  if (MESSAGE_TRIGGERS.repairCommandCard.includes(normalized)) return "repair-command-card";
  if (MESSAGE_TRIGGERS.setupFeedback.includes(normalized)) return "setup-feedback";
  if (MESSAGE_TRIGGERS.repairFeedbackLauncher.some((trigger) => normalized.includes(trigger))) return "repair-feedback-launcher";
  if (MESSAGE_TRIGGERS.releaseCheck.some((trigger) => normalized.includes(trigger))) return "release-check";
  if (MESSAGE_TRIGGERS.archiveCheckedCards.some((trigger) => normalized.includes(trigger))) return "archive-checked-cards";
  if (MESSAGE_TRIGGERS.syncFeedbackReactions.some((trigger) => normalized.includes(trigger))) return "sync-feedback-reactions";
  if (normalized.startsWith("computa post update")) return "post-update";
  if (normalized.startsWith("computa post live")) return "post-live";
  if (MESSAGE_TRIGGERS.grandRising.includes(normalized)) return "grand-rising";
  if (MESSAGE_TRIGGERS.goodnight.includes(normalized)) return "goodnight";
  return null;
}

function parseMessageUpdateCommand(content) {
  const match = String(content || "").trim().match(/^computa\s+post\s+update\s+\[(.+?)\s*\|\s*([\s\S]+)\]$/i);
  if (!match) {
    return null;
  }
  return {
    title: match[1].trim(),
    body: match[2].trim(),
  };
}

function parseMessageLiveCommand(content) {
  const match = String(content || "").trim().match(/^computa\s+post\s+live(?:\s+\[?(.+?)\]?)?$/i);
  if (!match) {
    return null;
  }
  const raw = hasValue(match[1]) ? match[1].trim() : "";
  if (!raw) {
    return { provider: null, url: null };
  }
  if (/^twitch$/i.test(raw)) {
    return { provider: "twitch", url: null };
  }
  if (/^tiktok$/i.test(raw)) {
    return { provider: "tiktok", url: null };
  }
  return { provider: null, url: raw };
}

async function respondToPendingMigration({ message, token, env = process.env, fetchImpl = fetch, actionLabel }) {
  const channelId = message?.channel_id || resolveMainChannelId(env);
  if (!hasValue(channelId) || !hasValue(token)) {
    return { ok: false, code: "pending_response_not_configured" };
  }
  return sendDiscordMessage({
    channelId,
    token,
    payload: {
      content: buildPendingMigrationResponse(actionLabel),
      allowed_mentions: { parse: [] },
    },
    fetchImpl,
  });
}

async function processMessageCommand({ message, env = process.env, fetchImpl = fetch }) {
  const commandKind = resolveMessageCommandKind(message, env);
  const token = resolveBotToken(env);
  const applicationId = resolveApplicationId(env);
  const channelId = message?.channel_id || resolveMainChannelId(env);
  const messageId = message?.id || null;
  const owner = isOwnerUserId(message?.author?.id, env);

  if (!commandKind || !hasValue(token) || !hasValue(channelId) || !hasValue(messageId)) {
    return { ok: false, code: "invalid_message_command" };
  }

  let result = { ok: false, code: "unsupported_command" };

  if (commandKind === "menu" || commandKind === "repair-command-card") {
    result = await upsertCommandCard({
      channelId,
      token,
      applicationId,
      footerMarker: COMMAND_CARD_MARKER,
      payload: buildCommandCardPayload(),
      fetchImpl,
    });
  } else if (commandKind === "owner") {
    if (!owner) {
      result = await respondToPendingMigration({
        message,
        token,
        env,
        fetchImpl,
        actionLabel: "Only the configured Computa owner can run `computa owner`",
      });
    } else {
      result = await upsertCommandCard({
        channelId,
        token,
        applicationId,
        footerMarker: OWNER_CARD_MARKER,
        payload: buildOwnerCommandCardPayload(),
        fetchImpl,
      });
    }
  } else if (commandKind === "grand-rising") {
    result = await sendDiscordMessage({
      channelId,
      token,
      payload: {
        content: resolveGrandRisingContent(env),
        allowed_mentions: { parse: [] },
      },
      fetchImpl,
    });
  } else if (commandKind === "goodnight") {
    result = await sendDiscordMessage({
      channelId,
      token,
      payload: {
        content: resolveGoodnightContent(env),
        allowed_mentions: { parse: [] },
      },
      fetchImpl,
    });
  } else if (commandKind === "post-update") {
    if (!owner) {
      result = await respondToPendingMigration({
        message,
        token,
        env,
        fetchImpl,
        actionLabel: "Only the configured Computa owner can run `computa post update`",
      });
    } else {
      const parsed = parseMessageUpdateCommand(message?.content);
      result = parsed
        ? await postUpdate({ title: parsed.title, body: parsed.body, env, fetchImpl })
        : { ok: false, code: "invalid_update_format" };
    }
  } else if (commandKind === "post-live") {
    if (!owner) {
      result = await respondToPendingMigration({
        message,
        token,
        env,
        fetchImpl,
        actionLabel: "Only the configured Computa owner can run `computa post live`",
      });
    } else {
      const parsed = parseMessageLiveCommand(message?.content);
      result = parsed
        ? await postLiveAnnouncement({ provider: parsed.provider, url: parsed.url, env, fetchImpl })
        : { ok: false, code: "invalid_live_format" };
    }
  } else if (commandKind === "setup-music-sesh") {
    if (!owner) {
      result = await respondToPendingMigration({
        message,
        token,
        env,
        fetchImpl,
        actionLabel: "Only the configured Computa owner can run `computa setup music sesh`",
      });
    } else {
      result = await postMusicSeshPanel({ env, fetchImpl });
    }
  } else {
    result = await respondToPendingMigration({
      message,
      token,
      env,
      fetchImpl,
      actionLabel: `\`${message.content}\``,
    });
  }

  const reaction = result.ok ? resolveSuccessReaction(env) : resolveWarningReaction(env);
  await addDiscordReaction({
    channelId,
    messageId,
    emoji: reaction,
    token,
    fetchImpl,
  });

  return {
    ok: Boolean(result.ok),
    commandKind,
    code: result.code || null,
  };
}

async function buildDiscordMessageCommandPollResponse({
  env = process.env,
  headers = {},
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const authorization = await pollAuthInternals.authorizeDiscordOsMessageCommandPollRequest({
    headers,
    env,
    fetchImpl,
    now,
  });
  if (!authorization.ok) {
    return {
      ok: false,
      statusCode: authorization.status,
      body: {
        ok: false,
        message: authorization.message,
      },
    };
  }

  const channelId = resolveMainChannelId(env);
  const token = resolveBotToken(env);
  if (!hasValue(channelId) || !hasValue(token)) {
    return {
      ok: false,
      statusCode: 503,
      body: {
        ok: false,
        message: "DiscordOS message command polling is not configured.",
      },
    };
  }

  const fetched = await fetchDiscordChannelMessages({
    channelId,
    token,
    limit: MESSAGE_POLL_LIMIT,
    fetchImpl,
  });
  if (!fetched.ok) {
    return {
      ok: false,
      statusCode: 500,
      body: {
        ok: false,
        message: "Could not read Discord channel messages.",
        processed: [],
      },
    };
  }

  const processed = [];
  const candidates = [...fetched.messages]
    .reverse()
    .filter((message) => {
      if (message?.author?.bot === true) {
        return false;
      }
      if (!resolveMessageCommandKind(message, env)) {
        return false;
      }
      return !messageHasReaction(message, [
        resolveSuccessReaction(env),
        resolveWarningReaction(env),
        "CHECK",
        "WARNING",
      ]);
    })
    .slice(0, MESSAGE_COMMAND_MAX_PER_RUN);

  for (const message of candidates) {
    const result = await processMessageCommand({
      message,
      env,
      fetchImpl,
    });
    processed.push({
      messageId: message?.id || null,
      commandKind: result.commandKind,
      ok: result.ok,
      code: result.code,
    });
  }

  return {
    ok: true,
    statusCode: 200,
    body: {
      ok: true,
      authMode: authorization.mode,
      processed,
    },
  };
}

async function handleComputaInteraction({
  interaction,
  env = process.env,
  fetchImpl = fetch,
}) {
  const subcommand = extractInteractionSubcommand(interaction);
  const owner = isOwnerUserId(resolveDiscordInteractionUserId(interaction), env);

  if (subcommand.name === "menu" || subcommand.name === "repair-command-card") {
    return buildPublicInteractionResponse(buildCommandCardPayload());
  }
  if (subcommand.name === "grand-rising" || subcommand.name === "goodmorning") {
    return buildPublicInteractionResponse({
      content: resolveGrandRisingContent(env),
      allowed_mentions: { parse: [] },
    });
  }
  if (subcommand.name === "goodnight") {
    return buildPublicInteractionResponse({
      content: resolveGoodnightContent(env),
      allowed_mentions: { parse: [] },
    });
  }
  if (subcommand.name === "owner") {
    return owner
      ? buildPublicInteractionResponse(buildOwnerCommandCardPayload())
      : buildEphemeralInteractionResponse("Only the configured Computa owner can use `/computa owner`.");
  }
  if (!owner) {
    return buildEphemeralInteractionResponse(`Only the configured Computa owner can use \`/computa ${subcommand.name}\`.`);
  }
  if (subcommand.name === "post-update") {
    if (!hasValue(subcommand.options.title) || !hasValue(subcommand.options.body)) {
      return buildEphemeralInteractionResponse("Provide both a title and body for the update.");
    }
    const result = await postUpdate({
      title: subcommand.options.title,
      body: subcommand.options.body,
      env,
      fetchImpl,
    });
    return result.ok
      ? buildEphemeralInteractionResponse(`Update posted in <#${resolveUpdatesChannelId(env)}>.`)
      : buildEphemeralInteractionResponse("DiscordOS could not post that update right now.");
  }
  if (subcommand.name === "post-live") {
    const result = await postLiveAnnouncement({
      provider: subcommand.options.provider,
      url: subcommand.options.url,
      env,
      fetchImpl,
    });
    return result.ok
      ? buildEphemeralInteractionResponse(`Live update posted in <#${resolveUpdatesChannelId(env)}>.`)
      : buildEphemeralInteractionResponse("DiscordOS could not post that live update right now.");
  }
  if (subcommand.name === "setup-music-sesh") {
    const result = await postMusicSeshPanel({ env, fetchImpl });
    return result.ok
      ? buildEphemeralInteractionResponse("Music Sesh panel refreshed from DiscordOS.")
      : buildEphemeralInteractionResponse("DiscordOS could not refresh the Music Sesh panel right now.");
  }

  return buildEphemeralInteractionResponse(buildPendingMigrationResponse(`/computa ${subcommand.name}`));
}

module.exports = {
  _internals: {
    DISCORD_API_BASE,
    DEFAULT_MAIN_CHANNEL_ID,
    DEFAULT_UPDATES_CHANNEL_ID,
    DEFAULT_APPLICATION_ID,
    DEFAULT_GUILD_ID,
    MESSAGE_COMMAND_MAX_PER_RUN,
    resolveApplicationId,
    resolveGuildId,
    resolveMainChannelId,
    resolveUpdatesChannelId,
    resolveBotToken,
    resolvePublicKey,
    normalizeDiscordMessageCommandContent,
    buildGuildCommandsDefinition,
    buildCommandCardPayload,
    buildOwnerCommandCardPayload,
    buildLiveAnnouncementContent,
    parseMessageUpdateCommand,
    parseMessageLiveCommand,
    resolveMessageCommandKind,
    buildDiscordMessageCommandPollResponse,
    handleComputaInteraction,
  },
};
