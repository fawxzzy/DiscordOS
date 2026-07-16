const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");
const {
  _internals: journal,
} = require("./discordos-board-card-journal");

const TRANSFER_ENV = "DISCORDOS_BOARD_COMPLETED_TRANSFER";
const TRANSFER_ENV_VALUE = "enabled";
const DEFAULT_COMPLETED_FORUM_CHANNEL_ID = "1508359985602625638";
const MAX_MESSAGE_LENGTH = 2000;

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(code);
  }
  return value.trim();
}

function parseArgs(args) {
  const options = {
    json: false,
    sourceThreadId: null,
    sourceForumChannelId: null,
    completedForumChannelId: DEFAULT_COMPLETED_FORUM_CHANNEL_ID,
    cardId: null,
    project: null,
    type: "feature",
    priority: "Unspecified",
    owner: "Unassigned",
    eventId: null,
    evidence: null,
    allowApply: false,
    apply: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--source-thread-id") {
      options.sourceThreadId = readValue(args, index, "missing_source_thread_id");
      index += 1;
    } else if (arg === "--source-forum-channel-id") {
      options.sourceForumChannelId = readValue(args, index, "missing_source_forum_channel_id");
      index += 1;
    } else if (arg === "--completed-forum-channel-id") {
      options.completedForumChannelId = readValue(args, index, "missing_completed_forum_channel_id");
      index += 1;
    } else if (arg === "--card-id") {
      options.cardId = readValue(args, index, "missing_card_id");
      index += 1;
    } else if (arg === "--project") {
      options.project = readValue(args, index, "missing_project");
      index += 1;
    } else if (arg === "--type") {
      options.type = readValue(args, index, "missing_type");
      index += 1;
    } else if (arg === "--priority") {
      options.priority = readValue(args, index, "missing_priority");
      index += 1;
    } else if (arg === "--owner") {
      options.owner = readValue(args, index, "missing_owner");
      index += 1;
    } else if (arg === "--event-id") {
      options.eventId = readValue(args, index, "missing_event_id");
      index += 1;
    } else if (arg === "--evidence") {
      options.evidence = readValue(args, index, "missing_evidence");
      index += 1;
    } else if (arg === "--allow-apply") options.allowApply = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  return options;
}

function resolveAdmission({ allowApply, env }) {
  const envEnabled = env?.[TRANSFER_ENV] === TRANSFER_ENV_VALUE;
  if (!allowApply && !envEnabled) {
    return { requested: false, admitted: false, status: "transfer_guard_not_requested", reasonCodes: [] };
  }
  if (allowApply && envEnabled) {
    return { requested: true, admitted: true, status: "transfer_admitted", reasonCodes: [] };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["board_completed_transfer_double_guard_missing"],
  };
}

function validateInput(options) {
  const reasonCodes = [];
  if (!options.sourceThreadId) reasonCodes.push("source_thread_id_missing");
  if (!options.sourceForumChannelId) reasonCodes.push("source_forum_channel_id_missing");
  if (!options.completedForumChannelId) reasonCodes.push("completed_forum_channel_id_missing");
  if (!options.cardId) reasonCodes.push("card_id_missing");
  if (!options.evidence) reasonCodes.push("completion_evidence_missing");
  if (
    options.sourceContentPreimage != null
    && (typeof options.sourceTitlePreimage !== "string" || options.sourceTitlePreimage.length === 0)
  ) reasonCodes.push("source_title_preimage_missing");
  if (options.destinationStatePreimage != null && (
    typeof options.destinationStatePreimage !== "object"
    || typeof options.destinationStatePreimage.archived !== "boolean"
    || typeof options.destinationStatePreimage.locked !== "boolean"
    || (
      options.destinationStatePreimage.threadId != null
      && (typeof options.destinationStatePreimage.threadId !== "string" || options.destinationStatePreimage.threadId.length === 0)
    )
  )) reasonCodes.push("destination_state_preimage_invalid");
  if (options.sourceForumChannelId === options.completedForumChannelId) {
    reasonCodes.push("source_and_completed_forum_must_differ");
  }
  return [...new Set(reasonCodes)];
}

function cardMarker(cardId) {
  return `ATLAS-CARD-ID: \`${cardId}\``;
}

function sameUniqueSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && new Set(left).size === left.length
    && new Set(right).size === right.length
    && left.length === right.length
    && left.every((value) => right.includes(value));
}

function inferProject(sourceForumChannelId, explicitProject = null) {
  if (explicitProject) return explicitProject;
  if (sourceForumChannelId === "1508144612957622313") return "Fitness";
  if (sourceForumChannelId === "1524889569475170478") return "Mazer";
  return "Unspecified";
}

function discordThreadUrl(guildId, threadId) {
  return `https://discord.com/channels/${guildId}/${threadId}`;
}

function truncateForSuffix(value, suffix) {
  const text = String(value || "").trim();
  const available = Math.max(0, MAX_MESSAGE_LENGTH - suffix.length - 2);
  return text.length <= available ? text : `${text.slice(0, Math.max(0, available - 3)).trimEnd()}...`;
}

function buildCompletedEvent({
  cardId,
  project,
  sourceForumChannelId,
  title,
  type = "feature",
  priority = "Unspecified",
  owner = "Unassigned",
  evidence,
  sourceUrl,
  destinationUrl = null,
  eventId = null,
  occurredAt = null,
}) {
  return journal.normalizeEvent({
    schemaVersion: "atlas.board-card-journal.v1",
    eventId: eventId || `completed:${cardId}`,
    occurredAt: occurredAt || new Date().toISOString(),
    actor: "discordos.completed-transfer",
    card: {
      id: cardId,
      project: inferProject(sourceForumChannelId, project),
      sourceForumChannelId,
      title,
      type,
      state: "completed",
      priority,
      owner,
      progress: "100%",
      summary: "Proof-complete work was transferred to the shared Completed board.",
      objective: "Preserve completion evidence and source-card provenance.",
      acceptanceCriteria: ["Completion evidence is present", "Source and Completed cards are linked", "Both surfaces pass live readback"],
      discoveries: [],
      nextActions: ["Retain for review and historical reference"],
      blockers: [],
      evidence: [evidence, `original card: ${sourceUrl}`, destinationUrl ? `completed card: ${destinationUrl}` : null].filter(Boolean),
    },
    entry: {
      kind: "completed",
      headline: "Completion transferred",
      completed: ["Moved proof-complete work into the shared Completed board"],
      discovered: [],
      next: ["Review the linked source and completion evidence as needed"],
      blockers: [],
      evidence: [evidence, `original card: ${sourceUrl}`],
    },
    correlation: {},
  });
}

function buildCompletedMessage(options) {
  const event = buildCompletedEvent(options);
  return journal.buildCanonicalBody(event, options.sourceContent);
}

function buildSourceMessage({ sourceContent, destinationUrl, cardId }) {
  const marker = `ATLAS-COMPLETED-CARD: ${destinationUrl}`;
  const value = String(sourceContent || "").trim();
  if (value.includes(marker) && (!value.includes(journal.CARD_START) || value.includes(journal.CARD_END))) return value;
  const completion = `\n\n## Archived completion\n- card id: \`${cardId}\`\n- completed card: ${destinationUrl}\n${marker}`;
  if (value.includes(journal.CARD_START)) {
    const end = value.indexOf(journal.CARD_END);
    const managed = (end >= 0 ? value.slice(0, end) : value)
      .replace(/\n+## Archived completion[\s\S]*$/i, "")
      .trimEnd();
    const suffix = `${completion}\n${journal.CARD_END}`;
    return `${truncateForSuffix(managed, suffix)}${suffix}`.slice(0, MAX_MESSAGE_LENGTH);
  }
  return `${truncateForSuffix(value, completion)}${completion}`.slice(0, MAX_MESSAGE_LENGTH);
}

async function listForumThreads({ forumChannelId, guildId, token, fetchImpl = fetch }) {
  const [active, archived] = await Promise.all([
    cardContract.discordRequest({ path: `/guilds/${guildId}/threads/active`, token, fetchImpl }),
    journal.readArchivedForumThreads({ forumChannelId, token, fetchImpl }),
  ]);
  const reasonCodes = [];
  if (!active.ok) reasonCodes.push("completed_active_threads_read_failed");
  if (!archived.ok) reasonCodes.push("completed_archived_threads_read_failed");
  for (const code of archived.reasonCodes || []) {
    if (code === "archived_threads_pagination_cursor_missing") {
      reasonCodes.push("completed_archived_threads_pagination_cursor_missing");
    } else if (code === "archived_threads_read_truncated") {
      reasonCodes.push("completed_archived_threads_pagination_limit");
    }
  }
  const seen = new Set();
  const threads = [
    ...(active.payload?.threads || []).filter((thread) => thread.parent_id === forumChannelId),
    ...(archived.threads || []),
  ].filter((thread) => thread?.id && !seen.has(thread.id) && seen.add(thread.id));
  return {
    ok: reasonCodes.length === 0,
    threads,
    archivedPageCount: archived.pageCount,
    truncated: archived.truncated === true,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

async function readAllThreadMessages({ threadId, token, fetchImpl = fetch }) {
  const result = await journal.readThreadMessages({ threadId, token, fetchImpl });
  const reasonCodes = [];
  if (!result.ok) reasonCodes.push("completed_card_journal_history_read_failed");
  if (result.truncated) reasonCodes.push("completed_card_journal_history_pagination_limit");
  return {
    ok: result.ok && reasonCodes.length === 0,
    messages: result.payload || [],
    pageCount: result.pageCount,
    truncated: result.truncated === true,
    reasonCodes,
  };
}

function classifyJournalHistory({ messages, eventId, expectedContent, exactPostimageMode }) {
  const marker = journal.eventMarker(eventId);
  const matches = (messages || []).filter((message) => String(message?.content || "").includes(marker));
  if (matches.length > 1) {
    return {
      ok: false,
      action: "blocked",
      messageId: null,
      reasonCodes: ["completed_card_journal_event_duplicate"],
    };
  }
  if (matches.length === 0) {
    return { ok: true, action: "create", messageId: null, reasonCodes: [] };
  }
  const match = matches[0];
  if (!exactPostimageMode || String(match.content || "") === expectedContent) {
    return { ok: true, action: "reuse", messageId: match.id, reasonCodes: [] };
  }
  return { ok: true, action: "update", messageId: match.id, reasonCodes: [] };
}

async function findCompletedThread({ threads, cardId, expectedTitle, token, fetchImpl = fetch }) {
  const stableMatches = [];
  const titleMatches = [];
  const unreadableStarterThreadIds = [];
  for (const thread of threads) {
    const message = await cardContract.fetchMessage({
      channelId: thread.id,
      messageId: thread.id,
      token,
      fetchImpl,
    });
    if (!message.ok) {
      unreadableStarterThreadIds.push(thread.id);
      continue;
    }
    if (String(message.payload?.content || "").includes(cardMarker(cardId))) {
      stableMatches.push({ thread, message: message.payload });
      continue;
    }
    if (cardContract.normalizeThreadTitle(thread.name) === cardContract.normalizeThreadTitle(expectedTitle)) {
      titleMatches.push({ thread, message: message.payload });
    }
  }
  if (unreadableStarterThreadIds.length > 0) {
    return {
      readFailed: true,
      matchedBy: "unreadable_starter",
      candidateThreadIds: unreadableStarterThreadIds,
    };
  }
  if (stableMatches.length === 1) return { ...stableMatches[0], matchedBy: "stable_card_id" };
  if (stableMatches.length > 1) {
    return {
      ambiguous: true,
      matchedBy: "ambiguous_stable_card_id",
      candidateThreadIds: stableMatches.map(({ thread }) => thread.id),
    };
  }
  if (titleMatches.length === 1) {
    return { ...titleMatches[0], matchedBy: "unique_legacy_title" };
  }
  if (titleMatches.length > 1) {
    return {
      ambiguous: true,
      matchedBy: "ambiguous_legacy_title",
      candidateThreadIds: titleMatches.map(({ thread }) => thread.id),
    };
  }
  return null;
}

async function setThreadArchiveState({ threadId, token, archived, locked, fetchImpl = fetch }) {
  return cardContract.discordRequest({
    path: `/channels/${threadId}`,
    token,
    method: "PATCH",
    body: { archived, locked },
    fetchImpl,
  });
}

async function buildCompletedBoardTransfer({
  sourceThreadId,
  sourceForumChannelId,
  completedForumChannelId = DEFAULT_COMPLETED_FORUM_CHANNEL_ID,
  cardId,
  project = null,
  type = "feature",
  priority = "Unspecified",
  owner = "Unassigned",
  eventId = null,
  occurredAt = null,
  completedTagIds = null,
  requireStableIdentity = false,
  sourceContentPreimage = null,
  sourceTitlePreimage = null,
  destinationStatePreimage = null,
  repairExactPostimage = false,
  evidence,
  allowApply = false,
  apply = false,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  let writeCount = 0;
  let writeOutcomeUnknownCount = 0;
  const reasonCodes = [];
  const rawFetchImpl = fetchImpl;
  fetchImpl = async (url, init = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    try {
      const response = await rawFetchImpl(url, init);
      if (response?.ok === true && !["GET", "HEAD"].includes(method)) writeCount += 1;
      return response;
    } catch {
      const readOnly = ["GET", "HEAD"].includes(method);
      if (!readOnly) writeOutcomeUnknownCount += 1;
      reasonCodes.push(readOnly ? "discord_read_transport_rejected" : "discord_write_outcome_unknown");
      return {
        ok: false,
        status: 0,
        json: async () => ({ code: "discord_transport_rejected" }),
      };
    }
  };
  const options = {
    sourceThreadId,
    sourceForumChannelId,
    completedForumChannelId,
    cardId,
    project,
    type,
    priority,
    owner,
    eventId,
    occurredAt,
    completedTagIds,
    requireStableIdentity,
    sourceContentPreimage,
    sourceTitlePreimage,
    destinationStatePreimage,
    repairExactPostimage,
    evidence,
  };
  const resumableCompletedState = () => (
    destinationStatePreimage
    && typeof destinationStatePreimage.threadId === "string"
    && destinationStatePreimage.threadId.length > 0
    && typeof destinationStatePreimage.archived === "boolean"
    && typeof destinationStatePreimage.locked === "boolean"
      ? {
        forumChannelId: completedForumChannelId,
        threadId: destinationStatePreimage.threadId,
        archiveState: {
          expected: {
            archived: destinationStatePreimage.archived,
            locked: destinationStatePreimage.locked,
          },
        },
      }
      : null
  );
  const admission = resolveAdmission({ allowApply, env });
  const resolvedOccurredAt = occurredAt || new Date().toISOString();
  reasonCodes.push(
    ...validateInput(options),
    ...(apply ? admission.reasonCodes : []),
  );
  const token = String(env?.DISCORDOS_BOT_TOKEN || "").trim();
  if (!token) reasonCodes.push("discord_bot_token_missing");
  if (apply && !admission.admitted) reasonCodes.push("board_completed_transfer_not_admitted");
  if (reasonCodes.length > 0) {
    return {
      ok: false,
      status: "blocked",
      apply,
      admission,
      cardId: cardId || null,
      completed: resumableCompletedState(),
      reasonCodes: [...new Set(reasonCodes)],
      writeCount,
      writeOutcomeUnknownCount,
    };
  }

  const [sourceThread, sourceMessage] = await Promise.all([
    cardContract.discordRequest({ path: `/channels/${sourceThreadId}`, token, fetchImpl }),
    cardContract.fetchMessage({ channelId: sourceThreadId, messageId: sourceThreadId, token, fetchImpl }),
  ]);
  if (!sourceThread.ok || !sourceMessage.ok) reasonCodes.push("source_card_read_failed");
  if (sourceThread.payload?.parent_id !== sourceForumChannelId) reasonCodes.push("source_forum_mismatch");
  const exactPostimageMode = sourceContentPreimage != null;
  const plannedSourceTitle = exactPostimageMode
    ? String(sourceTitlePreimage || "")
    : String(sourceThread.payload?.name || "");
  if (exactPostimageMode && sourceThread.payload?.name !== plannedSourceTitle) {
    reasonCodes.push("source_card_planned_title_mismatch");
  }
  const guildId = sourceThread.payload?.guild_id || null;
  if (!guildId) reasonCodes.push("source_guild_id_missing");
  if (reasonCodes.length > 0) {
    return {
      ok: false,
      status: "blocked",
      apply,
      admission,
      cardId,
      completed: resumableCompletedState(),
      reasonCodes: [...new Set(reasonCodes)],
      writeCount,
      writeOutcomeUnknownCount,
    };
  }

  const destinationThreads = await listForumThreads({
    forumChannelId: completedForumChannelId,
    guildId,
    token,
    fetchImpl,
  });
  reasonCodes.push(...destinationThreads.reasonCodes);
  const existing = destinationThreads.ok
    ? await findCompletedThread({
      threads: destinationThreads.threads,
      cardId,
      expectedTitle: plannedSourceTitle,
      token,
      fetchImpl,
    })
    : null;
  if (existing?.readFailed) reasonCodes.push("completed_card_starter_read_failed");
  if (existing?.ambiguous) reasonCodes.push("completed_card_identity_ambiguous");
  if (requireStableIdentity && existing && !existing.readFailed && existing.matchedBy !== "stable_card_id") {
    reasonCodes.push("completed_card_stable_identity_required");
  }
  if (completedTagIds != null && (
    !Array.isArray(completedTagIds)
    || completedTagIds.length !== 2
    || new Set(completedTagIds).size !== completedTagIds.length
    || completedTagIds.some((value) => typeof value !== "string" || value.length === 0)
  )) reasonCodes.push("completed_card_tag_ids_invalid");
  const sourceUrl = discordThreadUrl(guildId, sourceThreadId);
  const plannedSourceContent = sourceContentPreimage == null
    ? String(sourceMessage.payload?.content || "")
    : String(sourceContentPreimage);
  const preview = {
    sourceThreadId,
    sourceForumChannelId,
    completedForumChannelId,
    existingCompletedThreadId: existing?.thread?.id || null,
    matchedBy: existing?.matchedBy || null,
    ambiguousCandidateThreadIds: existing?.candidateThreadIds || [],
    action: existing ? "reuse_completed_card" : "create_completed_card",
  };
  if (!apply) {
    return {
      ok: reasonCodes.length === 0,
      status: reasonCodes.length === 0 ? "dry_run" : "blocked",
      apply,
      admission,
      cardId,
      preview,
      completed: resumableCompletedState(),
      reasonCodes: [...new Set(reasonCodes)],
      writeCount,
      writeOutcomeUnknownCount,
    };
  }
  if (reasonCodes.length > 0) {
    return {
      ok: false,
      status: "blocked",
      apply,
      admission,
      cardId,
      preview,
      completed: resumableCompletedState(),
      reasonCodes: [...new Set(reasonCodes)],
      writeCount,
      writeOutcomeUnknownCount,
    };
  }

  const destinationThreadId = existing?.thread?.id || null;
  const destinationUrl = destinationThreadId ? discordThreadUrl(guildId, destinationThreadId) : null;
  const expectedSourcePostimage = destinationUrl
    ? buildSourceMessage({ sourceContent: plannedSourceContent, destinationUrl, cardId })
    : null;
  const sourceThreadArchived = sourceThread.payload?.thread_metadata?.archived === true;
  const sourceThreadLocked = sourceThread.payload?.thread_metadata?.locked === true;
  const plannedSourcePreimageExact = String(sourceMessage.payload?.content || "") === plannedSourceContent
    && sourceThread.payload?.thread_metadata?.archived === false
    && sourceThread.payload?.thread_metadata?.locked !== true;
  const plannedSourcePostimageExact = Boolean(expectedSourcePostimage)
    && String(sourceMessage.payload?.content || "") === expectedSourcePostimage
    && sourceThreadArchived
    && sourceThreadLocked;
  const plannedSourceLinkWrittenOpenExact = Boolean(expectedSourcePostimage)
    && String(sourceMessage.payload?.content || "") === expectedSourcePostimage
    && sourceThread.payload?.thread_metadata?.archived === false
    && sourceThread.payload?.thread_metadata?.locked !== true;
  if (
    sourceContentPreimage != null
    && !plannedSourcePreimageExact
    && !plannedSourceLinkWrittenOpenExact
    && !plannedSourcePostimageExact
  ) {
    reasonCodes.push("source_card_planned_preimage_mismatch");
  }
  if (reasonCodes.length > 0) {
    return {
      ok: false,
      status: "blocked",
      apply,
      admission,
      cardId,
      preview,
      completed: resumableCompletedState(),
      reasonCodes: [...new Set(reasonCodes)],
      writeCount,
      writeOutcomeUnknownCount,
    };
  }
  const expectedDestinationContent = !exactPostimageMode && existing?.matchedBy === "stable_card_id"
    ? String(existing.message?.content || "")
    : buildCompletedMessage({
      cardId,
      project,
      sourceForumChannelId,
      title: plannedSourceTitle,
      type,
      priority,
      owner,
      eventId,
      occurredAt: resolvedOccurredAt,
      sourceContent: plannedSourceContent,
      sourceUrl,
      destinationUrl: null,
      evidence,
    });
  const spec = {
    cardId,
    stableIdentity: cardContract.normalizeIdentity(cardId),
    canonicalTitle: plannedSourceTitle,
    proposedTitle: plannedSourceTitle,
    requiredReactions: [{ status: "success", ...cardContract.STATUS_REACTIONS.success }],
  };
  const existingThreadForUpsert = existing ? {
    id: existing.thread.id,
    name: existing.thread.name,
    messageId: existing.thread.id,
  } : null;
  const buildDestinationPayload = () => ({
    name: plannedSourceTitle,
    auto_archive_duration: cardContract.DEFAULT_AUTO_ARCHIVE_DURATION,
    message: {
      content: expectedDestinationContent,
      allowed_mentions: { parse: [] },
    },
    ...(completedTagIds ? { applied_tags: completedTagIds } : {}),
  });
  const upsertPreflight = await cardContract.buildDiscordForumCardUpsertPreflight({
    spec,
    existingThread: existingThreadForUpsert,
    token,
    buildPayload: buildDestinationPayload,
    fetchImpl,
  });
  const planRepairableBodyReasons = new Set([
    "canonical_card_body_timestamp_conflict",
    "canonical_card_body_downgrade_prevented",
  ]);
  if (
    exactPostimageMode
    && existing
    && upsertPreflight.existingMessage
    && String(upsertPreflight.existingMessage.content || "") !== expectedDestinationContent
    && upsertPreflight.textIntegrity?.ok
    && upsertPreflight.reasonCodes.every((code) => planRepairableBodyReasons.has(code))
  ) {
    upsertPreflight.ok = true;
    upsertPreflight.action = "updated";
    upsertPreflight.messageChanged = true;
    upsertPreflight.reasonCodes = [];
  }
  if (exactPostimageMode && existing && existing.thread.name !== plannedSourceTitle && upsertPreflight.ok) {
    upsertPreflight.titleChanged = true;
    upsertPreflight.action = "updated";
  }
  reasonCodes.push(...upsertPreflight.reasonCodes);

  if (destinationStatePreimage && !existing) reasonCodes.push("completed_card_destination_state_preimage_without_destination");
  if (
    destinationStatePreimage?.threadId
    && existing
    && existing.thread.id !== destinationStatePreimage.threadId
  ) reasonCodes.push("completed_card_destination_state_thread_mismatch");
  const destinationLiveState = existing ? {
    archived: existing.thread?.thread_metadata?.archived === true,
    locked: existing.thread?.thread_metadata?.locked === true,
  } : null;
  const destinationOriginalState = existing
    ? destinationStatePreimage || destinationLiveState
    : null;
  const destinationStateRestorationPending = Boolean(
    existing
    && destinationStatePreimage
    && (
      destinationLiveState.archived !== destinationOriginalState.archived
      || destinationLiveState.locked !== destinationOriginalState.locked
    )
  );
  if (
    destinationStateRestorationPending
    && !(
      destinationLiveState.archived === false
      && destinationLiveState.locked === false
      && (destinationOriginalState.archived || destinationOriginalState.locked)
    )
  ) reasonCodes.push("completed_card_destination_state_preimage_mismatch");
  const prewriteCompletionEvent = destinationUrl ? buildCompletedEvent({
    cardId,
    project,
    sourceForumChannelId,
    title: plannedSourceTitle,
    type,
    priority,
    owner,
    evidence,
    sourceUrl,
    destinationUrl,
    eventId,
    occurredAt: resolvedOccurredAt,
  }) : null;
  const prewriteCompletionJournal = prewriteCompletionEvent
    ? journal.buildJournalMessage(prewriteCompletionEvent)
    : null;
  let prewriteJournalPlan = null;
  if (existing && reasonCodes.length === 0) {
    const history = await readAllThreadMessages({ threadId: existing.thread.id, token, fetchImpl });
    reasonCodes.push(...history.reasonCodes);
    if (history.ok) {
      prewriteJournalPlan = classifyJournalHistory({
        messages: history.messages,
        eventId: prewriteCompletionEvent.eventId,
        expectedContent: prewriteCompletionJournal,
        exactPostimageMode,
      });
      reasonCodes.push(...prewriteJournalPlan.reasonCodes);
    }
  }
  if (reasonCodes.length > 0) {
    return {
      ok: false,
      status: "blocked",
      apply,
      admission,
      cardId,
      preview,
      completed: resumableCompletedState(),
      reasonCodes: [...new Set(reasonCodes)],
      writeCount,
      writeOutcomeUnknownCount,
    };
  }

  const destinationTagMutationNeeded = Boolean(
    existing
    && completedTagIds
    && !sameUniqueSet(existing.thread?.applied_tags || [], completedTagIds)
  );
  const destinationMutationNeeded = !existing
    || upsertPreflight.action === "updated"
    || destinationTagMutationNeeded
    || ["create", "update"].includes(prewriteJournalPlan?.action);
  if (
    exactPostimageMode
    && existing
    && !destinationStatePreimage
    && destinationLiveState.archived === false
    && destinationLiveState.locked === false
    && destinationMutationNeeded
  ) reasonCodes.push("completed_card_destination_archive_preimage_unknown");
  if (reasonCodes.length > 0) {
    return {
      ok: false,
      status: "blocked",
      apply,
      admission,
      cardId,
      preview,
      completed: resumableCompletedState(),
      reasonCodes: [...new Set(reasonCodes)],
      writeCount,
      writeOutcomeUnknownCount,
    };
  }
  let destinationReopened = destinationStateRestorationPending;
  let destinationRestored = false;
  let destinationReopen = null;
  let destinationRestore = null;
  const restoreDestinationState = async () => {
    if (!destinationReopened || destinationRestored) return;
    destinationRestore = await setThreadArchiveState({
      threadId: existing.thread.id,
      token,
      archived: destinationOriginalState.archived,
      locked: destinationOriginalState.locked,
      fetchImpl,
    });
    destinationRestored = destinationRestore.ok;
  };
  if (
    existing
    && destinationMutationNeeded
    && (destinationOriginalState.archived || destinationOriginalState.locked)
  ) {
    destinationReopen = await setThreadArchiveState({
      threadId: existing.thread.id,
      token,
      archived: false,
      locked: false,
      fetchImpl,
    });
    destinationReopened = destinationReopen.ok;
    if (!destinationReopen.ok) reasonCodes.push("completed_card_reopen_failed");
  }
  if (reasonCodes.length > 0) {
    return {
      ok: false,
      status: "blocked",
      apply,
      admission,
      cardId,
      preview,
      completed: resumableCompletedState(),
      reasonCodes: [...new Set(reasonCodes)],
      writeCount,
      writeOutcomeUnknownCount,
    };
  }
  const upsert = await cardContract.upsertDiscordForumCard({
    spec,
    existingThread: existingThreadForUpsert,
    forumChannelId: completedForumChannelId,
    token,
    apply: true,
    preflight: upsertPreflight,
    deferRequiredReaction: true,
    buildPayload: buildDestinationPayload,
    fetchImpl,
  });
  reasonCodes.push(...upsert.reasonCodes);
  if (
    exactPostimageMode
    && upsertPreflight.messageChanged
    && upsert.reasonCodes.includes("card_thread_message_update_failed")
  ) reasonCodes.push("completed_card_exact_body_repair_failed");
  const finalDestinationId = upsert.threadId;
  const finalDestinationUrl = finalDestinationId ? discordThreadUrl(guildId, finalDestinationId) : null;
  const completionEvent = buildCompletedEvent({
    cardId,
    project,
    sourceForumChannelId,
    title: plannedSourceTitle,
    type,
    priority,
    owner,
    evidence,
    sourceUrl,
    destinationUrl: finalDestinationUrl,
    eventId,
    occurredAt: resolvedOccurredAt,
  });
  const completionJournal = journal.buildJournalMessage(completionEvent);
  let journalAction = "not_attempted";
  let journalMessageId = null;
  if (reasonCodes.length === 0 && upsert.ok && finalDestinationId) {
    let journalPlan = prewriteJournalPlan;
    if (!journalPlan) {
      const history = await readAllThreadMessages({ threadId: finalDestinationId, token, fetchImpl });
      reasonCodes.push(...history.reasonCodes);
      if (history.ok) {
        journalPlan = classifyJournalHistory({
          messages: history.messages,
          eventId: completionEvent.eventId,
          expectedContent: completionJournal,
          exactPostimageMode,
        });
        reasonCodes.push(...journalPlan.reasonCodes);
      }
    }
    if (reasonCodes.length === 0 && journalPlan?.action === "reuse") {
      journalAction = "reused";
      journalMessageId = journalPlan.messageId;
    } else if (reasonCodes.length === 0 && journalPlan?.action === "update") {
      const updated = await cardContract.discordRequest({
        path: `/channels/${finalDestinationId}/messages/${journalPlan.messageId}`,
        token,
        method: "PATCH",
        body: { content: completionJournal, allowed_mentions: { parse: [] } },
        fetchImpl,
      });
      if (!updated.ok) reasonCodes.push("completed_card_journal_update_failed");
      else {
        journalAction = "updated";
        journalMessageId = journalPlan.messageId;
      }
    } else if (reasonCodes.length === 0 && journalPlan?.action === "create") {
      const posted = await cardContract.discordRequest({
        path: `/channels/${finalDestinationId}/messages`,
        token,
        method: "POST",
        body: { content: completionJournal, allowed_mentions: { parse: [] } },
        fetchImpl,
      });
      if (!posted.ok || !posted.payload?.id) reasonCodes.push("completed_card_journal_create_failed");
      else {
        journalAction = "created";
        journalMessageId = posted.payload.id;
      }
    }
  }
  let destinationReaction = upsert.reactionResult;
  if (reasonCodes.length === 0 && upsert.ok && finalDestinationId && upsert.messageId) {
    destinationReaction = await cardContract.ensureRequiredReaction({
      channelId: finalDestinationId,
      messageId: upsert.messageId,
      token,
      emoji: spec.requiredReactions[0],
      fetchImpl,
    });
    reasonCodes.push(...destinationReaction.reasonCodes);
  }
  let destinationTagUpdate = null;
  if (reasonCodes.length === 0 && upsert.ok && finalDestinationId && completedTagIds) {
    const currentTags = existing?.thread?.applied_tags || [];
    if (upsert.action === "created" || sameUniqueSet(currentTags, completedTagIds)) {
      destinationTagUpdate = { ok: true, status: null, action: upsert.action === "created" ? "created_with_tags" : "already_exact" };
    } else {
      destinationTagUpdate = await cardContract.discordRequest({
        path: `/channels/${finalDestinationId}`,
        token,
        method: "PATCH",
        body: { applied_tags: completedTagIds },
        fetchImpl,
      });
      destinationTagUpdate.action = destinationTagUpdate.ok ? "updated" : "blocked";
      if (!destinationTagUpdate.ok) reasonCodes.push("completed_card_tag_update_failed");
    }
  }
  await restoreDestinationState();
  if (!destinationRestored) await restoreDestinationState();
  if (destinationReopened && !destinationRestored) reasonCodes.push("completed_card_restore_state_failed");
  let destinationReadback = null;
  if (upsert.ok && finalDestinationId && journalMessageId) {
    const [threadRead, messageRead, journalRead] = await Promise.all([
      cardContract.discordRequest({ path: `/channels/${finalDestinationId}`, token, fetchImpl }),
      cardContract.fetchMessage({
        channelId: finalDestinationId,
        messageId: upsert.messageId || finalDestinationId,
        token,
        fetchImpl,
      }),
      cardContract.fetchMessage({
        channelId: finalDestinationId,
        messageId: journalMessageId,
        token,
        fetchImpl,
      }),
    ]);
    const content = String(messageRead.payload?.content || "");
    const journalContent = String(journalRead.payload?.content || "");
    const destinationArchived = threadRead.payload?.thread_metadata?.archived === true;
    const destinationLocked = threadRead.payload?.thread_metadata?.locked === true;
    destinationReadback = {
      threadRead: threadRead.ok,
      messageRead: messageRead.ok,
      parentMatches: threadRead.payload?.parent_id === completedForumChannelId,
      cardMarkerPresent: content.includes(cardMarker(cardId)),
      canonicalBodyPresent: content.includes(journal.CARD_START) && content.includes(journal.CARD_END),
      completedStatePresent: content.includes("- state: `completed`"),
      sourceLinkPresent: content.includes(sourceUrl),
      appliedTagsExact: !completedTagIds || (
        Array.isArray(threadRead.payload?.applied_tags)
        && sameUniqueSet(threadRead.payload.applied_tags, completedTagIds)
      ),
      journalRead: journalRead.ok,
      journalMarkerPresent: journalContent.includes(journal.eventMarker(completionEvent.eventId)),
      bodyExact: !exactPostimageMode || content === expectedDestinationContent,
      journalExact: !exactPostimageMode || journalContent === completionJournal,
      archiveStateExact: !existing || (
        destinationArchived === destinationOriginalState.archived
        && destinationLocked === destinationOriginalState.locked
      ),
    };
    if (!Object.values(destinationReadback).every(Boolean)) reasonCodes.push("completed_card_readback_failed");
  }

  let sourceUpdate = null;
  let sourceArchive = null;
  let sourceReadback = null;
  if (reasonCodes.length === 0 && finalDestinationUrl) {
    const expectedSourceContent = buildSourceMessage({
      sourceContent: plannedSourceContent,
      destinationUrl: finalDestinationUrl,
      cardId,
    });
    const wasArchived = sourceThread.payload?.thread_metadata?.archived === true;
    const wasLocked = sourceThread.payload?.thread_metadata?.locked === true;
    const sourceContentAlreadyExact = String(sourceMessage.payload?.content || "") === expectedSourceContent;
    if (!sourceContentAlreadyExact && (wasArchived || wasLocked)) {
      const reopened = await setThreadArchiveState({
        threadId: sourceThreadId,
        token,
        archived: false,
        locked: false,
        fetchImpl,
      });
      if (!reopened.ok) reasonCodes.push("source_card_reopen_failed");
    }
    if (reasonCodes.length === 0 && !sourceContentAlreadyExact) {
      sourceUpdate = await cardContract.updateThreadMessage({
        threadId: sourceThreadId,
        messageId: sourceThreadId,
        token,
        message: {
          content: buildSourceMessage({
            sourceContent: plannedSourceContent,
            destinationUrl: finalDestinationUrl,
            cardId,
          }),
          allowed_mentions: { parse: [] },
        },
        fetchImpl,
      });
      if (!sourceUpdate.ok) reasonCodes.push("source_card_link_update_failed");
    }
    if (reasonCodes.length === 0 && (!sourceContentAlreadyExact || !wasArchived || !wasLocked)) {
      sourceArchive = await setThreadArchiveState({
        threadId: sourceThreadId,
        token,
        archived: true,
        locked: true,
        fetchImpl,
      });
      if (!sourceArchive.ok) reasonCodes.push("source_card_archive_failed");
    }
    if (reasonCodes.length === 0) {
      const [threadRead, messageRead] = await Promise.all([
        cardContract.discordRequest({ path: `/channels/${sourceThreadId}`, token, fetchImpl }),
        cardContract.fetchMessage({ channelId: sourceThreadId, messageId: sourceThreadId, token, fetchImpl }),
      ]);
      const content = String(messageRead.payload?.content || "");
      sourceReadback = {
        threadRead: threadRead.ok,
        messageRead: messageRead.ok,
        archived: threadRead.payload?.thread_metadata?.archived === true,
        locked: threadRead.payload?.thread_metadata?.locked === true,
        completedLinkPresent: content.includes(finalDestinationUrl),
        postimageExact: content === expectedSourceContent,
      };
      if (!Object.values(sourceReadback).every(Boolean)) reasonCodes.push("source_card_readback_failed");
    }
  }

  return {
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "transferred" : "blocked",
    apply,
    admission,
    cardId,
    source: {
      threadId: sourceThreadId,
      forumChannelId: sourceForumChannelId,
      updateHttpStatus: sourceUpdate?.status || null,
      archiveHttpStatus: sourceArchive?.status || null,
      readback: sourceReadback,
    },
    completed: {
      forumChannelId: completedForumChannelId,
      threadId: finalDestinationId,
      action: upsert.action,
      tags: destinationTagUpdate,
      reaction: destinationReaction,
      archiveState: {
        reopened: destinationReopened,
        reopenHttpStatus: destinationReopen?.status || null,
        restored: destinationRestored,
        restoreHttpStatus: destinationRestore?.status || null,
        expected: destinationOriginalState || (finalDestinationId ? { archived: false, locked: false } : null),
      },
      journal: {
        action: journalAction,
        messageId: journalMessageId,
      },
      readback: destinationReadback,
    },
    reasonCodes: [...new Set(reasonCodes)],
    writeCount,
    writeOutcomeUnknownCount,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await buildCompletedBoardTransfer(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`${result.status}: ${result.cardId || "unknown-card"}`);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  _internals: {
    TRANSFER_ENV,
    TRANSFER_ENV_VALUE,
    DEFAULT_COMPLETED_FORUM_CHANNEL_ID,
    parseArgs,
    resolveAdmission,
    validateInput,
    cardMarker,
    sameUniqueSet,
    inferProject,
    discordThreadUrl,
    buildCompletedEvent,
    buildCompletedMessage,
    buildSourceMessage,
    listForumThreads,
    readAllThreadMessages,
    findCompletedThread,
    setThreadArchiveState,
    buildCompletedBoardTransfer,
  },
};
