const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");

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
  if (options.sourceForumChannelId === options.completedForumChannelId) {
    reasonCodes.push("source_and_completed_forum_must_differ");
  }
  return [...new Set(reasonCodes)];
}

function cardMarker(cardId) {
  return `ATLAS-CARD-ID: \`${cardId}\``;
}

function discordThreadUrl(guildId, threadId) {
  return `https://discord.com/channels/${guildId}/${threadId}`;
}

function truncateForSuffix(value, suffix) {
  const text = String(value || "").trim();
  const available = Math.max(0, MAX_MESSAGE_LENGTH - suffix.length - 2);
  return text.length <= available ? text : `${text.slice(0, Math.max(0, available - 3)).trimEnd()}...`;
}

function buildCompletedMessage({ cardId, sourceContent, sourceUrl, destinationUrl = null, evidence }) {
  const suffix = [
    "",
    "## Completion",
    "- state: `completed`",
    `- evidence: ${evidence}`,
    `- original card: ${sourceUrl}`,
    destinationUrl ? `- completed card: ${destinationUrl}` : null,
  ].filter(Boolean).join("\n");
  const body = truncateForSuffix(sourceContent, suffix);
  return `${cardMarker(cardId)}\n\n${body}${suffix}`.slice(0, MAX_MESSAGE_LENGTH);
}

function buildSourceMessage({ sourceContent, destinationUrl, cardId }) {
  const marker = `ATLAS-COMPLETED-CARD: ${destinationUrl}`;
  if (String(sourceContent || "").includes(marker)) return String(sourceContent || "");
  const suffix = `\n\n## Archived completion\n- card id: \`${cardId}\`\n- completed card: ${destinationUrl}\n${marker}`;
  return `${truncateForSuffix(sourceContent, suffix)}${suffix}`.slice(0, MAX_MESSAGE_LENGTH);
}

async function listForumThreads({ forumChannelId, guildId, token, fetchImpl = fetch }) {
  const [active, archived] = await Promise.all([
    cardContract.discordRequest({ path: `/guilds/${guildId}/threads/active`, token, fetchImpl }),
    cardContract.discordRequest({
      path: `/channels/${forumChannelId}/threads/archived/public?limit=100`,
      token,
      fetchImpl,
    }),
  ]);
  const reasonCodes = [];
  if (!active.ok) reasonCodes.push("completed_active_threads_read_failed");
  if (!archived.ok) reasonCodes.push("completed_archived_threads_read_failed");
  const seen = new Set();
  const threads = [
    ...(active.payload?.threads || []).filter((thread) => thread.parent_id === forumChannelId),
    ...(archived.payload?.threads || []),
  ].filter((thread) => thread?.id && !seen.has(thread.id) && seen.add(thread.id));
  return { ok: reasonCodes.length === 0, threads, reasonCodes };
}

async function findCompletedThread({ threads, cardId, expectedTitle, token, fetchImpl = fetch }) {
  const titleMatches = [];
  for (const thread of threads) {
    const message = await cardContract.fetchMessage({
      channelId: thread.id,
      messageId: thread.id,
      token,
      fetchImpl,
    });
    if (message.ok && String(message.payload?.content || "").includes(cardMarker(cardId))) {
      return { thread, message: message.payload, matchedBy: "stable_card_id" };
    }
    if (cardContract.normalizeThreadTitle(thread.name) === cardContract.normalizeThreadTitle(expectedTitle)) {
      titleMatches.push({ thread, message: message.payload });
    }
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
  evidence,
  allowApply = false,
  apply = false,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const options = {
    sourceThreadId,
    sourceForumChannelId,
    completedForumChannelId,
    cardId,
    evidence,
  };
  const admission = resolveAdmission({ allowApply, env });
  const reasonCodes = [
    ...validateInput(options),
    ...(apply ? admission.reasonCodes : []),
  ];
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
      reasonCodes: [...new Set(reasonCodes)],
    };
  }

  const [sourceThread, sourceMessage] = await Promise.all([
    cardContract.discordRequest({ path: `/channels/${sourceThreadId}`, token, fetchImpl }),
    cardContract.fetchMessage({ channelId: sourceThreadId, messageId: sourceThreadId, token, fetchImpl }),
  ]);
  if (!sourceThread.ok || !sourceMessage.ok) reasonCodes.push("source_card_read_failed");
  if (sourceThread.payload?.parent_id !== sourceForumChannelId) reasonCodes.push("source_forum_mismatch");
  const guildId = sourceThread.payload?.guild_id || null;
  if (!guildId) reasonCodes.push("source_guild_id_missing");
  if (reasonCodes.length > 0) {
    return { ok: false, status: "blocked", apply, admission, cardId, reasonCodes: [...new Set(reasonCodes)] };
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
      expectedTitle: sourceThread.payload.name,
      token,
      fetchImpl,
    })
    : null;
  if (existing?.ambiguous) reasonCodes.push("completed_card_identity_ambiguous");
  const sourceUrl = discordThreadUrl(guildId, sourceThreadId);
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
      reasonCodes: [...new Set(reasonCodes)],
    };
  }
  if (reasonCodes.length > 0) {
    return { ok: false, status: "blocked", apply, admission, cardId, preview, reasonCodes: [...new Set(reasonCodes)] };
  }

  const destinationThreadId = existing?.thread?.id || null;
  const destinationUrl = destinationThreadId ? discordThreadUrl(guildId, destinationThreadId) : null;
  const spec = {
    cardId,
    stableIdentity: cardContract.normalizeIdentity(cardId),
    canonicalTitle: sourceThread.payload.name,
    proposedTitle: sourceThread.payload.name,
    requiredReactions: [{ status: "success", ...cardContract.STATUS_REACTIONS.success }],
  };
  if (existing?.thread?.thread_metadata?.archived === true || existing?.thread?.thread_metadata?.locked === true) {
    const reopened = await setThreadArchiveState({
      threadId: existing.thread.id,
      token,
      archived: false,
      locked: false,
      fetchImpl,
    });
    if (!reopened.ok) reasonCodes.push("completed_card_reopen_failed");
  }
  if (reasonCodes.length > 0) {
    return {
      ok: false,
      status: "blocked",
      apply,
      admission,
      cardId,
      preview,
      reasonCodes: [...new Set(reasonCodes)],
    };
  }
  const upsert = await cardContract.upsertDiscordForumCard({
    spec,
    existingThread: existing ? {
      id: existing.thread.id,
      name: existing.thread.name,
      messageId: existing.thread.id,
    } : null,
    forumChannelId: completedForumChannelId,
    token,
    apply: true,
    buildPayload: () => ({
      name: sourceThread.payload.name,
      auto_archive_duration: cardContract.DEFAULT_AUTO_ARCHIVE_DURATION,
      message: {
        content: buildCompletedMessage({
          cardId,
          sourceContent: sourceMessage.payload?.content,
          sourceUrl,
          destinationUrl,
          evidence,
        }),
        allowed_mentions: { parse: [] },
      },
    }),
    fetchImpl,
  });
  reasonCodes.push(...upsert.reasonCodes);
  const finalDestinationId = upsert.threadId;
  const finalDestinationUrl = finalDestinationId ? discordThreadUrl(guildId, finalDestinationId) : null;
  let destinationReadback = null;
  if (upsert.ok && finalDestinationId) {
    const [threadRead, messageRead] = await Promise.all([
      cardContract.discordRequest({ path: `/channels/${finalDestinationId}`, token, fetchImpl }),
      cardContract.fetchMessage({
        channelId: finalDestinationId,
        messageId: upsert.messageId || finalDestinationId,
        token,
        fetchImpl,
      }),
    ]);
    const content = String(messageRead.payload?.content || "");
    destinationReadback = {
      threadRead: threadRead.ok,
      messageRead: messageRead.ok,
      parentMatches: threadRead.payload?.parent_id === completedForumChannelId,
      cardMarkerPresent: content.includes(cardMarker(cardId)),
      sourceLinkPresent: content.includes(sourceUrl),
    };
    if (!Object.values(destinationReadback).every(Boolean)) reasonCodes.push("completed_card_readback_failed");
  }

  let sourceUpdate = null;
  let sourceArchive = null;
  let sourceReadback = null;
  if (reasonCodes.length === 0 && finalDestinationUrl) {
    const wasArchived = sourceThread.payload?.thread_metadata?.archived === true;
    const wasLocked = sourceThread.payload?.thread_metadata?.locked === true;
    if (wasArchived || wasLocked) {
      const reopened = await setThreadArchiveState({
        threadId: sourceThreadId,
        token,
        archived: false,
        locked: false,
        fetchImpl,
      });
      if (!reopened.ok) reasonCodes.push("source_card_reopen_failed");
    }
    if (reasonCodes.length === 0) {
      sourceUpdate = await cardContract.updateThreadMessage({
        threadId: sourceThreadId,
        messageId: sourceThreadId,
        token,
        message: {
          content: buildSourceMessage({
            sourceContent: sourceMessage.payload?.content,
            destinationUrl: finalDestinationUrl,
            cardId,
          }),
          allowed_mentions: { parse: [] },
        },
        fetchImpl,
      });
      if (!sourceUpdate.ok) reasonCodes.push("source_card_link_update_failed");
    }
    if (reasonCodes.length === 0) {
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
      reaction: upsert.reactionResult,
      readback: destinationReadback,
    },
    reasonCodes: [...new Set(reasonCodes)],
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
    buildCompletedMessage,
    buildSourceMessage,
    listForumThreads,
    findCompletedThread,
    setThreadArchiveState,
    buildCompletedBoardTransfer,
  },
};
