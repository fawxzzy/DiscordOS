const {
  _internals: boardInternals,
} = require("./discordos-music-sesh-feedback-board");

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
    cardId: null,
    boardPath: boardInternals.DEFAULT_BOARD_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--card-id") {
      options.cardId = readValue(args, index, "missing_card_id_value");
      index += 1;
    } else if (arg === "--board") {
      options.boardPath = readValue(args, index, "missing_board_value");
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function expectedReactionStatusForState(state) {
  const normalized = String(state || "").trim().toLowerCase();
  if (normalized === "completed") {
    return "success";
  }
  if (normalized === "blocked") {
    return "failure";
  }
  return null;
}

function reconcileReactionLifecycleCard(card = {}) {
  const expectedReactionStatus = expectedReactionStatusForState(card.state);
  const reasonCodes = [];

  if (expectedReactionStatus && card.reactionStatus !== expectedReactionStatus) {
    reasonCodes.push("reaction_status_lifecycle_mismatch");
  }
  if (card.reactionStatus === "success" && card.state !== "completed") {
    reasonCodes.push("success_reaction_requires_completed_state");
  }
  if (card.reactionStatus === "failure" && card.state !== "blocked") {
    reasonCodes.push("failure_reaction_requires_blocked_state");
  }
  if (card.reactionStatus && card.reactionEmojiName !== card.reactionStatus) {
    reasonCodes.push("reaction_emoji_name_mismatch");
  }

  return {
    ok: reasonCodes.length === 0,
    cardId: card.id || null,
    state: card.state || null,
    reactionStatus: card.reactionStatus || null,
    reactionEmojiName: card.reactionEmojiName || null,
    expectedReactionStatus,
    lifecycleStateFromReaction: card.reactionStatus === "success"
      ? "completed"
      : card.reactionStatus === "failure"
        ? "blocked"
        : card.state || null,
    reasonCodes,
  };
}

async function buildBoardReactionLifecycleSync({
  boardPath = boardInternals.DEFAULT_BOARD_PATH,
  cardId = null,
  fsImpl,
} = {}) {
  const board = await boardInternals.buildMusicSeshFeedbackBoard({
    boardPath,
    cardId,
    fsImpl,
  });
  const reconciledCards = board.cards.map(reconcileReactionLifecycleCard);
  const mismatchCount = reconciledCards.filter((card) => !card.ok).length;
  const reasonCodes = [...new Set([
    ...board.reasonCodes,
    ...reconciledCards.flatMap((card) => card.reasonCodes),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    status: reasonCodes.length === 0 ? "reaction_lifecycle_synced" : "blocked",
    board: {
      status: board.status,
      cardCount: board.filteredCardCount,
      completedCardCount: board.completedCardCount,
      blockedCardCount: board.blockedCardCount,
      reactionReadyCardCount: board.reactionReadyCardCount,
    },
    mismatchCount,
    reconciledCards,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board.reaction_lifecycle_synced"
        : "discordos.board.reaction_lifecycle_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board.reaction_lifecycle",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        cardCount: result.board.cardCount,
        mismatchCount: result.mismatchCount,
        reactionReadyCardCount: result.board.reactionReadyCardCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Lifecycle Sync",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- cards: \`${result.board.cardCount}\``,
    `- reaction-ready cards: \`${result.board.reactionReadyCardCount}\``,
    `- mismatches: \`${result.mismatchCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionLifecycleSync(options);
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
    parseArgs,
    expectedReactionStatusForState,
    reconcileReactionLifecycleCard,
    buildBoardReactionLifecycleSync,
    renderMarkdown,
  },
};
