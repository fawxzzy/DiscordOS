const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const FEATURE_CARD_POST_ENV = "DISCORDOS_MUSIC_SESH_FEATURE_CARD_POST";
const FEATURE_CARD_POST_ENV_VALUE = "enabled";
const DEFAULT_MUSIC_SESH_FORUM_CHANNEL_ID = "1508139160853286942";
const FEATURE_CARD_COLOR = 5763719;

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
    forumChannelId: null,
    cardId: null,
    title: null,
    body: null,
    allowPost: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--forum-channel-id") {
      options.forumChannelId = readValue(args, index, "missing_forum_channel_id_value");
      index += 1;
    } else if (arg === "--card-id") {
      options.cardId = readValue(args, index, "missing_card_id_value");
      index += 1;
    } else if (arg === "--title") {
      options.title = readValue(args, index, "missing_title_value");
      index += 1;
    } else if (arg === "--body") {
      options.body = readValue(args, index, "missing_body_value");
      index += 1;
    } else if (arg === "--allow-post") {
      options.allowPost = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveForumChannelId({ forumChannelId, env }) {
  return forumChannelId
    || env.DISCORDOS_MUSIC_SESH_FORUM_CHANNEL_ID
    || env.DISCORDOS_MUSIC_SESH_CHANNEL_ID
    || DEFAULT_MUSIC_SESH_FORUM_CHANNEL_ID;
}

function resolvePostAdmission({ allowPost, env }) {
  const envEnabled = env?.[FEATURE_CARD_POST_ENV] === FEATURE_CARD_POST_ENV_VALUE;
  if (!allowPost && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "post_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowPost && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "post_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["feature_card_post_double_guard_missing"],
  };
}

function buildFeatureCardThreadPayload({ cardId, title, body }) {
  if (!hasValue(cardId)) {
    throw new Error("missing_card_id");
  }
  if (!hasValue(title)) {
    throw new Error("missing_title");
  }
  if (!hasValue(body)) {
    throw new Error("missing_body");
  }

  return {
    name: title.trim(),
    message: {
      content: "",
      embeds: [
        {
          title: title.trim(),
          description: [
            `Card: \`${cardId.trim()}\``,
            "",
            updatePostInternals.normalizeMarkdownBody(body),
          ].join("\n"),
          color: FEATURE_CARD_COLOR,
        },
      ],
      allowed_mentions: { parse: [] },
    },
  };
}

async function discordRequest({
  path,
  token,
  method = "GET",
  body = null,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(`${updatePostInternals.DISCORD_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = response.status === 204 || typeof response.json !== "function"
    ? null
    : await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function createForumThread({
  forumChannelId,
  token,
  payload,
  fetchImpl = fetch,
}) {
  return discordRequest({
    path: `/channels/${forumChannelId}/threads`,
    token,
    method: "POST",
    body: payload,
    fetchImpl,
  });
}

async function fetchThreadStarterMessage({
  threadId,
  messageId,
  token,
  fetchImpl = fetch,
}) {
  return discordRequest({
    path: `/channels/${threadId}/messages/${messageId}`,
    token,
    fetchImpl,
  });
}

async function buildMusicSeshFeatureCardForumPost({
  env = process.env,
  fetchImpl = fetch,
  forumChannelId = null,
  cardId = null,
  title = null,
  body = null,
  allowPost = false,
  apply = false,
} = {}) {
  const resolvedForumChannelId = resolveForumChannelId({ forumChannelId, env });
  const admission = resolvePostAdmission({ allowPost, env });
  const payload = buildFeatureCardThreadPayload({ cardId, title, body });
  const reasonCodes = [...admission.reasonCodes];

  if (apply && !admission.admitted) {
    reasonCodes.push("feature_card_post_not_admitted");
  }
  if (apply && !hasValue(env.DISCORDOS_BOT_TOKEN)) {
    reasonCodes.push("bot_token_missing");
  }
  if (!hasValue(resolvedForumChannelId)) {
    reasonCodes.push("forum_channel_id_missing");
  }

  const canPost = apply
    && admission.admitted
    && hasValue(env.DISCORDOS_BOT_TOKEN)
    && hasValue(resolvedForumChannelId);
  let postResult = {
    attempted: false,
    ok: false,
    httpStatus: null,
    threadId: null,
    messageId: null,
    timestamp: null,
  };
  let readback = {
    attempted: false,
    ok: false,
    httpStatus: null,
    titleMatches: false,
  };

  if (canPost) {
    const posted = await createForumThread({
      forumChannelId: resolvedForumChannelId,
      token: env.DISCORDOS_BOT_TOKEN,
      payload,
      fetchImpl,
    });
    const threadId = posted.payload?.id || null;
    const messageId = posted.payload?.message?.id || threadId;
    postResult = {
      attempted: true,
      ok: posted.ok,
      httpStatus: posted.status,
      threadId,
      messageId,
      timestamp: posted.payload?.message?.timestamp || null,
    };
    if (!posted.ok) {
      reasonCodes.push("feature_card_forum_post_failed");
    }

    if (posted.ok && threadId && messageId) {
      const fetched = await fetchThreadStarterMessage({
        threadId,
        messageId,
        token: env.DISCORDOS_BOT_TOKEN,
        fetchImpl,
      });
      const embedTitle = fetched.payload?.embeds?.[0]?.title || null;
      readback = {
        attempted: true,
        ok: fetched.ok,
        httpStatus: fetched.status,
        titleMatches: embedTitle === title.trim(),
      };
      if (!fetched.ok) {
        reasonCodes.push("feature_card_forum_post_readback_failed");
      } else if (embedTitle !== title.trim()) {
        reasonCodes.push("feature_card_forum_post_readback_mismatch");
      }
    }
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const result = {
    ok: uniqueReasonCodes.length === 0,
    destructive: false,
    sendsMessages: postResult.ok,
    writesArtifacts: false,
    callsDiscordApi: canPost,
    slashCommandsAdmitted: false,
    status: !apply
      ? "dry_run"
      : uniqueReasonCodes.length === 0
        ? "posted"
        : "blocked",
    forumChannelId: resolvedForumChannelId,
    cardId,
    title,
    admission,
    postResult,
    readback,
    payloadPreview: payload,
    reasonCodes: uniqueReasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.feature_card_forum_post_ready"
        : "discordos.music_sesh.feature_card_forum_post_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.feature_card_forum_post",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        sendsMessages: result.sendsMessages,
        cardId: result.cardId || "none",
        threadId: result.postResult.threadId || "none",
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Feature Card Forum Post",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- forum channel id: \`${result.forumChannelId || "none"}\``,
    `- card id: \`${result.cardId || "none"}\``,
    `- title: \`${result.title || "none"}\``,
    `- admission: \`${result.admission.status}\``,
    `- thread id: \`${result.postResult.threadId || "none"}\``,
    `- message id: \`${result.postResult.messageId || "none"}\``,
    `- readback: \`${result.readback.titleMatches ? "pass" : "not_confirmed"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshFeatureCardForumPost(options);
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
    FEATURE_CARD_POST_ENV,
    FEATURE_CARD_POST_ENV_VALUE,
    DEFAULT_MUSIC_SESH_FORUM_CHANNEL_ID,
    parseArgs,
    resolveForumChannelId,
    resolvePostAdmission,
    buildFeatureCardThreadPayload,
    createForumThread,
    fetchThreadStarterMessage,
    buildMusicSeshFeatureCardForumPost,
    renderMarkdown,
  },
};
