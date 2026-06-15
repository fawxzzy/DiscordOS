const {
  _internals: boardInternals,
} = require("./discordos-music-sesh-feedback-board");
const {
  _internals: reactionInternals,
} = require("./discordos-music-sesh-feature-card-reactions");

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
    live: false,
    allowApply: false,
    apply: false,
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
    } else if (arg === "--live") {
      options.live = true;
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

function reactionPresentForStatus(reactions = [], status = null) {
  if (!status) {
    return false;
  }
  const emoji = reactionInternals.STATUS_REACTIONS[status];
  return reactionInternals.reactionPresent(reactions, emoji);
}

async function reconcileLiveReactionCard({
  card,
  env = process.env,
  fetchImpl = fetch,
  allowApply = false,
  apply = false,
} = {}) {
  const expectedReactionStatus = expectedReactionStatusForState(card.state);
  const reasonCodes = [];
  if (!expectedReactionStatus) {
    return {
      ok: true,
      cardId: card.id || null,
      expectedReactionStatus,
      attempted: false,
      applied: false,
      readback: null,
      reasonCodes,
    };
  }
  if (!card.liveThreadId || !card.liveMessageId) {
    reasonCodes.push("live_reaction_card_coordinates_missing");
  }
  if (!env.DISCORDOS_BOT_TOKEN) {
    reasonCodes.push("bot_token_missing");
  }

  let applyResult = null;
  if (apply && reasonCodes.length === 0) {
    applyResult = await reactionInternals.buildMusicSeshFeatureCardReactions({
      env,
      fetchImpl,
      threadId: card.liveThreadId,
      messageId: card.liveMessageId,
      status: expectedReactionStatus,
      allowApply,
      apply,
    });
    reasonCodes.push(...applyResult.reasonCodes);
  }

  let readback = null;
  if (reasonCodes.length === 0) {
    const fetched = await reactionInternals.fetchDiscordMessage({
      channelId: card.liveThreadId,
      messageId: card.liveMessageId,
      token: env.DISCORDOS_BOT_TOKEN,
      fetchImpl,
    });
    const reactions = reactionInternals.summarizeReactions(fetched.payload);
    readback = {
      attempted: true,
      ok: fetched.ok,
      httpStatus: fetched.status,
      currentReactionPresent: reactionPresentForStatus(reactions, expectedReactionStatus),
      oppositeReactionPresent: reactionPresentForStatus(
        reactions,
        expectedReactionStatus === "success" ? "failure" : "success"
      ),
      reactions,
    };
    if (!fetched.ok) {
      reasonCodes.push("live_reaction_readback_failed");
    } else if (!readback.currentReactionPresent) {
      reasonCodes.push("live_reaction_readback_missing");
    } else if (readback.oppositeReactionPresent) {
      reasonCodes.push("live_reaction_opposite_present");
    }
  }

  return {
    ok: reasonCodes.length === 0,
    cardId: card.id || null,
    expectedReactionStatus,
    attempted: readback?.attempted === true || applyResult?.callsDiscordApi === true,
    applied: applyResult?.status === "reaction_applied",
    applyStatus: applyResult?.status || null,
    readback,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

async function buildBoardReactionLifecycleSync({
  boardPath = boardInternals.DEFAULT_BOARD_PATH,
  cardId = null,
  fsImpl,
  live = false,
  allowApply = false,
  apply = false,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const board = await boardInternals.buildMusicSeshFeedbackBoard({
    boardPath,
    cardId,
    fsImpl,
  });
  const reconciledCards = board.cards.map(reconcileReactionLifecycleCard);
  const liveReconciledCards = [];
  if (live || apply) {
    for (const card of board.cards) {
      liveReconciledCards.push(await reconcileLiveReactionCard({
        card,
        env,
        fetchImpl,
        allowApply,
        apply,
      }));
    }
  }
  const mismatchCount = reconciledCards.filter((card) => !card.ok).length;
  const liveMismatchCount = liveReconciledCards.filter((card) => !card.ok).length;
  const reasonCodes = [...new Set([
    ...board.reasonCodes,
    ...reconciledCards.flatMap((card) => card.reasonCodes),
    ...liveReconciledCards.flatMap((card) => card.reasonCodes),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: live || apply,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "reaction_lifecycle_synced" : "blocked",
    board: {
      status: board.status,
      cardCount: board.filteredCardCount,
      completedCardCount: board.completedCardCount,
      blockedCardCount: board.blockedCardCount,
      reactionReadyCardCount: board.reactionReadyCardCount,
    },
    mismatchCount,
    liveAttempted: live || apply,
    liveMismatchCount,
    reconciledCards,
    liveReconciledCards,
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
        liveMismatchCount: result.liveMismatchCount,
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
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- live mismatches: \`${result.liveMismatchCount}\``,
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
    reactionPresentForStatus,
    reconcileReactionLifecycleCard,
    reconcileLiveReactionCard,
    buildBoardReactionLifecycleSync,
    renderMarkdown,
  },
};
