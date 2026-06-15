const {
  _internals: reactionSyncInternals,
} = require("./discordos-board-reaction-lifecycle-sync");

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
    live: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--card-id") {
      options.cardId = readValue(args, index, "missing_card_id_value");
      index += 1;
    } else if (arg === "--live") {
      options.live = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function summarizeDrift(sync = {}) {
  const committedDrift = (sync.reconciledCards || [])
    .filter((card) => !card.ok)
    .map((card) => ({
      cardId: card.cardId,
      source: "committed_board",
      reasonCodes: card.reasonCodes,
    }));
  const liveDrift = (sync.liveReconciledCards || [])
    .filter((card) => !card.ok)
    .map((card) => ({
      cardId: card.cardId,
      source: "live_forum_reaction",
      reasonCodes: card.reasonCodes,
    }));

  return {
    driftCount: committedDrift.length + liveDrift.length,
    committedDriftCount: committedDrift.length,
    liveDriftCount: liveDrift.length,
    driftedCards: [...committedDrift, ...liveDrift],
  };
}

async function buildBoardLifecycleReactionDriftMonitor({
  env = process.env,
  fetchImpl = fetch,
  ...input
} = {}) {
  const sync = await reactionSyncInternals.buildBoardReactionLifecycleSync({
    ...input,
    env,
    fetchImpl,
  });
  const drift = summarizeDrift(sync);
  const reasonCodes = drift.driftCount === 0 ? [] : ["board_reaction_drift_detected"];
  const result = {
    ok: sync.ok && drift.driftCount === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: sync.callsDiscordApi,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: sync.ok && drift.driftCount === 0 ? "reaction_drift_monitor_clear" : "drift_detected",
    liveAttempted: sync.liveAttempted,
    board: sync.board,
    drift,
    sync: {
      status: sync.status,
      mismatchCount: sync.mismatchCount,
      liveMismatchCount: sync.liveMismatchCount,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board.reaction_drift_monitor_clear"
        : "discordos.board.reaction_drift_monitor_attention",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board.reaction_drift_monitor",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        cardCount: result.board.cardCount,
        driftCount: drift.driftCount,
        liveAttempted: result.liveAttempted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Lifecycle Reaction Drift Monitor",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- cards: \`${result.board.cardCount}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- drift: \`${result.drift.driftCount}\``,
    `- live drift: \`${result.drift.liveDriftCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardLifecycleReactionDriftMonitor(options);
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
    summarizeDrift,
    buildBoardLifecycleReactionDriftMonitor,
    renderMarkdown,
  },
};
