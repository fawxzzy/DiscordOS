const {
  _internals: updatePostInternals,
} = require("./discord-update-post");
const {
  _internals: textIntegrity,
} = require("./discordos-board-text-integrity");

const DISCORD_API_BASE = updatePostInternals.DISCORD_API_BASE;
const DISCORD_THREAD_TITLE_MAX_LENGTH = 100;
const DEFAULT_AUTO_ARCHIVE_DURATION = 10080;
const CANONICAL_CARD_START = "<!-- ATLAS-CARD:START -->";
const CANONICAL_CARD_END = "<!-- ATLAS-CARD:END -->";
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
  return textIntegrity.classifyText(String(value || "")).normalizedText.trim().replace(/\s+/g, " ");
}

function normalizeIdentity(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCanonicalCardBody(content) {
  const value = String(content || "");
  const start = value.indexOf(CANONICAL_CARD_START);
  const end = value.indexOf(CANONICAL_CARD_END);
  if (start < 0 || end <= start) return null;
  const managed = value.slice(start, end + CANONICAL_CARD_END.length);
  const metadata = (name) => managed.match(new RegExp(`^- ${name}:\\s*\`([^\`]+)\``, "im"))?.[1]?.trim() || "";
  const section = (heading) => managed.match(new RegExp(`(?:^|\\n)## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |\\n${escapeRegExp(CANONICAL_CARD_END)}|$)`, "i"))?.[1]?.trim() || "";
  const items = (heading) => section(heading)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter((line) => line && !/^none$/i.test(line));
  return {
    id: managed.match(/ATLAS-CARD-ID:\s*`([^`]+)`/i)?.[1]?.trim() || "",
    project: metadata("project"),
    title: "",
    type: metadata("type"),
    state: metadata("state").toLowerCase(),
    priority: metadata("priority"),
    owner: metadata("owner"),
    progress: metadata("progress"),
    updatedAt: metadata("updated"),
    summary: section("Summary"),
    objective: items("Objective")[0] || "",
    acceptanceCriteria: items("Acceptance criteria"),
    discoveries: items("Discoveries"),
    nextActions: items("Next actions"),
    blockers: items("Blockers"),
    evidence: items("Evidence"),
  };
}

function inspectCanonicalCardBody(content) {
  const card = parseCanonicalCardBody(content);
  const missingFields = [];
  if (!card) {
    return {
      managed: false,
      complete: false,
      card: null,
      updatedTime: null,
      missingFields: ["canonical_body"],
    };
  }
  if (!hasText(card.id)) missingFields.push("stable_card_id");
  if (!hasText(card.project)) missingFields.push("project");
  if (!hasText(card.state)) missingFields.push("state");
  if (!hasText(card.owner)) missingFields.push("owner");
  if (!hasText(card.priority)) missingFields.push("priority");
  if (!hasText(card.summary)) missingFields.push("summary");
  if (!hasText(card.objective)) missingFields.push("objective");
  if (card.acceptanceCriteria.length === 0) missingFields.push("acceptance_criteria");
  if (card.nextActions.length === 0) missingFields.push("next_actions");
  const updatedTime = Date.parse(card.updatedAt);
  if (!hasText(card.updatedAt) || !Number.isFinite(updatedTime)) {
    missingFields.push("updated_timestamp");
  }
  return {
    managed: true,
    complete: missingFields.length === 0,
    card,
    updatedTime: Number.isFinite(updatedTime) ? updatedTime : null,
    missingFields,
  };
}

function evaluateStarterMessageUpdate({ existingContent, proposedContent }) {
  const currentContent = String(existingContent || "");
  const nextContent = String(proposedContent || "");
  if (currentContent === nextContent) {
    return {
      ok: true,
      action: "unchanged",
      existing: inspectCanonicalCardBody(currentContent),
      proposed: inspectCanonicalCardBody(nextContent),
      reasonCodes: [],
    };
  }

  const existing = inspectCanonicalCardBody(currentContent);
  const proposed = inspectCanonicalCardBody(nextContent);
  if (!existing.managed) {
    return { ok: true, action: "update", existing, proposed, reasonCodes: [] };
  }

  const reasonCodes = [];
  if (!proposed.complete) {
    reasonCodes.push("canonical_card_body_downgrade_prevented");
  } else if (existing.card.id && normalizeIdentity(existing.card.id) !== normalizeIdentity(proposed.card.id)) {
    reasonCodes.push("canonical_card_identity_conflict", "canonical_card_body_downgrade_prevented");
  } else if (existing.updatedTime !== null && proposed.updatedTime < existing.updatedTime) {
    reasonCodes.push("canonical_card_body_older_than_live", "canonical_card_body_downgrade_prevented");
  } else if (existing.updatedTime !== null && proposed.updatedTime === existing.updatedTime) {
    reasonCodes.push("canonical_card_body_timestamp_conflict", "canonical_card_body_downgrade_prevented");
  }

  return {
    ok: reasonCodes.length === 0,
    action: reasonCodes.length === 0 ? "update" : "blocked",
    existing,
    proposed,
    reasonCodes: [...new Set(reasonCodes)],
  };
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
  return normalizeWhitespace(
    textIntegrity.sliceUtf16Safe(normalized, Math.max(1, maxLength - suffix.length))
  ).replace(/[,:;\-\s]+$/, "") + suffix;
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

function prepareProposedCardWrite({ spec, payload }) {
  const findings = [
    ...textIntegrity.inspectObjectText(spec?.canonicalTitle || "", "$.canonicalTitle"),
    ...textIntegrity.inspectObjectText(payload, "$.payload"),
  ];
  if (findings.length > 0) {
    return {
      ok: false,
      payload,
      findings,
      reasonCodes: [
        "card_proposed_text_integrity_failed",
        ...findings.map((finding) => `card_proposed_text_integrity_failed:${finding.path}`),
      ],
    };
  }
  return {
    ok: true,
    payload: textIntegrity.normalizeObjectNfc(payload),
    findings: [],
    reasonCodes: [],
  };
}

async function readBackExactCardText({
  threadId,
  messageId,
  expectedTitle,
  expectedContent,
  token,
  fetchImpl = fetch,
}) {
  const [thread, starter] = await Promise.all([
    discordRequest({ path: `/channels/${threadId}`, token, fetchImpl }),
    fetchMessage({ channelId: threadId, messageId, token, fetchImpl }),
  ]);
  const actualTitle = String(thread.payload?.name || "");
  const actualContent = String(starter.payload?.content || "");
  const titleExact = thread.ok && actualTitle === expectedTitle;
  const starterExact = starter.ok && actualContent === expectedContent;
  const returnedTextFindings = [
    ...textIntegrity.inspectObjectText(actualTitle, "$.readback.title"),
    ...textIntegrity.inspectObjectText(actualContent, "$.readback.starter"),
  ];
  const reasonCodes = [];
  if (!titleExact) reasonCodes.push("card_thread_title_exact_readback_failed");
  if (!starterExact) reasonCodes.push("card_starter_text_exact_readback_failed");
  if (returnedTextFindings.length > 0) reasonCodes.push("card_text_readback_integrity_failed");
  return {
    ok: reasonCodes.length === 0,
    titleExact,
    starterExact,
    expectedTitle,
    actualTitle,
    expectedTitleCodePoints: textIntegrity.codePointEvidence(expectedTitle),
    actualTitleCodePoints: textIntegrity.codePointEvidence(actualTitle),
    expectedStarterCodePoints: textIntegrity.codePointEvidence(expectedContent),
    actualStarterCodePoints: textIntegrity.codePointEvidence(actualContent),
    findings: returnedTextFindings,
    reasonCodes,
  };
}

async function buildDiscordForumCardUpsertPreflight({
  spec,
  existingThread = null,
  token,
  buildPayload,
  fetchImpl = fetch,
}) {
  const proposedWrite = prepareProposedCardWrite({ spec, payload: buildPayload(spec) });
  const payload = proposedWrite.payload;
  if (!proposedWrite.ok) {
    return {
      ok: false,
      action: "blocked",
      cardId: spec.cardId,
      threadId: existingThread?.id || null,
      messageId: existingThread?.messageId || existingThread?.message?.id || existingThread?.id || null,
      titleChanged: false,
      messageChanged: false,
      reactionChanged: false,
      payload,
      textIntegrity: proposedWrite,
      reasonCodes: proposedWrite.reasonCodes,
    };
  }
  if (!existingThread) {
    return {
      ok: true,
      action: "created",
      cardId: spec.cardId,
      threadId: null,
      messageId: null,
      titleChanged: false,
      messageChanged: true,
      reactionChanged: true,
      payload,
      textIntegrity: proposedWrite,
      reasonCodes: [],
    };
  }

  const threadId = existingThread.id;
  const messageId = existingThread.messageId || existingThread.message?.id || threadId;
  const starter = await fetchMessage({ channelId: threadId, messageId, token, fetchImpl });
  if (!starter.ok) {
    return {
      ok: false,
      action: "blocked",
      cardId: spec.cardId,
      threadId,
      messageId,
      titleChanged: false,
      messageChanged: false,
      reactionChanged: false,
      payload,
      reasonCodes: ["card_starter_message_preflight_read_failed"],
    };
  }

  const messageDecision = evaluateStarterMessageUpdate({
    existingContent: starter.payload?.content,
    proposedContent: payload.message?.content,
  });
  const reaction = spec.requiredReactions[0];
  const titleChanged = normalizeThreadTitle(existingThread.name) !== normalizeThreadTitle(spec.canonicalTitle);
  const reactionChanged = !reactionPresent(summarizeReactions(starter.payload), reaction);
  const changed = titleChanged || messageDecision.action === "update" || reactionChanged;
  return {
    ok: messageDecision.ok,
    action: messageDecision.ok ? (changed ? "updated" : "unchanged") : "blocked",
    cardId: spec.cardId,
    threadId,
    messageId,
    titleChanged,
    messageChanged: messageDecision.action === "update",
    reactionChanged,
    existingMessage: starter.payload,
    messageDecision,
    payload,
    textIntegrity: proposedWrite,
    reasonCodes: messageDecision.reasonCodes,
  };
}

async function upsertDiscordForumCard({
  spec,
  existingThread = null,
  forumChannelId,
  token,
  buildPayload,
  apply = false,
  preflight = null,
  fetchImpl = fetch,
}) {
  if (apply && !preflight) {
    preflight = await buildDiscordForumCardUpsertPreflight({
      spec,
      existingThread,
      token,
      buildPayload,
      fetchImpl,
    });
  }
  const proposedWrite = prepareProposedCardWrite({
    spec,
    payload: preflight?.payload || buildPayload(spec),
  });
  const payload = proposedWrite.payload;
  const reasonCodes = [];
  if (!proposedWrite.ok) {
    return {
      ok: false,
      action: "blocked",
      threadId: existingThread?.id || spec.existingThreadId || null,
      messageId: existingThread?.messageId || spec.existingMessageId || null,
      canonicalTitle: spec.canonicalTitle,
      reactionResult: null,
      textReadback: null,
      httpStatus: null,
      reasonCodes: proposedWrite.reasonCodes,
    };
  }
  if (!apply) {
    return {
      ok: true,
      action: existingThread ? "would_update" : "would_create",
      threadId: existingThread?.id || spec.existingThreadId || null,
      messageId: existingThread?.messageId || spec.existingMessageId || null,
      canonicalTitle: spec.canonicalTitle,
      reactionResult: null,
      textReadback: null,
      httpStatus: null,
      reasonCodes,
    };
  }

  let threadId = existingThread?.id || null;
  let messageId = existingThread?.messageId || existingThread?.message?.id || existingThread?.id || null;
  let action = preflight?.action || "updated";
  let httpStatus = null;

  if (preflight && (
    preflight.cardId !== spec.cardId
    || preflight.threadId !== threadId
    || preflight.messageId !== messageId
  )) {
    return {
      ok: false,
      action: "blocked",
      threadId,
      messageId,
      canonicalTitle: spec.canonicalTitle,
      reactionResult: null,
      textReadback: null,
      httpStatus,
      reasonCodes: ["card_upsert_preflight_identity_mismatch"],
    };
  }
  if (preflight && !preflight.ok) {
    return {
      ok: false,
      action: "blocked",
      threadId,
      messageId,
      canonicalTitle: spec.canonicalTitle,
      reactionResult: null,
      textReadback: null,
      httpStatus,
      reasonCodes: preflight.reasonCodes,
    };
  }

  if (existingThread) {
    const titleChanged = preflight
      ? preflight.titleChanged
      : normalizeThreadTitle(existingThread.name) !== normalizeThreadTitle(spec.canonicalTitle);
    if (titleChanged) {
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
    if (!preflight || preflight.messageChanged) {
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
    ? preflight && !preflight.reactionChanged
      ? {
        ok: true,
        status: "already_present",
        reactionTarget: { channelId: threadId, messageId },
        emoji: formatReactionEmoji(reaction),
        beforeHttpStatus: 200,
        addHttpStatus: null,
        afterHttpStatus: 200,
        alreadyPresent: true,
        presentAfter: true,
        reasonCodes: [],
      }
      : await ensureRequiredReaction({
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

  const textReadback = threadId && messageId
    ? await readBackExactCardText({
      threadId,
      messageId,
      expectedTitle: String(payload.name || spec.canonicalTitle || ""),
      expectedContent: String(payload.message?.content || ""),
      token,
      fetchImpl,
    })
    : {
      ok: false,
      titleExact: false,
      starterExact: false,
      reasonCodes: ["card_text_exact_readback_not_attempted"],
    };
  reasonCodes.push(...textReadback.reasonCodes);

  return {
    ok: reasonCodes.length === 0,
    action,
    threadId,
    messageId,
    canonicalTitle: spec.canonicalTitle,
    reactionResult,
    textReadback,
    httpStatus,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

module.exports = {
  _internals: {
    DISCORD_API_BASE,
    DISCORD_THREAD_TITLE_MAX_LENGTH,
    DEFAULT_AUTO_ARCHIVE_DURATION,
    CANONICAL_CARD_START,
    CANONICAL_CARD_END,
    STATUS_REACTIONS,
    hasText,
    normalizeWhitespace,
    normalizeIdentity,
    parseCanonicalCardBody,
    inspectCanonicalCardBody,
    evaluateStarterMessageUpdate,
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
    prepareProposedCardWrite,
    readBackExactCardText,
    buildDiscordForumCardUpsertPreflight,
    upsertDiscordForumCard,
  },
};
