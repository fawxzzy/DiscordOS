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
const DEFAULT_EPIC_REACTION_EMOJI = "epic:1507434865505603757";
const DEFAULT_MAIN_CHANNEL_ID = "1504674484068552784";
const DEFAULT_UPDATES_CHANNEL_ID = "1504671871512346695";
const DEFAULT_FEEDBACK_FORUM_CHANNEL_ID = "1504673475489562744";
const DEFAULT_APPLICATION_ID = "1504700208251146371";
const DEFAULT_GUILD_ID = "1504668396338413670";
const DEFAULT_SUCCESS_REACTION = "fawxzzy:1507384062166302851";
const DEFAULT_WARNING_REACTION = "fawxzzy:1507384094424694785";
const COMMAND_CARD_MARKER = "discordos-computa-command-menu:v1";
const OWNER_CARD_MARKER = "discordos-computa-owner-command-menu:v1";
const RELEASE_CHECK_CARD_MARKER = "fawx-computa-release-check:v1";
const FEEDBACK_PANEL_CHANNEL_NAME = "feedback-submission";
const LEGACY_FEEDBACK_PANEL_CHANNEL_NAMES = new Set(["submit-feedback"]);
const FEEDBACK_PANEL_SUBMIT_BUTTON_CUSTOM_ID = "discordos_feedback_submit_open";
const FEEDBACK_PANEL_UPDATE_BUTTON_CUSTOM_ID = "discordos_feedback_update_open";
const LEGACY_FEEDBACK_PANEL_SUBMIT_BUTTON_CUSTOM_ID = "fitness_feedback_submit_open";
const LEGACY_FEEDBACK_PANEL_UPDATE_BUTTON_CUSTOM_ID = "fitness_feedback_update_open";
const FEEDBACK_PANEL_TITLE = "Feedback Submission";
const FEEDBACK_PANEL_BODY_LINES = [
  "Use this panel to send bug reports or feature requests without cluttering main chat.",
  "",
  "- Submit: choose Bug or Feature, then create a card.",
  "- Edit: update or withdraw one of your cards.",
  "- Public cards stay visible in the feedback board for examples and discussion.",
  "",
  "Acceptance Criteria = a plain-language checklist of the outcome you want.",
  "Do not include passwords, tokens, or private info.",
];
const RESOLVED_FEEDBACK_TAG_NAMES = ["Fixed", "Closed", "Resolved", "Done", "Complete", "Completed"];
const LEGACY_SUCCESS_REACTION = "✅";
const DISCORD_EMBED_COLOR_SUCCESS = 0x22c55e;
const DISCORD_EMBED_COLOR_WARNING = 0xf59e0b;
const MESSAGE_POLL_LIMIT = 25;
const MESSAGE_COMMAND_MAX_PER_RUN = 3;
const DEFAULT_BOT_MESSAGE_REACTION_RULES = [
  {
    key: "epic",
    emoji: DEFAULT_EPIC_REACTION_EMOJI,
    pattern: /(^|[^a-z0-9])epic([^a-z0-9]|$)/i,
  },
];

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

function resolveFeedbackForumChannelId(env = process.env) {
  return readOptionalEnv("DISCORDOS_BUG_REPORT_FORUM_CHANNEL_ID", env) || DEFAULT_FEEDBACK_FORUM_CHANNEL_ID;
}

function resolveFeedbackPanelChannelId(env = process.env) {
  return readOptionalEnv("DISCORDOS_FEEDBACK_PANEL_CHANNEL_ID", env);
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

function normalizeChannelName(value) {
  return String(value || "").trim().toLowerCase();
}

function isLegacyFeedbackPanelChannelName(value) {
  return LEGACY_FEEDBACK_PANEL_CHANNEL_NAMES.has(normalizeChannelName(value));
}

function isManagedFeedbackPanelChannelName(value) {
  const normalized = normalizeChannelName(value);
  return normalized === FEEDBACK_PANEL_CHANNEL_NAME || LEGACY_FEEDBACK_PANEL_CHANNEL_NAMES.has(normalized);
}

function normalizeDiscordMessageCommandContent(content) {
  return String(content || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getRequestedBotMessageReactions(message, rules = DEFAULT_BOT_MESSAGE_REACTION_RULES) {
  if (!message || typeof message !== "object" || message.author?.bot === true) {
    return [];
  }

  const normalizedContent = normalizeDiscordMessageCommandContent(message.content);
  return rules
    .filter((rule) => rule?.pattern instanceof RegExp && rule.pattern.test(normalizedContent))
    .map((rule) => ({
      key: String(rule.key || "unknown"),
      emoji: String(rule.emoji || ""),
    }))
    .filter((rule) => rule.emoji.length > 0);
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
          "`computa setup feedback` - Refresh the Feedback launcher.",
          "`computa repair feedback launcher` - Repost the Feedback launcher.",
          "`computa release check` - Audit feedback release state.",
          "`computa archive checked cards` - Archive resolved feedback cards.",
          "`computa sync feedback reactions` - Sync resolved-card reactions.",
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

function buildFeedbackPanelPayload() {
  return {
    content: "",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: FEEDBACK_PANEL_TITLE,
        description: FEEDBACK_PANEL_BODY_LINES.join("\n"),
        color: DISCORD_EMBED_COLOR_SUCCESS,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            custom_id: FEEDBACK_PANEL_SUBMIT_BUTTON_CUSTOM_ID,
            label: "Submit",
          },
          {
            type: 2,
            style: 2,
            custom_id: FEEDBACK_PANEL_UPDATE_BUTTON_CUSTOM_ID,
            label: "Edit",
          },
        ],
      },
    ],
  };
}

function messageHasComponentCustomId(message, customId) {
  const components = Array.isArray(message?.components) ? message.components : [];
  return components.some((actionRow) => {
    const rowComponents = Array.isArray(actionRow?.components) ? actionRow.components : [];
    return rowComponents.some((component) => component?.custom_id === customId);
  });
}

function discordMessageHasFeedbackPanel(message) {
  const currentPanelCustomIds = [
    FEEDBACK_PANEL_SUBMIT_BUTTON_CUSTOM_ID,
    FEEDBACK_PANEL_UPDATE_BUTTON_CUSTOM_ID,
  ];
  const legacyPanelCustomIds = [
    LEGACY_FEEDBACK_PANEL_SUBMIT_BUTTON_CUSTOM_ID,
    LEGACY_FEEDBACK_PANEL_UPDATE_BUTTON_CUSTOM_ID,
  ];
  return [currentPanelCustomIds, legacyPanelCustomIds].some((customIds) =>
    customIds.every((customId) => messageHasComponentCustomId(message, customId))
  );
}

function discordMessageHasReleaseCheck(message) {
  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  return embeds.some((embed) => embed?.footer?.text === RELEASE_CHECK_CARD_MARKER || embed?.title === "Computa Release Check");
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

async function discordRequest({ token, path, method = "GET", body = null, fetchImpl = fetch }) {
  const response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = typeof response.text === "function" ? await response.text() : "";
  let payload = null;
  if (hasValue(text)) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    payload,
    code: payload && typeof payload === "object" && "code" in payload && payload.code != null
      ? String(payload.code)
      : null,
    message: payload && typeof payload === "object" && typeof payload.message === "string"
      ? payload.message
      : null,
  };
}

async function fetchDiscordChannel({ channelId, token, fetchImpl = fetch }) {
  const response = await discordRequest({
    token,
    path: `/channels/${channelId}`,
    fetchImpl,
  });
  return {
    ok: response.ok,
    status: response.status,
    code: response.code,
    message: response.message,
    channel: response.payload,
  };
}

async function fetchDiscordChannelMessage({ channelId, messageId, token, fetchImpl = fetch }) {
  const response = await discordRequest({
    token,
    path: `/channels/${channelId}/messages/${messageId}`,
    fetchImpl,
  });
  return {
    ok: response.ok,
    status: response.status,
    code: response.code,
    message: response.message,
    messageBody: response.payload,
  };
}

async function fetchDiscordGuildChannels({ guildId, token, fetchImpl = fetch }) {
  const response = await discordRequest({
    token,
    path: `/guilds/${guildId}/channels`,
    fetchImpl,
  });
  return {
    ok: response.ok,
    status: response.status,
    code: response.code,
    message: response.message,
    channels: Array.isArray(response.payload) ? response.payload : [],
  };
}

async function createDiscordGuildChannel({
  guildId,
  token,
  name,
  type = 0,
  parentId = null,
  position = null,
  fetchImpl = fetch,
}) {
  const response = await discordRequest({
    token,
    path: `/guilds/${guildId}/channels`,
    method: "POST",
    body: {
      name,
      type,
      ...(hasValue(parentId) ? { parent_id: parentId } : {}),
      ...(typeof position === "number" ? { position } : {}),
    },
    fetchImpl,
  });
  return {
    ok: response.ok,
    status: response.status,
    code: response.code,
    message: response.message,
    channel: response.payload,
  };
}

async function updateDiscordChannel({ channelId, token, body, fetchImpl = fetch }) {
  const response = await discordRequest({
    token,
    path: `/channels/${channelId}`,
    method: "PATCH",
    body,
    fetchImpl,
  });
  return {
    ok: response.ok,
    status: response.status,
    code: response.code,
    message: response.message,
    channel: response.payload,
  };
}

async function fetchDiscordGuildActiveThreads({ guildId, token, fetchImpl = fetch }) {
  const response = await discordRequest({
    token,
    path: `/guilds/${guildId}/threads/active`,
    fetchImpl,
  });
  return {
    ok: response.ok,
    status: response.status,
    code: response.code,
    message: response.message,
    threads: Array.isArray(response.payload?.threads) ? response.payload.threads : [],
  };
}

async function fetchDiscordChannelArchivedPublicThreads({ channelId, token, fetchImpl = fetch }) {
  const response = await discordRequest({
    token,
    path: `/channels/${channelId}/threads/archived/public?limit=100`,
    fetchImpl,
  });
  return {
    ok: response.ok,
    status: response.status,
    code: response.code,
    message: response.message,
    threads: Array.isArray(response.payload?.threads) ? response.payload.threads : [],
  };
}

async function fetchDiscordChannelArchivedPrivateThreads({ channelId, token, fetchImpl = fetch }) {
  const response = await discordRequest({
    token,
    path: `/channels/${channelId}/threads/archived/private?limit=100`,
    fetchImpl,
  });
  return {
    ok: response.ok,
    status: response.status,
    code: response.code,
    message: response.message,
    threads: Array.isArray(response.payload?.threads) ? response.payload.threads : [],
  };
}

async function deleteDiscordOwnMessageReaction({ channelId, messageId, emoji, token, fetchImpl = fetch }) {
  return discordRequest({
    token,
    path: `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    method: "DELETE",
    fetchImpl,
  });
}

async function deleteDiscordMessageReactionEmoji({ channelId, messageId, emoji, token, fetchImpl = fetch }) {
  return discordRequest({
    token,
    path: `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    method: "DELETE",
    fetchImpl,
  });
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

function findBotMessage(messages, applicationId, matchesMessage) {
  return messages.find((message) => {
    if (String(message?.author?.id || "") !== String(applicationId || "")) {
      return false;
    }
    return matchesMessage(message);
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

async function replaceSingleBotChannelPost({
  channelId,
  token,
  applicationId,
  payload,
  matchesMessage,
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

  const existing = findBotMessage(recentMessages.messages, applicationId, matchesMessage);
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

async function maybeRenameFeedbackPanelChannel({ channel, token, fetchImpl = fetch }) {
  if (!channel?.id || !isLegacyFeedbackPanelChannelName(channel?.name)) {
    return {
      ok: true,
      channel,
      renamed: false,
    };
  }

  const renameResult = await updateDiscordChannel({
    channelId: channel.id,
    token,
    body: { name: FEEDBACK_PANEL_CHANNEL_NAME },
    fetchImpl,
  });
  if (!renameResult.ok) {
    return renameResult;
  }

  return {
    ok: true,
    channel: renameResult.channel,
    renamed: true,
  };
}

async function findExistingFeedbackPanelChannel({ token, env = process.env, fetchImpl = fetch }) {
  const guildChannelsResult = await fetchDiscordGuildChannels({
    guildId: resolveGuildId(env),
    token,
    fetchImpl,
  });
  if (!guildChannelsResult.ok) {
    return guildChannelsResult;
  }

  const canonical = guildChannelsResult.channels.find((channel) => (
    channel?.id
    && channel?.type === 0
    && normalizeChannelName(channel?.name) === FEEDBACK_PANEL_CHANNEL_NAME
  ));
  if (canonical?.id) {
    return {
      ok: true,
      channelId: canonical.id,
      channelLabel: `<#${canonical.id}>`,
    };
  }

  const legacy = guildChannelsResult.channels.find((channel) => (
    channel?.id
    && channel?.type === 0
    && isLegacyFeedbackPanelChannelName(channel?.name)
  ));
  if (!legacy?.id) {
    return { ok: true, channelId: null, channelLabel: null };
  }

  const renameResult = await maybeRenameFeedbackPanelChannel({
    channel: legacy,
    token,
    fetchImpl,
  });
  if (!renameResult.ok) {
    return renameResult;
  }

  return {
    ok: true,
    channelId: legacy.id,
    channelLabel: `<#${legacy.id}>`,
  };
}

async function ensureFeedbackPanelChannel({ targetChannelId = null, token, env = process.env, fetchImpl = fetch }) {
  const configuredChannelId = resolveFeedbackPanelChannelId(env);
  if (configuredChannelId) {
    const configuredChannel = await fetchDiscordChannel({
      channelId: configuredChannelId,
      token,
      fetchImpl,
    });
    if (!configuredChannel.ok) {
      return configuredChannel;
    }

    const renameResult = await maybeRenameFeedbackPanelChannel({
      channel: configuredChannel.channel,
      token,
      fetchImpl,
    });
    if (!renameResult.ok) {
      return renameResult;
    }

    return {
      ok: true,
      channelId: configuredChannelId,
      channelLabel: `<#${configuredChannelId}>`,
    };
  }

  const existingChannel = await findExistingFeedbackPanelChannel({
    token,
    env,
    fetchImpl,
  });
  if (!existingChannel.ok) {
    return existingChannel;
  }
  if (hasValue(existingChannel.channelId)) {
    return existingChannel;
  }
  if (!hasValue(targetChannelId)) {
    return {
      ok: false,
      code: "feedback_panel_channel_missing",
      message: "DiscordOS could not resolve a source channel for the feedback launcher.",
    };
  }

  const sourceChannelResult = await fetchDiscordChannel({
    channelId: targetChannelId,
    token,
    fetchImpl,
  });
  if (!sourceChannelResult.ok) {
    return sourceChannelResult;
  }

  const sourceChannel = sourceChannelResult.channel;
  if (sourceChannel?.id && sourceChannel?.type === 0 && isManagedFeedbackPanelChannelName(sourceChannel?.name)) {
    const renameResult = await maybeRenameFeedbackPanelChannel({
      channel: sourceChannel,
      token,
      fetchImpl,
    });
    if (!renameResult.ok) {
      return renameResult;
    }
    return {
      ok: true,
      channelId: sourceChannel.id,
      channelLabel: `<#${sourceChannel.id}>`,
    };
  }

  const createResult = await createDiscordGuildChannel({
    guildId: resolveGuildId(env),
    token,
    name: FEEDBACK_PANEL_CHANNEL_NAME,
    type: 0,
    parentId: sourceChannel?.parent_id || null,
    position: typeof sourceChannel?.position === "number" ? sourceChannel.position + 1 : null,
    fetchImpl,
  });
  if (!createResult.ok || !createResult.channel?.id) {
    return createResult.ok
      ? { ok: false, code: "feedback_panel_channel_create_failed" }
      : createResult;
  }

  return {
    ok: true,
    channelId: createResult.channel.id,
    channelLabel: `<#${createResult.channel.id}>`,
  };
}

async function collectLegacyFeedbackPanelChannels({ targetChannelId, token, env = process.env, fetchImpl = fetch }) {
  const channels = new Map();
  const configuredChannelId = resolveFeedbackPanelChannelId(env);
  if (configuredChannelId && configuredChannelId !== targetChannelId) {
    channels.set(configuredChannelId, { id: configuredChannelId });
  }

  const guildChannelsResult = await fetchDiscordGuildChannels({
    guildId: resolveGuildId(env),
    token,
    fetchImpl,
  });
  if (!guildChannelsResult.ok) {
    return Array.from(channels.values());
  }

  for (const channel of guildChannelsResult.channels) {
    if (!channel?.id || channel.id === targetChannelId || channel.type !== 0) {
      continue;
    }
    if (channels.has(channel.id)) {
      channels.set(channel.id, { id: channel.id, name: channel.name || null });
      continue;
    }
    if (isLegacyFeedbackPanelChannelName(channel?.name)) {
      channels.set(channel.id, { id: channel.id, name: channel.name || null });
    }
  }

  return Array.from(channels.values());
}

async function deleteFeedbackPanelMessagesInChannel({ channelId, keepMessageIds = [], token, fetchImpl = fetch }) {
  const messagesResult = await fetchDiscordChannelMessages({
    channelId,
    token,
    limit: 50,
    fetchImpl,
  });
  if (!messagesResult.ok) {
    return;
  }

  const keepIds = new Set(keepMessageIds);
  const staleMessages = messagesResult.messages.filter((message) => (
    message?.id
    && !keepIds.has(message.id)
    && discordMessageHasFeedbackPanel(message)
  ));

  for (const message of staleMessages) {
    await deleteDiscordMessage({
      channelId,
      messageId: message.id,
      token,
      fetchImpl,
    });
  }
}

async function upsertFeedbackPanel({
  targetChannelId = null,
  cleanupLegacyPanels = false,
  env = process.env,
  fetchImpl = fetch,
}) {
  const token = resolveBotToken(env);
  const applicationId = resolveApplicationId(env);
  if (!hasValue(token)) {
    return { ok: false, code: "bot_token_missing" };
  }

  const panelChannel = await ensureFeedbackPanelChannel({
    targetChannelId,
    token,
    env,
    fetchImpl,
  });
  if (!panelChannel.ok || !hasValue(panelChannel.channelId)) {
    return panelChannel;
  }

  const payload = buildFeedbackPanelPayload();
  const messagesResult = await fetchDiscordChannelMessages({
    channelId: panelChannel.channelId,
    token,
    limit: 50,
    fetchImpl,
  });
  if (!messagesResult.ok) {
    return messagesResult;
  }

  const existingMessage = findBotMessage(
    messagesResult.messages,
    applicationId,
    discordMessageHasFeedbackPanel,
  );
  if (existingMessage?.id) {
    await deleteDiscordMessage({
      channelId: panelChannel.channelId,
      messageId: existingMessage.id,
      token,
      fetchImpl,
    });
  }

  const createResult = await sendDiscordMessage({
    channelId: panelChannel.channelId,
    token,
    payload,
    fetchImpl,
  });
  if (!createResult.ok) {
    return createResult;
  }

  if (cleanupLegacyPanels) {
    await deleteFeedbackPanelMessagesInChannel({
      channelId: panelChannel.channelId,
      keepMessageIds: createResult.body?.id ? [createResult.body.id] : [],
      token,
      fetchImpl,
    });

    const legacyChannels = await collectLegacyFeedbackPanelChannels({
      targetChannelId: panelChannel.channelId,
      token,
      env,
      fetchImpl,
    });
    for (const channel of legacyChannels) {
      await deleteFeedbackPanelMessagesInChannel({
        channelId: channel.id,
        token,
        fetchImpl,
      });
    }
  }

  return {
    ok: true,
    action: existingMessage?.id ? "reposted" : "created",
    channelLabel: panelChannel.channelLabel,
  };
}

function resolveForumTagIdsByNames(channel, tagNames) {
  const tags = Array.isArray(channel?.available_tags) ? channel.available_tags : [];
  const wantedNames = new Set(tagNames.map((tagName) => tagName.toLowerCase()));
  return tags
    .filter((tag) => typeof tag?.id === "string" && typeof tag?.name === "string" && wantedNames.has(tag.name.toLowerCase()))
    .map((tag) => tag.id);
}

function mapThreadForSync(thread, forumChannelId, syncSource = "active") {
  return {
    id: typeof thread?.id === "string" ? thread.id : null,
    parent_id: typeof thread?.parent_id === "string" ? thread.parent_id : forumChannelId,
    archived: thread?.archived === true || thread?.thread_metadata?.archived === true,
    applied_tags: Array.isArray(thread?.applied_tags)
      ? thread.applied_tags.filter((tagId) => typeof tagId === "string")
      : [],
    syncSource,
  };
}

async function listFeedbackThreadsForReactionSync({ forumChannelId, token, env = process.env, fetchImpl = fetch }) {
  const activeThreadsResult = await fetchDiscordGuildActiveThreads({
    guildId: resolveGuildId(env),
    token,
    fetchImpl,
  });
  if (!activeThreadsResult.ok) {
    return activeThreadsResult;
  }

  const threadMap = new Map();
  for (const thread of activeThreadsResult.threads) {
    if (thread?.parent_id !== forumChannelId) {
      continue;
    }
    const mapped = mapThreadForSync(thread, forumChannelId, "active");
    if (mapped.id) {
      threadMap.set(mapped.id, mapped);
    }
  }

  let skippedArchivedPublic = false;
  const archivedPublic = await fetchDiscordChannelArchivedPublicThreads({
    channelId: forumChannelId,
    token,
    fetchImpl,
  });
  if (archivedPublic.ok) {
    for (const thread of archivedPublic.threads) {
      const mapped = mapThreadForSync(thread, forumChannelId, "archived-public");
      if (mapped.id) {
        threadMap.set(mapped.id, mapped);
      }
    }
  } else {
    skippedArchivedPublic = true;
  }

  let skippedArchivedPrivate = false;
  const archivedPrivate = await fetchDiscordChannelArchivedPrivateThreads({
    channelId: forumChannelId,
    token,
    fetchImpl,
  });
  if (archivedPrivate.ok) {
    for (const thread of archivedPrivate.threads) {
      const mapped = mapThreadForSync(thread, forumChannelId, "archived-private");
      if (mapped.id) {
        threadMap.set(mapped.id, mapped);
      }
    }
  } else {
    skippedArchivedPrivate = true;
  }

  return {
    ok: true,
    threads: Array.from(threadMap.values()).slice(0, 100),
    skippedArchivedPublic,
    skippedArchivedPrivate,
  };
}

function discordMessageHasCustomSuccessReaction(message, env = process.env) {
  return messageHasReaction(message, [resolveSuccessReaction(env)]);
}

function discordMessageHasLegacySuccessReaction(message) {
  const reactions = Array.isArray(message?.reactions) ? message.reactions : [];
  return reactions.some((reaction) => reaction?.emoji?.name === LEGACY_SUCCESS_REACTION);
}

async function archiveCheckedFeedbackThreads({ env = process.env, fetchImpl = fetch }) {
  const forumChannelId = resolveFeedbackForumChannelId(env);
  const token = resolveBotToken(env);
  if (!hasValue(forumChannelId) || !hasValue(token)) {
    return { ok: false, code: "feedback_forum_not_configured" };
  }

  const activeThreadsResult = await fetchDiscordGuildActiveThreads({
    guildId: resolveGuildId(env),
    token,
    fetchImpl,
  });
  if (!activeThreadsResult.ok) {
    return activeThreadsResult;
  }

  const feedbackThreads = activeThreadsResult.threads
    .filter((thread) => thread?.parent_id === forumChannelId && thread?.archived !== true && thread?.thread_metadata?.archived !== true)
    .slice(0, 50);

  let checkedCount = 0;
  let archivedCount = 0;
  for (const thread of feedbackThreads) {
    const starterMessage = await fetchDiscordChannelMessage({
      channelId: thread.id,
      messageId: thread.id,
      token,
      fetchImpl,
    });
    if (!starterMessage.ok) {
      continue;
    }
    if (!discordMessageHasCustomSuccessReaction(starterMessage.messageBody, env)) {
      continue;
    }

    checkedCount += 1;
    const archiveResult = await updateDiscordChannel({
      channelId: thread.id,
      token,
      body: {
        archived: true,
        locked: true,
      },
      fetchImpl,
    });
    if (!archiveResult.ok) {
      return archiveResult;
    }
    archivedCount += 1;
  }

  return {
    ok: true,
    scannedCount: feedbackThreads.length,
    checkedCount,
    archivedCount,
  };
}

async function syncFeedbackResolvedReactions({ env = process.env, fetchImpl = fetch }) {
  const forumChannelId = resolveFeedbackForumChannelId(env);
  const token = resolveBotToken(env);
  if (!hasValue(forumChannelId) || !hasValue(token)) {
    return { ok: false, code: "feedback_forum_not_configured" };
  }

  const forumResult = await fetchDiscordChannel({
    channelId: forumChannelId,
    token,
    fetchImpl,
  });
  if (!forumResult.ok) {
    return forumResult;
  }

  const resolvedTagIds = new Set(resolveForumTagIdsByNames(forumResult.channel, RESOLVED_FEEDBACK_TAG_NAMES));
  if (resolvedTagIds.size === 0) {
    return { ok: false, code: "feedback_resolved_tags_not_found" };
  }

  const threadsResult = await listFeedbackThreadsForReactionSync({
    forumChannelId,
    token,
    env,
    fetchImpl,
  });
  if (!threadsResult.ok) {
    return threadsResult;
  }

  let addedCount = 0;
  let removedCount = 0;
  let skippedCount = 0;
  let legacyRemovedCount = 0;

  for (const thread of threadsResult.threads) {
    const starterMessage = await fetchDiscordChannelMessage({
      channelId: thread.id,
      messageId: thread.id,
      token,
      fetchImpl,
    });
    if (!starterMessage.ok) {
      skippedCount += 1;
      continue;
    }

    const shouldHaveReaction = thread.applied_tags.some((tagId) => resolvedTagIds.has(tagId));
    const hasCustomSuccess = discordMessageHasCustomSuccessReaction(starterMessage.messageBody, env);
    const hasLegacySuccess = discordMessageHasLegacySuccessReaction(starterMessage.messageBody);

    if (shouldHaveReaction && !hasCustomSuccess) {
      const addResult = await addDiscordReaction({
        channelId: thread.id,
        messageId: thread.id,
        emoji: resolveSuccessReaction(env),
        token,
        fetchImpl,
      });
      if (!addResult.ok) {
        return addResult;
      }
      addedCount += 1;
    }

    if (hasLegacySuccess) {
      const deleteLegacyResult = await deleteDiscordMessageReactionEmoji({
        channelId: thread.id,
        messageId: thread.id,
        emoji: LEGACY_SUCCESS_REACTION,
        token,
        fetchImpl,
      });
      if (deleteLegacyResult.ok) {
        legacyRemovedCount += 1;
      }
    }

    if (!shouldHaveReaction && hasCustomSuccess) {
      const deleteResult = await deleteDiscordOwnMessageReaction({
        channelId: thread.id,
        messageId: thread.id,
        emoji: resolveSuccessReaction(env),
        token,
        fetchImpl,
      });
      if (!deleteResult.ok) {
        return deleteResult;
      }
      removedCount += 1;
    }
  }

  return {
    ok: true,
    scannedCount: threadsResult.threads.length,
    addedCount,
    removedCount,
    legacyRemovedCount,
    skippedCount,
    skippedArchivedPublic: threadsResult.skippedArchivedPublic,
    skippedArchivedPrivate: threadsResult.skippedArchivedPrivate,
  };
}

async function buildReleaseLedgerCheckPayload({ env = process.env, fetchImpl = fetch }) {
  const forumChannelId = resolveFeedbackForumChannelId(env);
  const token = resolveBotToken(env);
  if (!hasValue(forumChannelId) || !hasValue(token)) {
    return { ok: false, code: "feedback_forum_not_configured" };
  }

  const forumResult = await fetchDiscordChannel({
    channelId: forumChannelId,
    token,
    fetchImpl,
  });
  if (!forumResult.ok) {
    return forumResult;
  }

  const resolvedTagIds = new Set(resolveForumTagIdsByNames(forumResult.channel, RESOLVED_FEEDBACK_TAG_NAMES));
  if (resolvedTagIds.size === 0) {
    return { ok: false, code: "feedback_resolved_tags_not_found" };
  }

  const threadsResult = await listFeedbackThreadsForReactionSync({
    forumChannelId,
    token,
    env,
    fetchImpl,
  });
  if (!threadsResult.ok) {
    return threadsResult;
  }

  let resolvedCount = 0;
  let missingSuccessCount = 0;
  let unresolvedWithSuccessCount = 0;
  let legacyReactionCount = 0;
  let skippedCount = 0;

  for (const thread of threadsResult.threads) {
    const starterMessage = await fetchDiscordChannelMessage({
      channelId: thread.id,
      messageId: thread.id,
      token,
      fetchImpl,
    });
    if (!starterMessage.ok) {
      skippedCount += 1;
      continue;
    }

    const isResolved = thread.applied_tags.some((tagId) => resolvedTagIds.has(tagId));
    const hasCustomSuccess = discordMessageHasCustomSuccessReaction(starterMessage.messageBody, env);
    const hasLegacySuccess = discordMessageHasLegacySuccessReaction(starterMessage.messageBody);

    if (isResolved) {
      resolvedCount += 1;
      if (!hasCustomSuccess) {
        missingSuccessCount += 1;
      }
    } else if (hasCustomSuccess) {
      unresolvedWithSuccessCount += 1;
    }

    if (hasLegacySuccess) {
      legacyReactionCount += 1;
    }
  }

  const issueCount = missingSuccessCount + unresolvedWithSuccessCount + legacyReactionCount;
  const scanNotes = [
    threadsResult.skippedArchivedPublic ? "- Archived public scan was skipped by Discord permissions." : null,
    threadsResult.skippedArchivedPrivate ? "- Archived private scan was skipped by Discord permissions." : null,
    skippedCount > 0 ? `- ${skippedCount} starter post(s) could not be inspected.` : null,
  ].filter(Boolean);

  return {
    ok: true,
    issueCount,
    body: {
      content: "",
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: "Computa Release Check",
          description: [
            issueCount === 0
              ? "Feedback release ledger checks are clean."
              : "Feedback release ledger checks need attention.",
            "",
            `Resolved cards scanned: ${resolvedCount}`,
            `Missing success reaction: ${missingSuccessCount}`,
            `Unresolved cards with success reaction: ${unresolvedWithSuccessCount}`,
            `Legacy white-checkmark reactions: ${legacyReactionCount}`,
            `Total forum cards scanned: ${threadsResult.threads.length}`,
            ...(scanNotes.length > 0 ? ["", ...scanNotes] : []),
          ].join("\n"),
          color: issueCount === 0 ? DISCORD_EMBED_COLOR_SUCCESS : DISCORD_EMBED_COLOR_WARNING,
          footer: {
            text: RELEASE_CHECK_CARD_MARKER,
          },
        },
      ],
    },
  };
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
  } else if (commandKind === "setup-feedback" || commandKind === "repair-feedback-launcher") {
    if (!owner) {
      result = await respondToPendingMigration({
        message,
        token,
        env,
        fetchImpl,
        actionLabel: `Only the configured Computa owner can run \`${message.content}\``,
      });
    } else {
      result = await upsertFeedbackPanel({
        targetChannelId: channelId,
        cleanupLegacyPanels: true,
        env,
        fetchImpl,
      });
    }
  } else if (commandKind === "release-check") {
    if (!owner) {
      result = await respondToPendingMigration({
        message,
        token,
        env,
        fetchImpl,
        actionLabel: "Only the configured Computa owner can run `computa release check`",
      });
    } else {
      const payloadResult = await buildReleaseLedgerCheckPayload({ env, fetchImpl });
      result = payloadResult.ok
        ? await replaceSingleBotChannelPost({
          channelId,
          token,
          applicationId,
          payload: payloadResult.body,
          matchesMessage: discordMessageHasReleaseCheck,
          fetchImpl,
        })
        : payloadResult;
    }
  } else if (commandKind === "archive-checked-cards") {
    if (!owner) {
      result = await respondToPendingMigration({
        message,
        token,
        env,
        fetchImpl,
        actionLabel: "Only the configured Computa owner can run `computa archive checked cards`",
      });
    } else {
      result = await archiveCheckedFeedbackThreads({ env, fetchImpl });
    }
  } else if (commandKind === "sync-feedback-reactions") {
    if (!owner) {
      result = await respondToPendingMigration({
        message,
        token,
        env,
        fetchImpl,
        actionLabel: "Only the configured Computa owner can run `computa sync feedback reactions`",
      });
    } else {
      result = await syncFeedbackResolvedReactions({ env, fetchImpl });
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

async function processBotMessageReactions({ message, env = process.env, fetchImpl = fetch }) {
  const token = resolveBotToken(env);
  const channelId = message?.channel_id || resolveMainChannelId(env);
  const messageId = message?.id || null;

  if (!hasValue(token) || !hasValue(channelId) || !hasValue(messageId)) {
    return { ok: false, reactionKeys: [], code: "invalid_bot_reaction_target" };
  }

  const requestedReactions = getRequestedBotMessageReactions(message)
    .filter((reaction) => !messageHasReaction(message, [reaction.emoji]));

  if (requestedReactions.length === 0) {
    return { ok: true, reactionKeys: [], code: "no_bot_reactions_requested" };
  }

  const appliedReactionKeys = [];
  let failed = false;
  for (const reaction of requestedReactions) {
    const result = await addDiscordReaction({
      channelId,
      messageId,
      emoji: reaction.emoji,
      token,
      fetchImpl,
    });
    if (result.ok) {
      appliedReactionKeys.push(reaction.key);
    } else {
      failed = true;
    }
  }

  return {
    ok: !failed,
    reactionKeys: appliedReactionKeys,
    code: failed ? "bot_reaction_failed" : "bot_reaction_applied",
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
      const requestedBotReactions = getRequestedBotMessageReactions(message)
        .filter((reaction) => !messageHasReaction(message, [reaction.emoji]));
      const hasMessageCommand = Boolean(resolveMessageCommandKind(message, env));
      const needsCommandProcessing = hasMessageCommand && !messageHasReaction(message, [
        resolveSuccessReaction(env),
        resolveWarningReaction(env),
        "CHECK",
        "WARNING",
      ]);
      return requestedBotReactions.length > 0 || needsCommandProcessing;
    })
    .slice(0, MESSAGE_COMMAND_MAX_PER_RUN);

  for (const message of candidates) {
    const botReactionResult = await processBotMessageReactions({
      message,
      env,
      fetchImpl,
    });
    const commandKind = resolveMessageCommandKind(message, env);
    const result = commandKind
      ? await processMessageCommand({
        message,
        env,
        fetchImpl,
      })
      : {
        ok: botReactionResult.ok,
        commandKind: null,
        code: botReactionResult.code,
      };
    processed.push({
      messageId: message?.id || null,
      commandKind: result.commandKind,
      ok: result.ok,
      code: result.code,
      reactionKeys: botReactionResult.reactionKeys,
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
  if (subcommand.name === "setup-feedback" || subcommand.name === "repair-feedback-launcher") {
    const result = await upsertFeedbackPanel({
      targetChannelId: interaction?.channel_id || null,
      cleanupLegacyPanels: true,
      env,
      fetchImpl,
    });
    return result.ok
      ? buildEphemeralInteractionResponse(
        result.action === "reposted"
          ? `Feedback launcher updated in ${result.channelLabel}.`
          : `Feedback launcher created in ${result.channelLabel}.`,
      )
      : buildEphemeralInteractionResponse("DiscordOS could not refresh the Feedback launcher right now.");
  }
  if (subcommand.name === "release-check") {
    const payloadResult = await buildReleaseLedgerCheckPayload({ env, fetchImpl });
    if (!payloadResult.ok) {
      return buildEphemeralInteractionResponse("DiscordOS could not run the release check right now.");
    }
    const result = await replaceSingleBotChannelPost({
      channelId: interaction?.channel_id || resolveMainChannelId(env),
      token: resolveBotToken(env),
      applicationId: resolveApplicationId(env),
      payload: payloadResult.body,
      matchesMessage: discordMessageHasReleaseCheck,
      fetchImpl,
    });
    return result.ok
      ? buildEphemeralInteractionResponse(
        payloadResult.issueCount === 0
          ? "Release check is clean. Card refreshed in this channel."
          : `Release check found ${payloadResult.issueCount} issue(s). Card refreshed in this channel.`,
      )
      : buildEphemeralInteractionResponse("DiscordOS could not refresh the release check card right now.");
  }
  if (subcommand.name === "archive-checked-cards") {
    const result = await archiveCheckedFeedbackThreads({ env, fetchImpl });
    return result.ok
      ? buildEphemeralInteractionResponse(
        `Archived ${result.archivedCount}/${result.checkedCount} checked feedback card(s). Scanned ${result.scannedCount} active card(s).`,
      )
      : buildEphemeralInteractionResponse("Archive checked cards failed. Check feedback forum configuration and bot permissions.");
  }
  if (subcommand.name === "sync-feedback-reactions") {
    const result = await syncFeedbackResolvedReactions({ env, fetchImpl });
    return result.ok
      ? buildEphemeralInteractionResponse(
        `Feedback reactions synced. Added ${result.addedCount}, removed ${result.removedCount}, and cleared ${result.legacyRemovedCount} legacy reaction(s).`,
      )
      : buildEphemeralInteractionResponse("Feedback reaction sync failed. Check feedback forum configuration.");
  }

  return buildEphemeralInteractionResponse(buildPendingMigrationResponse(`/computa ${subcommand.name}`));
}

module.exports = {
  _internals: {
    DISCORD_API_BASE,
    DEFAULT_MAIN_CHANNEL_ID,
    DEFAULT_UPDATES_CHANNEL_ID,
    DEFAULT_FEEDBACK_FORUM_CHANNEL_ID,
    DEFAULT_APPLICATION_ID,
    DEFAULT_GUILD_ID,
    MESSAGE_COMMAND_MAX_PER_RUN,
    resolveApplicationId,
    resolveGuildId,
    resolveMainChannelId,
    resolveUpdatesChannelId,
    resolveFeedbackForumChannelId,
    resolveBotToken,
    resolvePublicKey,
    normalizeDiscordMessageCommandContent,
    buildGuildCommandsDefinition,
    buildCommandCardPayload,
    buildOwnerCommandCardPayload,
    buildFeedbackPanelPayload,
    buildLiveAnnouncementContent,
    parseMessageUpdateCommand,
    parseMessageLiveCommand,
    resolveMessageCommandKind,
    getRequestedBotMessageReactions,
    messageHasReaction,
    discordMessageHasFeedbackPanel,
    buildReleaseLedgerCheckPayload,
    upsertFeedbackPanel,
    archiveCheckedFeedbackThreads,
    syncFeedbackResolvedReactions,
    buildDiscordMessageCommandPollResponse,
    handleComputaInteraction,
  },
};
