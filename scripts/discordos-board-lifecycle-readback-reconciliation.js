const {
  _internals: boardInternals,
} = require("./discordos-music-sesh-feedback-board");
const {
  _internals: liveReadbackInternals,
} = require("./discordos-product-workflow-live-readback");

const DEFAULT_CARD_ID = "music-sesh-phase-8-cross-service-room-sync-simple-controls";

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
    live: false,
    cardId: DEFAULT_CARD_ID,
    boardPath: boardInternals.DEFAULT_BOARD_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--live") {
      options.live = true;
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

function normalizeState(value) {
  return String(value || "").trim().toLowerCase();
}

function summarizeStorageCard(readback = {}) {
  const latest = readback.latestBoardCard || null;
  return {
    present: Boolean(latest),
    cardId: latest?.cardId || latest?.card_id || null,
    workflow: latest?.workflow || null,
    state: latest?.currentState || latest?.current_state || null,
    updatedAt: latest?.updatedAt || latest?.updated_at || null,
  };
}

function reconcileCard({ boardCard = null, storageCard = null }) {
  const reasonCodes = [];
  if (!boardCard) {
    reasonCodes.push("board_card_missing");
  }
  if (!storageCard?.present) {
    reasonCodes.push("storage_card_missing");
  }

  const cardIdMatches = Boolean(boardCard?.id && storageCard?.cardId === boardCard.id);
  const stateMatches = Boolean(boardCard?.state && normalizeState(storageCard?.state) === normalizeState(boardCard.state));

  if (boardCard && storageCard?.present && !cardIdMatches) {
    reasonCodes.push("card_id_mismatch");
  }
  if (boardCard && storageCard?.present && !stateMatches) {
    reasonCodes.push("card_state_mismatch");
  }

  return {
    ok: reasonCodes.length === 0,
    cardIdMatches,
    stateMatches,
    boardCard: boardCard ? {
      id: boardCard.id,
      title: boardCard.title,
      state: boardCard.state,
      liveThreadId: boardCard.liveThreadId,
      reactionStatus: boardCard.reactionStatus,
    } : null,
    storageCard,
    reasonCodes,
  };
}

async function buildBoardLifecycleReadbackReconciliation({
  boardPath = boardInternals.DEFAULT_BOARD_PATH,
  cardId = DEFAULT_CARD_ID,
  live = false,
  env = process.env,
  fetchImpl = fetch,
  fsImpl,
} = {}) {
  const board = await boardInternals.buildMusicSeshFeedbackBoard({
    boardPath,
    cardId,
    fsImpl,
  });
  const boardCard = board.cards[0] || null;
  const readback = await liveReadbackInternals.buildProductWorkflowLiveReadback({
    live,
    env,
    fetchImpl,
  });
  const storageCard = summarizeStorageCard(readback.readback || {});
  const reconciliation = reconcileCard({ boardCard, storageCard });
  const reasonCodes = [...new Set([
    ...board.reasonCodes,
    ...readback.reasonCodes,
    ...reconciliation.reasonCodes,
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    liveAttempted: readback.liveAttempted,
    status: reasonCodes.length === 0 ? "reconciled" : "blocked",
    board: {
      status: board.status,
      cardCount: board.filteredCardCount,
    },
    readback: {
      status: readback.status,
      summary: readback.summary,
    },
    reconciliation,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board.lifecycle_readback_reconciled"
        : "discordos.board.lifecycle_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board.lifecycle_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveAttempted: result.liveAttempted,
        cardIdMatches: reconciliation.cardIdMatches,
        stateMatches: reconciliation.stateMatches,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Lifecycle Readback Reconciliation",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- board card: \`${result.reconciliation.boardCard?.id || "none"}\``,
    `- storage card: \`${result.reconciliation.storageCard?.cardId || "none"}\``,
    `- card id matches: \`${result.reconciliation.cardIdMatches ? "true" : "false"}\``,
    `- state matches: \`${result.reconciliation.stateMatches ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardLifecycleReadbackReconciliation(options);
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
    DEFAULT_CARD_ID,
    normalizeState,
    summarizeStorageCard,
    reconcileCard,
    buildBoardLifecycleReadbackReconciliation,
    renderMarkdown,
  },
};
