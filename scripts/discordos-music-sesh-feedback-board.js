const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_BOARD_PATH = path.resolve(process.cwd(), "config", "discordos-music-sesh-feedback-board.json");
const STATES = new Set([
  "intake",
  "planning",
  "open",
  "backlog",
  "ready",
  "in_progress",
  "review",
  "blocked",
  "completed",
  "archived",
]);
const PRIORITIES = new Set(["low", "medium", "high"]);
const REACTION_STATUSES = new Set(["success", "failure"]);
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
    boardPath: DEFAULT_BOARD_PATH,
    cardId: null,
    state: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--board") {
      options.boardPath = path.resolve(readValue(args, index, "missing_board_value"));
      index += 1;
    } else if (arg === "--card-id") {
      options.cardId = readValue(args, index, "missing_card_id_value");
      index += 1;
    } else if (arg === "--state") {
      options.state = readValue(args, index, "missing_state_value");
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function readBoard(boardPath = DEFAULT_BOARD_PATH, fsImpl = fs) {
  const raw = await fsImpl.readFile(boardPath, "utf8");
  return JSON.parse(raw);
}

function classifyCard(card) {
  const reasonCodes = [];
  if (!card || typeof card.id !== "string" || card.id.trim().length === 0) {
    reasonCodes.push("card_id_missing");
  }
  if (typeof card.title !== "string" || card.title.trim().length === 0) {
    reasonCodes.push("card_title_missing");
  }
  if (!STATES.has(card.state)) {
    reasonCodes.push("card_state_invalid");
  }
  if (!PRIORITIES.has(card.priority)) {
    reasonCodes.push("card_priority_invalid");
  }
  if (typeof card.nextCommand !== "string" || !card.nextCommand.startsWith("npm run ops:discordos:")) {
    reasonCodes.push("card_next_command_invalid");
  }
  if (card.state === "completed") {
    if (typeof card.liveThreadId !== "string" || card.liveThreadId.trim().length === 0) {
      reasonCodes.push("card_live_thread_id_missing");
    }
    if (typeof card.liveMessageId !== "string" || card.liveMessageId.trim().length === 0) {
      reasonCodes.push("card_live_message_id_missing");
    }
    if (!REACTION_STATUSES.has(card.reactionStatus)) {
      reasonCodes.push("card_reaction_status_invalid");
    }
    const expectedReaction = STATUS_REACTIONS[card.reactionStatus];
    if (!expectedReaction || card.reactionEmojiName !== expectedReaction.name) {
      reasonCodes.push("card_reaction_emoji_name_invalid");
    }
    if (!expectedReaction || card.reactionEmojiId !== expectedReaction.id) {
      reasonCodes.push("card_reaction_emoji_id_invalid");
    }
  } else if (card.reactionStatus && !REACTION_STATUSES.has(card.reactionStatus)) {
    reasonCodes.push("card_reaction_status_invalid");
  }

  return {
    ok: reasonCodes.length === 0,
    id: card?.id || null,
    title: card?.title || null,
    state: card?.state || null,
    priority: card?.priority || null,
    category: card?.category || null,
    nextCommand: card?.nextCommand || null,
    liveThreadId: card?.liveThreadId || null,
    liveMessageId: card?.liveMessageId || null,
    reactionStatus: card?.reactionStatus || null,
    reactionEmojiName: card?.reactionEmojiName || null,
    reactionEmojiId: card?.reactionEmojiId || null,
    reasonCodes,
  };
}

function buildFeedbackBoardReadModel(board, { cardId = null, state = null } = {}) {
  const reasonCodes = [];
  if (!board || board.version !== 1) {
    reasonCodes.push("board_version_invalid");
  }
  if (!Array.isArray(board?.cards)) {
    reasonCodes.push("board_cards_missing");
  }
  if (state && !STATES.has(state)) {
    reasonCodes.push("state_filter_invalid");
  }

  const cards = (Array.isArray(board?.cards) ? board.cards : []).map(classifyCard);
  const filteredCards = cards.filter((card) =>
    (!cardId || card.id === cardId) && (!state || card.state === state)
  );
  const nextEligibleCards = filteredCards.filter((card) => card.state !== "completed");
  if (cardId && filteredCards.length === 0) {
    reasonCodes.push("card_not_found");
  }
  reasonCodes.push(...cards.flatMap((card) => card.reasonCodes));

  return {
    ok: reasonCodes.length === 0,
    boardId: board?.board?.id || null,
    boardLabel: board?.board?.label || null,
    sendsMessages: false,
    cardCount: cards.length,
    filteredCardCount: filteredCards.length,
    readyCardCount: cards.filter((card) => card.state === "ready").length,
    completedCardCount: cards.filter((card) => card.state === "completed").length,
    blockedCardCount: cards.filter((card) => card.state === "blocked").length,
    reactionReadyCardCount: cards.filter((card) =>
      card.state === "completed"
        && card.liveThreadId
        && card.liveMessageId
        && REACTION_STATUSES.has(card.reactionStatus)
        && card.reactionEmojiName === STATUS_REACTIONS[card.reactionStatus]?.name
        && card.reactionEmojiId === STATUS_REACTIONS[card.reactionStatus]?.id
    ).length,
    nextCard: nextEligibleCards.find((card) => card.priority === "high") || nextEligibleCards[0] || null,
    cards: filteredCards,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

async function buildMusicSeshFeedbackBoard({
  boardPath = DEFAULT_BOARD_PATH,
  cardId = null,
  state = null,
  fsImpl = fs,
} = {}) {
  const board = await readBoard(boardPath, fsImpl);
  const readModel = buildFeedbackBoardReadModel(board, { cardId, state });
  const result = {
    destructive: false,
    writesArtifacts: false,
    status: readModel.ok ? "feedback_board_ready" : "blocked",
    ...readModel,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.feedback_board_ready"
        : "discordos.music_sesh.feedback_board_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.feedback_board",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        cardCount: result.cardCount,
        readyCardCount: result.readyCardCount,
        completedCardCount: result.completedCardCount,
        blockedCardCount: result.blockedCardCount,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Music Sesh Feedback Board",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- board: \`${result.boardId || "unknown"}\``,
    `- cards: \`${result.cardCount}\``,
    `- filtered cards: \`${result.filteredCardCount}\``,
    `- ready cards: \`${result.readyCardCount}\``,
    `- completed cards: \`${result.completedCardCount}\``,
    `- blocked cards: \`${result.blockedCardCount}\``,
    `- reaction-ready cards: \`${result.reactionReadyCardCount}\``,
    `- next card: \`${result.nextCard?.id || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const card of result.cards) {
    lines.push(`- card ${card.id}: state \`${card.state}\`, priority \`${card.priority}\`, reaction \`${card.reactionStatus || "none"}\`, emoji \`${card.reactionEmojiName || "none"}\`, thread \`${card.liveThreadId || "none"}\`, command \`${card.nextCommand}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshFeedbackBoard(options);
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
    DEFAULT_BOARD_PATH,
    STATES,
    PRIORITIES,
    REACTION_STATUSES,
    STATUS_REACTIONS,
    parseArgs,
    classifyCard,
    buildFeedbackBoardReadModel,
    buildMusicSeshFeedbackBoard,
    renderMarkdown,
  },
};
