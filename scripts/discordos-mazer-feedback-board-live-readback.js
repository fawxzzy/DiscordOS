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

async function discordRequest({
  path,
  token,
  fetchImpl = fetch,
}) {
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

function inspectMessageContent({ card, message, status, ok, contentLimit }) {
  const content = typeof message?.content === "string" ? message.content : "";
  const parsed = journal.parseManagedCardBody(content);
  const expectedState = card.state === "backlog"
    ? "planning"
    : card.state === "blocked"
      ? "blocked"
      : Number(card.completionPercent) >= 85
        ? "review"
        : "in_progress";
  const reasonCodes = [];
  if (!ok) {
    reasonCodes.push("live_message_read_failed");
  }
  if (!content) {
    reasonCodes.push("live_message_content_missing");
  }
  if (content.length > contentLimit) {
    reasonCodes.push("live_message_content_limit_exceeded");
  }
  if (!parsed) reasonCodes.push("live_message_canonical_body_missing");
  if (parsed && parsed.id !== card.id) reasonCodes.push("live_message_card_id_mismatch");
  if (parsed && parsed.project.toLowerCase() !== "mazer") reasonCodes.push("live_message_project_mismatch");
  if (parsed && parsed.state !== expectedState) reasonCodes.push("live_message_state_mismatch");
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
    expectedState,
    liveCardId: parsed?.id || null,
    liveProject: parsed?.project || null,
    liveState: parsed?.state || null,
    reasonCodes,
  };
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

  if (!token) {
    reasonCodes.push("bot_token_missing");
  }

  const rows = [];
  if (token) {
    for (const card of readableCards) {
      if (!card.liveThreadId || !card.liveMessageId) {
        rows.push({
          ok: false,
          cardId: card.id,
          title: card.title,
          threadId: card.liveThreadId || null,
          messageId: card.liveMessageId || null,
          httpStatus: null,
          contentLength: 0,
          expectedState: null,
          liveCardId: null,
          liveProject: null,
          liveState: null,
          reasonCodes: ["live_thread_or_message_id_missing"],
        });
        continue;
      }

      const response = await discordRequest({
        path: `/channels/${card.liveThreadId}/messages/${card.liveMessageId}`,
        token,
        fetchImpl,
      });
      rows.push(inspectMessageContent({
        card,
        message: response.payload,
        status: response.status,
        ok: response.ok,
        contentLimit,
      }));
    }
  }

  reasonCodes.push(...rows.flatMap((row) => row.reasonCodes));
  const uniqueReasonCodes = [...new Set(reasonCodes)];
  return {
    ok: uniqueReasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: Boolean(token),
    status: uniqueReasonCodes.length === 0 ? "live_readback_ready" : "blocked",
    boardId: readModel.boardId,
    forumChannelId: readModel.liveForumChannelId || readModel.placement?.forumChannelId || null,
    cardCount: readModel.cardCount,
    checkedTargetCardCount: readableCards.length,
    skippedCompletedSourceCardCount,
    checkedCardCount: rows.length,
    readyCardCount: rows.filter((row) => row.ok).length,
    contentLimit,
    rows,
    reasonCodes: uniqueReasonCodes,
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Mazer Feedback Board Live Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- board: \`${result.boardId || "unknown"}\``,
    `- forum channel id: \`${result.forumChannelId || "none"}\``,
    `- cards: \`${result.cardCount}\``,
    `- checked cards: \`${result.checkedCardCount}\``,
    `- ready cards: \`${result.readyCardCount}\``,
    `- content limit: \`${result.contentLimit}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const row of result.rows) {
    lines.push(`- card ${row.cardId}: \`${row.ok ? "pass" : "fail"}\` length \`${row.contentLength}\` status \`${row.httpStatus || "none"}\` state \`${row.liveState || "none"}\` reasons \`${row.reasonCodes.join(",") || "none"}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMazerFeedbackBoardLiveReadback(options);
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
    DISCORD_API_BASE,
    parseArgs,
    discordRequest,
    inspectMessageContent,
    buildMazerFeedbackBoardLiveReadback,
    renderMarkdown,
  },
};
