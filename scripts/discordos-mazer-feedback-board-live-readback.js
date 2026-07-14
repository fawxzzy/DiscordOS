const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const {
  _internals: boardInternals,
} = require("./discordos-mazer-feedback-board");
const {
  _internals: liveSyncInternals,
} = require("./discordos-mazer-feedback-board-live-sync");
const {
  _internals: journal,
} = require("./discordos-board-card-journal");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const MESSAGE_PAGE_LIMIT = 100;
const MAX_MESSAGE_PAGES = 10;
const OPEN_CARD_LIVE_STATES = Object.freeze(["planning", "ready", "in_progress", "review", "blocked", "opened"]);

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
    boardPath: boardInternals.DEFAULT_BOARD_PATH,
    contentLimit: 2000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--board") {
      options.boardPath = readValue(args, index, "missing_board_value");
      index += 1;
    } else if (arg === "--content-limit") {
      const parsed = Number.parseInt(readValue(args, index, "missing_content_limit_value"), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("invalid_content_limit_value");
      }
      options.contentLimit = parsed;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function discordRequest({ path, token, fetchImpl = fetch }) {
  const response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function allowedLiveStatesForCard(card) {
  if (card.state === "backlog") return ["planning"];
  if (card.state === "blocked") return ["blocked"];
  if (card.state === "ready") return ["ready"];
  if (card.state === "open") return [...OPEN_CARD_LIVE_STATES];
  return [card.state];
}

function parseJournalMessage(message) {
  const content = typeof message?.content === "string" ? message.content : "";
  const eventId = content.match(/ATLAS-JOURNAL-EVENT-ID:\s*`([^`]+)`/i)?.[1]?.trim() || null;
  if (!eventId) return null;
  const metadata = (name) => content.match(new RegExp(`^- ${name}:\\s*` + "`([^`]+)`", "im"))?.[1]?.trim() || null;
  return {
    messageId: message?.id || null,
    eventId,
    idempotencyKey: metadata("idempotency") || eventId,
    cardId: metadata("card"),
    state: metadata("state")?.toLowerCase() || null,
    occurredAt: metadata("occurred"),
    timestamp: message?.timestamp || null,
    contentLength: content.length,
    content,
  };
}

async function readThreadMessages({ threadId, token, fetchImpl = fetch }) {
  const messages = [];
  let before = null;
  let pageCount = 0;
  let lastStatus = null;

  while (pageCount < MAX_MESSAGE_PAGES) {
    const suffix = before ? `&before=${encodeURIComponent(before)}` : "";
    const response = await discordRequest({
      path: `/channels/${threadId}/messages?limit=${MESSAGE_PAGE_LIMIT}${suffix}`,
      token,
      fetchImpl,
    });
    pageCount += 1;
    lastStatus = response.status;
    if (!response.ok || !Array.isArray(response.payload)) {
      return {
        ok: false,
        status: response.status,
        messages,
        pageCount,
        truncated: false,
        reasonCodes: ["live_thread_messages_read_failed"],
      };
    }
    messages.push(...response.payload);
    if (response.payload.length < MESSAGE_PAGE_LIMIT) {
      return {
        ok: true,
        status: response.status,
        messages,
        pageCount,
        truncated: false,
        reasonCodes: [],
      };
    }
    before = response.payload.at(-1)?.id || null;
    if (!before) break;
  }

  return {
    ok: false,
    status: lastStatus,
    messages,
    pageCount,
    truncated: true,
    reasonCodes: ["live_thread_message_history_truncated"],
  };
}

function inspectMessageContent({ card, message, status, ok, contentLimit }) {
  const content = typeof message?.content === "string" ? message.content : "";
  const parsed = journal.parseManagedCardBody(content);
  const allowedLiveStates = allowedLiveStatesForCard(card);
  const reasonCodes = [];
  if (!ok) reasonCodes.push("live_message_read_failed");
  if (!content) reasonCodes.push("live_message_content_missing");
  if (content.length > contentLimit) reasonCodes.push("live_message_content_limit_exceeded");
  if (!parsed) reasonCodes.push("live_message_canonical_body_missing");
  if (parsed && parsed.id !== card.id) reasonCodes.push("live_message_card_id_mismatch");
  if (parsed && parsed.project.toLowerCase() !== "mazer") reasonCodes.push("live_message_project_mismatch");
  if (parsed && !allowedLiveStates.includes(parsed.state)) reasonCodes.push("live_message_state_mismatch");
  if (!/^- updated:\s*`[^`]+`/im.test(content)) reasonCodes.push("live_message_updated_timestamp_missing");
  if (journal.findMojibakeRuns(content).length > 0) reasonCodes.push("live_message_encoding_corrupt");

  return {
    ok: reasonCodes.length === 0,
    cardId: card.id,
    title: card.title,
    threadId: card.liveThreadId || null,
    messageId: card.liveMessageId || null,
    httpStatus: status,
    contentLength: content.length,
    sourceState: card.state,
    allowedLiveStates,
    liveCardId: parsed?.id || null,
    liveProject: parsed?.project || null,
    liveState: parsed?.state || null,
    reasonCodes,
  };
}

function inspectThreadMessages({
  card,
  messages,
  status,
  ok,
  contentLimit,
  boardVersion,
  pageCount = 1,
  truncated = false,
}) {
  const starter = messages.find((message) => message?.id === card.liveMessageId)
    || messages.find((message) => message?.id === card.liveThreadId)
    || null;
  const canonical = starter
    ? inspectMessageContent({ card, message: starter, status, ok, contentLimit })
    : null;
  const journals = messages
    .map((message, sourceIndex) => ({ ...parseJournalMessage(message), sourceIndex }))
    .filter((message) => message.eventId)
    .sort((left, right) => {
      const leftTime = left.timestamp || left.occurredAt || "";
      const rightTime = right.timestamp || right.occurredAt || "";
      return rightTime.localeCompare(leftTime) || left.sourceIndex - right.sourceIndex;
    });
  const selectedJournal = journals[0] || null;
  const allowedLiveStates = allowedLiveStatesForCard(card);
  const usesCanonicalBody = canonical?.ok === true;
  const starterUsesManagedBody = String(starter?.content || "").includes(journal.CARD_START);
  const reasonCodes = [];

  if (!ok) reasonCodes.push("live_thread_messages_read_failed");
  if (truncated) reasonCodes.push("live_thread_message_history_truncated");
  if (!starter) reasonCodes.push("live_starter_message_missing");
  if (starterUsesManagedBody && !usesCanonicalBody) reasonCodes.push(...(canonical?.reasonCodes || []));
  if (!selectedJournal) {
    if (!starterUsesManagedBody) reasonCodes.push(...(canonical?.reasonCodes || []));
    reasonCodes.push("live_journal_event_missing");
  }
  if (selectedJournal?.contentLength > contentLimit) reasonCodes.push("live_message_content_limit_exceeded");
  if (selectedJournal && !allowedLiveStates.includes(selectedJournal.state)) {
    reasonCodes.push("live_message_state_mismatch");
  }
  if (selectedJournal?.cardId && selectedJournal.cardId !== card.id) reasonCodes.push("live_message_card_id_mismatch");
  if (selectedJournal && !selectedJournal.occurredAt) {
    reasonCodes.push("live_message_updated_timestamp_missing");
  }
  if (selectedJournal && journal.findMojibakeRuns(selectedJournal.content).length > 0) {
    reasonCodes.push("live_message_encoding_corrupt");
  }
  if (usesCanonicalBody && selectedJournal && canonical.liveState !== selectedJournal.state) {
    reasonCodes.push("live_card_journal_state_mismatch");
  }

  const observedMessage = usesCanonicalBody ? starter : selectedJournal;
  const observedContent = selectedJournal?.content || starter?.content || "";
  return {
    ok: reasonCodes.length === 0,
    cardId: card.id,
    title: card.title,
    threadId: card.liveThreadId || null,
    starterMessageId: starter?.id || null,
    messageId: observedMessage?.messageId || observedMessage?.id || null,
    httpStatus: status,
    messageCount: messages.length,
    pageCount,
    truncated,
    contentLength: observedMessage?.contentLength ?? (starter?.content || "").length,
    sourceState: card.state,
    allowedLiveStates,
    liveCardId: usesCanonicalBody ? canonical.liveCardId : selectedJournal?.cardId || card.id,
    liveProject: usesCanonicalBody ? canonical.liveProject : "Mazer",
    liveState: usesCanonicalBody ? canonical.liveState : selectedJournal?.state || null,
    correlationMode: usesCanonicalBody ? "canonical_card_body" : "journal_event_with_board_thread_mapping",
    observedBoardVersion: boardVersion,
    observedEventId: selectedJournal?.eventId || null,
    observedIdempotencyKey: selectedJournal?.idempotencyKey || null,
    observedContentDigest: observedContent
      ? `sha256:${crypto.createHash("sha256").update(observedContent).digest("hex")}`
      : null,
    journalMessageCount: journals.length,
    reasonCodes,
  };
}

function readbackReceiptId(result) {
  const identity = {
    boardId: result.boardId,
    observedBoardVersion: result.observedBoardVersion,
    rows: result.rows.map((row) => ({
      cardId: row.cardId,
      threadId: row.threadId,
      messageId: row.messageId,
      starterMessageId: row.starterMessageId,
      eventId: row.observedEventId,
      idempotencyKey: row.observedIdempotencyKey,
      state: row.liveState,
      contentDigest: row.observedContentDigest,
      ok: row.ok,
      reasonCodes: [...row.reasonCodes].sort(),
      messageCount: row.messageCount,
      journalMessageCount: row.journalMessageCount,
      pageCount: row.pageCount,
      truncated: row.truncated,
    })),
  };
  return `dbr_${crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32)}`;
}

async function buildMazerFeedbackBoardLiveReadback({
  boardPath = boardInternals.DEFAULT_BOARD_PATH,
  contentLimit = 2000,
  env = process.env,
  fetchImpl = fetch,
  fsImpl = fs,
} = {}) {
  const board = await boardInternals.readBoard(boardPath, fsImpl);
  const readModel = boardInternals.buildMazerFeedbackBoardReadModel(board);
  const readableCards = readModel.cards.filter((card) => card.state !== "completed");
  const skippedCompletedSourceCardCount = readModel.cards.length - readableCards.length;
  const token = liveSyncInternals.normalizeEnvValue(env.DISCORDOS_BOT_TOKEN);
  const reasonCodes = [...readModel.reasonCodes];

  if (!token) reasonCodes.push("bot_token_missing");

  const rows = [];
  if (token) {
    for (const card of readableCards) {
      if (!card.liveThreadId || !card.liveMessageId) {
        rows.push({
          ok: false,
          cardId: card.id,
          title: card.title,
          threadId: card.liveThreadId || null,
          starterMessageId: card.liveMessageId || null,
          messageId: null,
          httpStatus: null,
          messageCount: 0,
          pageCount: 0,
          truncated: false,
          contentLength: 0,
          sourceState: card.state,
          allowedLiveStates: allowedLiveStatesForCard(card),
          liveCardId: null,
          liveProject: null,
          liveState: null,
          correlationMode: null,
          observedBoardVersion: board.version,
          observedEventId: null,
          observedIdempotencyKey: null,
          journalMessageCount: 0,
          reasonCodes: ["live_thread_or_message_id_missing"],
        });
        continue;
      }

      const response = await readThreadMessages({
        threadId: card.liveThreadId,
        token,
        fetchImpl,
      });
      rows.push(inspectThreadMessages({
        card,
        messages: response.messages,
        status: response.status,
        ok: response.ok,
        contentLimit,
        boardVersion: board.version,
        pageCount: response.pageCount,
        truncated: response.truncated,
      }));
    }
  }

  reasonCodes.push(...rows.flatMap((row) => row.reasonCodes));
  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const result = {
    ok: uniqueReasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: Boolean(token),
    status: uniqueReasonCodes.length === 0 ? "live_readback_ready" : "blocked",
    writerAuthority: "discordos",
    externalMutation: "not_performed",
    boardId: readModel.boardId,
    observedBoardVersion: board.version,
    forumChannelId: readModel.liveForumChannelId || readModel.placement?.forumChannelId || null,
    cardCount: readModel.cardCount,
    checkedTargetCardCount: readableCards.length,
    skippedCompletedSourceCardCount,
    checkedCardCount: rows.length,
    readyCardCount: rows.filter((row) => row.ok).length,
    correlatedCardCount: rows.filter((row) => row.cardId && row.threadId && row.messageId).length,
    idempotencyCorrelatedCardCount: rows.filter((row) => row.observedIdempotencyKey).length,
    contentLimit,
    rows,
    reasonCodes: uniqueReasonCodes,
  };
  result.readbackReceiptId = readbackReceiptId(result);
  return result;
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Mazer Feedback Board Live Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- readback receipt: \`${result.readbackReceiptId}\``,
    `- board: \`${result.boardId || "unknown"}\``,
    `- observed board version: \`${result.observedBoardVersion}\``,
    `- forum channel id: \`${result.forumChannelId || "none"}\``,
    `- cards: \`${result.cardCount}\``,
    `- checked cards: \`${result.checkedCardCount}\``,
    `- ready cards: \`${result.readyCardCount}\``,
    `- correlated cards: \`${result.correlatedCardCount}\``,
    `- idempotency-correlated cards: \`${result.idempotencyCorrelatedCardCount}\``,
    `- content limit: \`${result.contentLimit}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const row of result.rows) {
    lines.push(`- card ${row.cardId}: \`${row.ok ? "pass" : "fail"}\` thread \`${row.threadId || "none"}\` message \`${row.messageId || "none"}\` idempotency \`${row.observedIdempotencyKey || "none"}\` state \`${row.liveState || "none"}\` reasons \`${row.reasonCodes.join(",") || "none"}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMazerFeedbackBoardLiveReadback(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) process.exitCode = 1;
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
    DISCORD_API_BASE,
    MESSAGE_PAGE_LIMIT,
    MAX_MESSAGE_PAGES,
    parseArgs,
    discordRequest,
    OPEN_CARD_LIVE_STATES,
    allowedLiveStatesForCard,
    parseJournalMessage,
    readThreadMessages,
    inspectMessageContent,
    inspectThreadMessages,
    readbackReceiptId,
    buildMazerFeedbackBoardLiveReadback,
    renderMarkdown,
  },
};
