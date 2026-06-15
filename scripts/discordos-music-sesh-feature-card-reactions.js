const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const REACTION_ENV = "DISCORDOS_MUSIC_SESH_CARD_REACTIONS";
const REACTION_ENV_VALUE = "enabled";
const STATUS_REACTIONS = {
  success: {
    name: "success",
    id: "1507384062166302851",
  },
  failure: {
    name: "failure",
    id: "1507384094424694785",
  },
};
const LEGACY_STATUS_REACTIONS = {
  success: "\u2705",
  failure: "\u274c",
};

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
    threadId: null,
    messageId: null,
    status: "success",
    allowApply: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--thread-id") {
      options.threadId = readValue(args, index, "missing_thread_id_value");
      index += 1;
    } else if (arg === "--message-id") {
      options.messageId = readValue(args, index, "missing_message_id_value");
      index += 1;
    } else if (arg === "--status") {
      options.status = readValue(args, index, "missing_status_value");
      index += 1;
    } else if (arg === "--allow-apply") {
      options.allowApply = true;
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

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(STATUS_REACTIONS, normalized)) {
    throw new Error(`invalid_reaction_status:${normalized || "unknown"}`);
  }
  return normalized;
}

function resolveReactionAdmission({ allowApply, env }) {
  const envEnabled = env?.[REACTION_ENV] === REACTION_ENV_VALUE;
  if (!allowApply && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "reaction_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowApply && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "reaction_apply_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["feature_card_reaction_double_guard_missing"],
  };
}

function encodeDiscordReactionEmoji(emoji) {
  const reaction = typeof emoji === "string" ? emoji : `${emoji.name}:${emoji.id}`;
  return encodeURIComponent(reaction);
}

function formatReactionEmoji(emoji) {
  return typeof emoji === "string" ? emoji : `${emoji.name}:${emoji.id}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discordRequest({
  path,
  token,
  method = "GET",
  fetchImpl = fetch,
  retryCount = 1,
}) {
  const response = await fetchImpl(`${updatePostInternals.DISCORD_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
  });
  const payload = response.status === 204 || typeof response.json !== "function"
    ? null
    : await response.json().catch(() => null);
  if (response.status === 429 && retryCount > 0) {
    const retryAfterSeconds = Number(payload?.retry_after);
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? Math.ceil(retryAfterSeconds * 1000) + 250
      : 1500;
    await sleep(retryAfterMs);
    return discordRequest({
      path,
      token,
      method,
      fetchImpl,
      retryCount: retryCount - 1,
    });
  }
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function addMessageReaction({
  channelId,
  messageId,
  token,
  emoji,
  fetchImpl = fetch,
}) {
  return discordRequest({
    path: `/channels/${channelId}/messages/${messageId}/reactions/${encodeDiscordReactionEmoji(emoji)}/@me`,
    token,
    method: "PUT",
    fetchImpl,
  });
}

async function removeOwnMessageReaction({
  channelId,
  messageId,
  token,
  emoji,
  fetchImpl = fetch,
}) {
  const removed = await discordRequest({
    path: `/channels/${channelId}/messages/${messageId}/reactions/${encodeDiscordReactionEmoji(emoji)}/@me`,
    token,
    method: "DELETE",
    fetchImpl,
  });

  return {
    ...removed,
    ok: removed.ok || removed.status === 404,
  };
}

async function fetchDiscordMessage({
  channelId,
  messageId,
  token,
  fetchImpl = fetch,
}) {
  return discordRequest({
    path: `/channels/${channelId}/messages/${messageId}`,
    token,
    fetchImpl,
  });
}

function summarizeReactions(message) {
  if (!Array.isArray(message?.reactions)) {
    return [];
  }
  return message.reactions.map((reaction) => ({
    name: reaction?.emoji?.name || null,
    id: reaction?.emoji?.id || null,
    count: reaction?.count ?? null,
    me: reaction?.me === true,
  }));
}

function reactionPresent(reactions, emoji) {
  if (typeof emoji === "string") {
    return reactions.some((reaction) => reaction.name === emoji && reaction.me === true);
  }
  return reactions.some((reaction) =>
    reaction.name === emoji.name
      && reaction.id === emoji.id
      && reaction.me === true
  );
}

async function buildMusicSeshFeatureCardReactions({
  env = process.env,
  fetchImpl = fetch,
  threadId = null,
  messageId = null,
  status = "success",
  allowApply = false,
  apply = false,
} = {}) {
  const normalizedStatus = normalizeStatus(status);
  const reactionEmoji = STATUS_REACTIONS[normalizedStatus];
  const oppositeStatus = normalizedStatus === "success" ? "failure" : "success";
  const oppositeEmoji = STATUS_REACTIONS[oppositeStatus];
  const legacyReactionEmoji = LEGACY_STATUS_REACTIONS[normalizedStatus];
  const legacyOppositeEmoji = LEGACY_STATUS_REACTIONS[oppositeStatus];
  const resolvedMessageId = messageId || threadId;
  const admission = resolveReactionAdmission({ allowApply, env });
  const reasonCodes = [...admission.reasonCodes];

  if (!hasValue(threadId)) {
    reasonCodes.push("feature_card_thread_id_missing");
  }
  if (!hasValue(resolvedMessageId)) {
    reasonCodes.push("feature_card_message_id_missing");
  }
  if (apply && !admission.admitted) {
    reasonCodes.push("feature_card_reaction_apply_not_admitted");
  }
  if (apply && !hasValue(env.DISCORDOS_BOT_TOKEN)) {
    reasonCodes.push("bot_token_missing");
  }

  const canApply = apply
    && admission.admitted
    && hasValue(threadId)
    && hasValue(resolvedMessageId)
    && hasValue(env.DISCORDOS_BOT_TOKEN);
  let removeOppositeResult = {
    attempted: false,
    ok: false,
    httpStatus: null,
  };
  let removeLegacyResult = {
    attempted: false,
    ok: false,
    httpStatuses: [],
  };
  let addReactionResult = {
    attempted: false,
    ok: false,
    httpStatus: null,
  };
  let readback = {
    attempted: false,
    ok: false,
    httpStatus: null,
    currentReactionPresent: false,
    oppositeReactionPresent: false,
    reactions: [],
  };

  if (canApply) {
    const removed = await removeOwnMessageReaction({
      channelId: threadId,
      messageId: resolvedMessageId,
      token: env.DISCORDOS_BOT_TOKEN,
      emoji: oppositeEmoji,
      fetchImpl,
    });
    removeOppositeResult = {
      attempted: true,
      ok: removed.ok,
      httpStatus: removed.status,
    };

    const legacyRemovals = [];
    for (const legacyEmoji of [legacyReactionEmoji, legacyOppositeEmoji]) {
      const legacyRemoved = await removeOwnMessageReaction({
        channelId: threadId,
        messageId: resolvedMessageId,
        token: env.DISCORDOS_BOT_TOKEN,
        emoji: legacyEmoji,
        fetchImpl,
      });
      legacyRemovals.push(legacyRemoved);
    }
    removeLegacyResult = {
      attempted: true,
      ok: legacyRemovals.every((legacyRemoved) => legacyRemoved.ok),
      httpStatuses: legacyRemovals.map((legacyRemoved) => legacyRemoved.status),
    };

    const added = await addMessageReaction({
      channelId: threadId,
      messageId: resolvedMessageId,
      token: env.DISCORDOS_BOT_TOKEN,
      emoji: reactionEmoji,
      fetchImpl,
    });
    addReactionResult = {
      attempted: true,
      ok: added.ok,
      httpStatus: added.status,
    };

    const fetched = await fetchDiscordMessage({
      channelId: threadId,
      messageId: resolvedMessageId,
      token: env.DISCORDOS_BOT_TOKEN,
      fetchImpl,
    });
    const reactions = summarizeReactions(fetched.payload);
    readback = {
      attempted: true,
      ok: fetched.ok,
      httpStatus: fetched.status,
      currentReactionPresent: reactionPresent(reactions, reactionEmoji),
      oppositeReactionPresent: reactionPresent(reactions, oppositeEmoji),
      legacyCurrentReactionPresent: reactionPresent(reactions, legacyReactionEmoji),
      legacyOppositeReactionPresent: reactionPresent(reactions, legacyOppositeEmoji),
      reactions,
    };
    if (!fetched.ok) {
      reasonCodes.push("feature_card_reaction_readback_failed");
    } else if (!readback.currentReactionPresent) {
      reasonCodes.push("feature_card_reaction_readback_missing");
    } else if (readback.oppositeReactionPresent) {
      reasonCodes.push("opposite_reaction_readback_present");
    } else if (readback.legacyCurrentReactionPresent || readback.legacyOppositeReactionPresent) {
      reasonCodes.push("legacy_reaction_readback_present");
    }
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const ok = uniqueReasonCodes.length === 0;
  const result = {
    ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: canApply,
    slashCommandsAdmitted: false,
    status: !apply
      ? "dry_run"
      : ok
        ? "reaction_applied"
        : "blocked",
    threadId,
    messageId: resolvedMessageId,
    requestedStatus: normalizedStatus,
    reactionEmoji: formatReactionEmoji(reactionEmoji),
    reactionEmojiName: reactionEmoji.name,
    reactionEmojiId: reactionEmoji.id,
    oppositeStatus,
    oppositeEmoji: formatReactionEmoji(oppositeEmoji),
    oppositeEmojiName: oppositeEmoji.name,
    oppositeEmojiId: oppositeEmoji.id,
    legacyReactionEmoji,
    legacyOppositeEmoji,
    admission,
    removeOppositeResult,
    removeLegacyResult,
    addReactionResult,
    readback,
    reasonCodes: uniqueReasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.feature_card_reaction_ready"
        : "discordos.music_sesh.feature_card_reaction_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.feature_card_reaction",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        requestedStatus: result.requestedStatus,
        callsDiscordApi: result.callsDiscordApi,
        currentReactionPresent: result.readback.currentReactionPresent,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Feature Card Reactions",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- card status: \`${result.requestedStatus}\``,
    `- thread id: \`${result.threadId || "none"}\``,
    `- message id: \`${result.messageId || "none"}\``,
    `- admission: \`${result.admission.status}\``,
    `- add reaction HTTP: \`${result.addReactionResult.httpStatus || "none"}\``,
    `- readback HTTP: \`${result.readback.httpStatus || "none"}\``,
    `- reaction present: \`${result.readback.currentReactionPresent ? "true" : "false"}\``,
    `- opposite present: \`${result.readback.oppositeReactionPresent ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshFeatureCardReactions(options);
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
    REACTION_ENV,
    REACTION_ENV_VALUE,
    STATUS_REACTIONS,
    parseArgs,
    normalizeStatus,
    resolveReactionAdmission,
    encodeDiscordReactionEmoji,
    addMessageReaction,
    removeOwnMessageReaction,
    fetchDiscordMessage,
    summarizeReactions,
    reactionPresent,
    buildMusicSeshFeatureCardReactions,
    renderMarkdown,
  },
};
