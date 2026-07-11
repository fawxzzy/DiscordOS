const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const DISCORD_API_BASE = updatePostInternals.DISCORD_API_BASE;
const DISCORD_THREAD_TITLE_MAX_LENGTH = 100;
const DEFAULT_AUTO_ARCHIVE_DURATION = 10080;
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

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeIdentity(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function getBoardId(board) {
  return normalizeWhitespace(board?.board?.id || board?.id || "");
}

function getBoardLabel(board) {
  return normalizeWhitespace(board?.board?.label || board?.label || getBoardId(board));
}

function getTitleContract(board) {
  const boardConfig = board?.board || board || {};
  if (boardConfig.titleContract && typeof boardConfig.titleContract === "object") {
    return boardConfig.titleContract;
  }
  if (getBoardId(board).toLowerCase() === "mazer") {
    return {
      style: "prefix",
      prefix: "mazer",
      separator: ": ",
      maxLength: DISCORD_THREAD_TITLE_MAX_LENGTH,
    };
  }
  return {
    style: "plain",
    maxLength: DISCORD_THREAD_TITLE_MAX_LENGTH,
  };
}

function stripRepeatedPrefix({ value, prefix, separator }) {
  let remaining = normalizeWhitespace(value);
  const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefixPattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*${escapedSeparator}\\s*`, "i");
  while (prefixPattern.test(remaining)) {
    remaining = normalizeWhitespace(remaining.replace(prefixPattern, ""));
  }
  return remaining;
}

function truncateTitle(value, maxLength = DISCORD_THREAD_TITLE_MAX_LENGTH) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const suffix = "...";
  return normalizeWhitespace(normalized.slice(0, Math.max(1, maxLength - suffix.length))).replace(/[,:;\-\s]+$/, "") + suffix;
}

function formatCanonicalCardTitle({ board, card, title = null }) {
  const contract = getTitleContract(board);
  const proposedTitle = normalizeWhitespace(title || card?.title || card?.markerName || card?.id || "");
  if (!proposedTitle) {
    throw new Error("card_title_missing");
  }
  const maxLength = Number.isInteger(contract.maxLength) && contract.maxLength > 0
    ? contract.maxLength
    : DISCORD_THREAD_TITLE_MAX_LENGTH;

  if (contract.style === "prefix") {
    const prefix = normalizeWhitespace(contract.prefix || getBoardLabel(board)).toLowerCase();
    const separator = typeof contract.separator === "string" ? contract.separator : ": ";
    const body = stripRepeatedPrefix({ value: proposedTitle, prefix, separator });
    return truncateTitle(`${prefix}${separator}${body}`, maxLength);
  }

  return truncateTitle(proposedTitle, maxLength);
}

function getRequiredReactionForCard(card, board = null) {
  if (hasText(card?.reactionEmojiName) && hasText(card?.reactionEmojiId)) {
    return {
      status: normalizeWhitespace(card.reactionStatus || "failure").toLowerCase(),
      name: card.reactionEmojiName.trim(),
      id: card.reactionEmojiId.trim(),
    };
  }
  const boardReaction = board?.board?.requiredReaction || board?.requiredReaction || null;
  if (boardReaction && hasText(boardReaction.name) && hasText(boardReaction.id)) {
    return {
      status: normalizeWhitespace(boardReaction.status || "failure").toLowerCase(),
      name: boardReaction.name.trim(),
      id: boardReaction.id.trim(),
    };
  }
  const expectedStatus = card?.state === "completed" ? "success" : "failure";
  return {
    status: expectedStatus,
    ...STATUS_REACTIONS[expectedStatus],
  };
}

function buildCanonicalCardSpec({ board, card, sourceWorkflow = null }) {
  if (!card || !hasText(card.id)) {
    throw new Error("card_id_missing");
  }
  const canonicalTitle = formatCanonicalCardTitle({ board, card });
  return {
    boardId: getBoardId(board),
    boardLabel: getBoardLabel(board),
    cardId: card.id.trim(),
    stableIdentity: normalizeIdentity(card.id),
    canonicalTitle,
    proposedTitle: normalizeWhitespace(card.title),
    body: card.summary || null,
    state: card.state || null,
    status: card.reactionStatus || null,
    tags: [card.category, card.priority].filter(hasText),
    requiredReactions: [getRequiredReactionForCard(card, board)],
    existingThreadId: card.liveThreadId || null,
    existingMessageId: card.liveMessageId || card.liveThreadId || null,
    sourceWorkflow,
  };
}

function normalizeThreadTitle(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function findExistingThreadForSpec(threads, spec) {
  const byId = threads.find((thread) => thread.id && thread.id === spec.existingThreadId);
  if (byId) {
    return byId;
  }
  const expected = normalizeThreadTitle(spec.canonicalTitle);
  const proposed = normalizeThreadTitle(spec.proposedTitle);
  return threads.find((thread) => {
    const name = normalizeThreadTitle(thread.name);
    return name === expected || (proposed && name === proposed);
  }) || null;
}

function encodeReactionEmoji(emoji) {
  return encodeURIComponent(`${emoji.name}:${emoji.id}`);
}

function formatReactionEmoji(emoji) {
  return `${emoji.name}:${emoji.id}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discordRequest({
  path,
  token,
  method = "GET",
  body = null,
  fetchImpl = fetch,
  retryCount = 2,
}) {
  const response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
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

  if ((response.status === 429 || response.status >= 500) && retryCount > 0) {
    const retryAfterSeconds = Number(payload?.retry_after);
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? Math.ceil(retryAfterSeconds * 1000) + 250
      : (3 - retryCount) * 500 + 500;
    await sleep(retryAfterMs);
    return discordRequest({
      path,
      token,
      method,
      body,
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

async function fetchMessage({ channelId, messageId, token, fetchImpl = fetch }) {
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
  return reactions.some((reaction) =>
    reaction.name === emoji.name
      && reaction.id === emoji.id
      && reaction.me === true
  );
}

async function addMessageReaction({
  channelId,
  messageId,
  token,
  emoji,
  fetchImpl = fetch,
}) {
  return discordRequest({
    path: `/channels/${channelId}/messages/${messageId}/reactions/${encodeReactionEmoji(emoji)}/@me`,
    token,
    method: "PUT",
    fetchImpl,
  });
}

async function ensureRequiredReaction({
  channelId,
  messageId,
  token,
  emoji,
  fetchImpl = fetch,
}) {
  const before = await fetchMessage({ channelId, messageId, token, fetchImpl });
  const beforeReactions = summarizeReactions(before.payload);
  if (!before.ok) {
    return {
      ok: false,
      status: "read_failed",
      reactionTarget: { channelId, messageId },
      emoji: formatReactionEmoji(emoji),
      beforeHttpStatus: before.status,
      addHttpStatus: null,
      afterHttpStatus: null,
      alreadyPresent: false,
      presentAfter: false,
      reasonCodes: ["required_reaction_read_failed"],
    };
  }
  if (reactionPresent(beforeReactions, emoji)) {
    return {
      ok: true,
      status: "already_present",
      reactionTarget: { channelId, messageId },
      emoji: formatReactionEmoji(emoji),
      beforeHttpStatus: before.status,
      addHttpStatus: null,
      afterHttpStatus: before.status,
      alreadyPresent: true,
      presentAfter: true,
      reasonCodes: [],
    };
  }

  const added = await addMessageReaction({ channelId, messageId, token, emoji, fetchImpl });
  const after = await fetchMessage({ channelId, messageId, token, fetchImpl });
  const afterReactions = summarizeReactions(after.payload);
  const presentAfter = reactionPresent(afterReactions, emoji);
  const reasonCodes = [];
  if (!added.ok) {
    reasonCodes.push(added.status === 403 ? "required_reaction_permission_denied" : "required_reaction_apply_failed");
  }
  if (!after.ok) {
    reasonCodes.push("required_reaction_readback_failed");
  } else if (!presentAfter) {
    reasonCodes.push("required_reaction_readback_missing");
  }
  return {
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "applied" : "blocked",
    reactionTarget: { channelId, messageId },
    emoji: formatReactionEmoji(emoji),
    beforeHttpStatus: before.status,
    addHttpStatus: added.status,
    afterHttpStatus: after.status,
    alreadyPresent: false,
    presentAfter,
    reasonCodes,
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

async function updateThreadName({
  threadId,
  token,
  name,
  fetchImpl = fetch,
}) {
  return discordRequest({
    path: `/channels/${threadId}`,
    token,
    method: "PATCH",
    body: { name },
    fetchImpl,
  });
}

async function updateThreadMessage({
  threadId,
  messageId,
  token,
  message,
  fetchImpl = fetch,
}) {
  return discordRequest({
    path: `/channels/${threadId}/messages/${messageId}`,
    token,
    method: "PATCH",
    body: message,
    fetchImpl,
  });
}

async function upsertDiscordForumCard({
  spec,
  existingThread = null,
  forumChannelId,
  token,
  buildPayload,
  apply = false,
  fetchImpl = fetch,
}) {
  const payload = buildPayload(spec);
  const reasonCodes = [];
  if (!apply) {
    return {
      ok: true,
      action: existingThread ? "would_update" : "would_create",
      threadId: existingThread?.id || spec.existingThreadId || null,
      messageId: existingThread?.messageId || spec.existingMessageId || null,
      canonicalTitle: spec.canonicalTitle,
      reactionResult: null,
      httpStatus: null,
      reasonCodes,
    };
  }

  let threadId = existingThread?.id || null;
  let messageId = existingThread?.messageId || existingThread?.message?.id || existingThread?.id || null;
  let action = "updated";
  let httpStatus = null;

  if (existingThread) {
    if (normalizeThreadTitle(existingThread.name) !== normalizeThreadTitle(spec.canonicalTitle)) {
      const renamed = await updateThreadName({
        threadId: existingThread.id,
        token,
        name: spec.canonicalTitle,
        fetchImpl,
      });
      httpStatus = renamed.status;
      if (!renamed.ok) {
        reasonCodes.push("card_thread_rename_failed");
      }
    }
    const updated = await updateThreadMessage({
      threadId: existingThread.id,
      messageId,
      token,
      message: payload.message,
      fetchImpl,
    });
    httpStatus = updated.status;
    if (!updated.ok) {
      reasonCodes.push("card_thread_message_update_failed");
    }
  } else {
    const created = await createForumThread({
      forumChannelId,
      token,
      payload,
      fetchImpl,
    });
    action = "created";
    httpStatus = created.status;
    threadId = created.payload?.id || null;
    messageId = created.payload?.message?.id || threadId;
    if (!created.ok || !threadId || !messageId) {
      reasonCodes.push("card_thread_create_failed");
    }
  }

  const reaction = spec.requiredReactions[0];
  const reactionResult = threadId && messageId && reasonCodes.length === 0
    ? await ensureRequiredReaction({
      channelId: threadId,
      messageId,
      token,
      emoji: reaction,
      fetchImpl,
    })
    : {
      ok: false,
      status: "not_attempted",
      reactionTarget: { channelId: threadId, messageId },
      emoji: formatReactionEmoji(reaction),
      reasonCodes: ["required_reaction_not_attempted"],
    };
  reasonCodes.push(...reactionResult.reasonCodes);

  return {
    ok: reasonCodes.length === 0,
    action,
    threadId,
    messageId,
    canonicalTitle: spec.canonicalTitle,
    reactionResult,
    httpStatus,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

module.exports = {
  _internals: {
    DISCORD_API_BASE,
    DISCORD_THREAD_TITLE_MAX_LENGTH,
    DEFAULT_AUTO_ARCHIVE_DURATION,
    STATUS_REACTIONS,
    hasText,
    normalizeWhitespace,
    normalizeIdentity,
    getTitleContract,
    formatCanonicalCardTitle,
    getRequiredReactionForCard,
    buildCanonicalCardSpec,
    normalizeThreadTitle,
    findExistingThreadForSpec,
    encodeReactionEmoji,
    formatReactionEmoji,
    discordRequest,
    fetchMessage,
    summarizeReactions,
    reactionPresent,
    addMessageReaction,
    ensureRequiredReaction,
    createForumThread,
    updateThreadName,
    updateThreadMessage,
    upsertDiscordForumCard,
  },
};
