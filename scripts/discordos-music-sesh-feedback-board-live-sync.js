const {
  _internals: boardInternals,
} = require("./discordos-music-sesh-feedback-board");
const {
  _internals: lifecycleInternals,
} = require("./discord-forum-card-lifecycle");

const LIVE_SYNC_ENV = "DISCORDOS_MUSIC_SESH_FEEDBACK_BOARD_SYNC";
const LIVE_SYNC_ENV_VALUE = "enabled";

function parseArgs(args) {
  const boardArgs = [];
  const options = {
    allowSync: false,
    apply: false,
  };

  for (const arg of args) {
    if (arg === "--allow-sync") {
      options.allowSync = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else {
      boardArgs.push(arg);
    }
  }

  return {
    ...boardInternals.parseArgs(boardArgs),
    ...options,
  };
}

function resolveSyncAdmission({ allowSync, env }) {
  const envEnabled = env?.[LIVE_SYNC_ENV] === LIVE_SYNC_ENV_VALUE;
  if (!allowSync && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "no_sync_guard_active",
      reasonCodes: [],
    };
  }
  if (allowSync && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "sync_plan_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["sync_double_guard_missing"],
  };
}

function buildLifecyclePreview(card) {
  return {
    workflow: "Music Sesh",
    cardId: card.id,
    state: card.state === "completed" ? "completed" : "in_progress",
    title: `Music Sesh Card ${card.id}`,
    body: `Card ${card.id}: ${card.title}`,
  };
}

async function buildMusicSeshFeedbackBoardLiveSync({
  env = process.env,
  fetchImpl = fetch,
  allowSync = false,
  apply = false,
  ...input
} = {}) {
  const board = await boardInternals.buildMusicSeshFeedbackBoard(input);
  const syncAdmission = resolveSyncAdmission({ allowSync, env });
  const selectedCard = board.nextCard || (input.cardId ? board.cards[0] : null);
  const lifecyclePreview = selectedCard ? buildLifecyclePreview(selectedCard) : null;
  let lifecycleResult = {
    ok: true,
    sendsMessages: false,
    status: selectedCard ? "not_requested" : "no_pending_card",
    reasonCodes: [],
  };

  if (lifecyclePreview) {
    lifecycleResult = await lifecycleInternals.buildDiscordForumCardLifecycle({
      ...lifecyclePreview,
      apply: apply && syncAdmission.admitted,
      env,
      fetchImpl,
    });
  }

  const reasonCodes = [...new Set([
    ...board.reasonCodes,
    ...syncAdmission.reasonCodes,
    ...(apply && !syncAdmission.admitted ? ["sync_apply_not_admitted"] : []),
    ...(lifecycleResult.ok ? [] : lifecycleResult.reasonCodes || []),
  ])];
  const result = {
    ok: board.ok && syncAdmission.reasonCodes.length === 0 && lifecycleResult.ok && !(apply && !syncAdmission.admitted),
    destructive: false,
    sendsMessages: lifecycleResult.sendsMessages === true,
    writesArtifacts: false,
    status: reasonCodes.length === 0 ? "live_sync_ready" : "blocked",
    boardId: board.boardId,
    cardCount: board.cardCount,
    readyCardCount: board.readyCardCount,
    nextCard: selectedCard,
    syncAdmission,
    lifecyclePreview,
    lifecycleStatus: lifecycleResult.status,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.feedback_board_live_sync_ready"
        : "discordos.music_sesh.feedback_board_live_sync_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.feedback_board_live_sync",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        cardCount: result.cardCount,
        readyCardCount: result.readyCardCount,
        sendsMessages: result.sendsMessages,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Feedback Board Live Sync",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- board: \`${result.boardId || "unknown"}\``,
    `- cards: \`${result.cardCount}\``,
    `- ready cards: \`${result.readyCardCount}\``,
    `- next card: \`${result.nextCard?.id || "none"}\``,
    `- sync admission: \`${result.syncAdmission.status}\``,
    `- lifecycle status: \`${result.lifecycleStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshFeedbackBoardLiveSync(options);
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
    LIVE_SYNC_ENV,
    LIVE_SYNC_ENV_VALUE,
    parseArgs,
    resolveSyncAdmission,
    buildLifecyclePreview,
    buildMusicSeshFeedbackBoardLiveSync,
    renderMarkdown,
  },
};
