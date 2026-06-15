const {
  _internals: controlPostInternals,
} = require("./discordos-music-sesh-control-post");
const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const CONTROL_POST_ENV = "DISCORDOS_MUSIC_SESH_CONTROL_POST";
const CONTROL_POST_ENV_VALUE = "enabled";
const DEFAULT_DUPLICATE_LOOKUP_LIMIT = 25;
const DEFAULT_CONTROL_POST_TITLE = "Music Sesh Control Post";

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
    sessionId: "music-sesh-control",
    channelName: "music-sesh",
    title: DEFAULT_CONTROL_POST_TITLE,
    allowPublish: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--session-id") {
      options.sessionId = readValue(args, index, "missing_session_id_value");
      index += 1;
    } else if (arg === "--channel-name") {
      options.channelName = readValue(args, index, "missing_channel_name_value");
      index += 1;
    } else if (arg === "--title") {
      options.title = readValue(args, index, "missing_title_value");
      index += 1;
    } else if (arg === "--allow-publish") {
      options.allowPublish = true;
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

function resolveTarget(env = process.env) {
  const channelId = hasValue(env.DISCORDOS_MUSIC_SESH_CHANNEL_ID)
    ? env.DISCORDOS_MUSIC_SESH_CHANNEL_ID.trim()
    : hasValue(env.DISCORDOS_UPDATES_CHANNEL_ID)
      ? env.DISCORDOS_UPDATES_CHANNEL_ID.trim()
      : null;
  const fallbackToUpdates = !hasValue(env.DISCORDOS_MUSIC_SESH_CHANNEL_ID)
    && hasValue(env.DISCORDOS_UPDATES_CHANNEL_ID);

  return {
    configured: hasValue(channelId) && hasValue(env.DISCORDOS_BOT_TOKEN),
    type: channelId ? "discord_bot_channel" : "none",
    channelId,
    tokenPresent: hasValue(env.DISCORDOS_BOT_TOKEN),
    fallbackToUpdates,
  };
}

function resolvePublishAdmission({ allowPublish, env }) {
  const envEnabled = env?.[CONTROL_POST_ENV] === CONTROL_POST_ENV_VALUE;
  if (!allowPublish && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "publish_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowPublish && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "publish_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["control_post_double_guard_missing"],
  };
}

function buildPublishPayload({ title, channelName, sessionId }) {
  const controlPost = controlPostInternals.buildMusicSeshControlPost({
    channelName,
    sessionId,
  });
  return {
    ...controlPost.payloadPreview,
    embeds: [
      {
        ...controlPost.payloadPreview.embeds[0],
        title,
      },
    ],
  };
}

async function checkDuplicateControlPost({
  target,
  token,
  title,
  fetchImpl = fetch,
  limit = DEFAULT_DUPLICATE_LOOKUP_LIMIT,
}) {
  if (!target.channelId || !token) {
    return {
      attempted: false,
      status: "skipped",
      duplicate: null,
      searchedMessages: 0,
      httpStatus: null,
      reasonCodes: ["target_not_configured"],
    };
  }

  const fetched = await updatePostInternals.fetchRecentDiscordMessages({
    channelId: target.channelId,
    token,
    limit,
    fetchImpl,
  });
  if (!fetched.ok) {
    return {
      attempted: true,
      status: "failed",
      duplicate: null,
      searchedMessages: 0,
      httpStatus: fetched.status,
      reasonCodes: ["control_post_duplicate_lookup_failed"],
    };
  }

  const duplicate = updatePostInternals.summarizeDiscordMessage(
    updatePostInternals.findMessageByEmbedTitle(fetched.messages, title)
  );
  return {
    attempted: true,
    status: duplicate ? "duplicate_found" : "not_found",
    duplicate,
    searchedMessages: fetched.messages.length,
    httpStatus: fetched.status,
    reasonCodes: duplicate ? ["control_post_duplicate_title_found"] : [],
  };
}

async function buildMusicSeshControlPostPublish({
  env = process.env,
  fetchImpl = fetch,
  allowPublish = false,
  apply = false,
  sessionId = "music-sesh-control",
  channelName = "music-sesh",
  title = DEFAULT_CONTROL_POST_TITLE,
} = {}) {
  const payload = buildPublishPayload({ title, channelName, sessionId });
  const target = resolveTarget(env);
  const admission = resolvePublishAdmission({ allowPublish, env });
  const canPublish = apply && admission.admitted && target.configured;
  let duplicateCheck = {
    attempted: false,
    status: apply ? "skipped" : "not_requested",
    duplicate: null,
    searchedMessages: 0,
    httpStatus: null,
    reasonCodes: apply && !target.configured ? ["target_not_configured"] : [],
  };
  let sendResult = {
    ok: false,
    attempted: false,
    status: apply ? "blocked" : "not_requested",
    httpStatus: null,
    messageId: null,
    channelId: target.channelId,
    timestamp: null,
    reasonCodes: apply && !canPublish ? ["control_post_publish_not_admitted"] : [],
  };

  if (canPublish) {
    duplicateCheck = await checkDuplicateControlPost({
      target,
      token: env.DISCORDOS_BOT_TOKEN,
      title,
      fetchImpl,
    });
    if (duplicateCheck.reasonCodes.length > 0) {
      sendResult = {
        ...sendResult,
        reasonCodes: duplicateCheck.reasonCodes,
      };
    } else {
      const sent = await updatePostInternals.sendDiscordBotChannel({
        channelId: target.channelId,
        token: env.DISCORDOS_BOT_TOKEN,
        payload,
        fetchImpl,
      });
      sendResult = {
        ok: sent.ok,
        attempted: true,
        status: sent.ok ? "sent" : "failed",
        httpStatus: sent.status,
        messageId: sent.messageId,
        channelId: sent.channelId,
        timestamp: sent.timestamp,
        reasonCodes: sent.ok ? [] : ["control_post_send_failed"],
      };
    }
  }

  const reasonCodes = [...new Set([
    ...admission.reasonCodes,
    ...duplicateCheck.reasonCodes,
    ...sendResult.reasonCodes,
  ])];
  const ok = !apply
    ? admission.reasonCodes.length === 0
    : reasonCodes.length === 0 && sendResult.ok;
  const result = {
    ok,
    destructive: false,
    sendsMessages: sendResult.ok,
    callsDiscordApi: Boolean(canPublish || sendResult.attempted),
    slashCommandsAdmitted: false,
    status: !apply ? "dry_run" : sendResult.status,
    target,
    admission,
    duplicateCheck,
    sendResult,
    payloadPreview: payload,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.control_post_publish_ready"
        : "discordos.music_sesh.control_post_publish_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.control_post_publish",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        sendsMessages: result.sendsMessages,
        fallbackToUpdates: target.fallbackToUpdates,
        reasonCodeCount: reasonCodes.length,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Music Sesh Control Post Publish",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- target configured: \`${result.target.configured ? "true" : "false"}\``,
    `- fallback to updates: \`${result.target.fallbackToUpdates ? "true" : "false"}\``,
    `- duplicate status: \`${result.duplicateCheck.status}\``,
    `- message id: \`${result.sendResult.messageId || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshControlPostPublish(options);
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
    CONTROL_POST_ENV,
    CONTROL_POST_ENV_VALUE,
    DEFAULT_DUPLICATE_LOOKUP_LIMIT,
    DEFAULT_CONTROL_POST_TITLE,
    parseArgs,
    hasValue,
    resolveTarget,
    resolvePublishAdmission,
    buildPublishPayload,
    checkDuplicateControlPost,
    buildMusicSeshControlPostPublish,
    renderMarkdown,
  },
};
