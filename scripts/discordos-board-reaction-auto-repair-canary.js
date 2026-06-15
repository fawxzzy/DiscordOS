const {
  _internals: lifecycleInternals,
} = require("./discordos-board-reaction-lifecycle-sync");
const {
  _internals: driftAlertingInternals,
} = require("./discordos-board-reaction-drift-alerting");

function parseArgs(args) {
  return lifecycleInternals.parseArgs(args);
}

function buildRepairPlan({ lifecycle, drift }) {
  const driftedCardIds = new Set((drift.drift?.driftedCards || []).map((card) => card.cardId || card.id).filter(Boolean));
  const candidates = lifecycle.reconciledCards
    .filter((card) => card.expectedReactionStatus)
    .map((card) => ({
      cardId: card.cardId,
      expectedReactionStatus: card.expectedReactionStatus,
      committedMismatch: !card.ok,
      liveDriftDetected: driftedCardIds.has(card.cardId),
      repairPreview: !card.ok || driftedCardIds.has(card.cardId),
    }));
  return {
    candidateCount: candidates.length,
    repairPreviewCount: candidates.filter((candidate) => candidate.repairPreview).length,
    candidates,
  };
}

async function buildBoardReactionAutoRepairCanary(input = {}) {
  const drift = await driftAlertingInternals.buildBoardReactionDriftAlerting(input);
  const lifecycle = await lifecycleInternals.buildBoardReactionLifecycleSync(input);
  const repairPlan = buildRepairPlan({ lifecycle, drift });
  const appliedCount = lifecycle.liveReconciledCards.filter((card) => card.applied).length;
  const reasonCodes = [...new Set([
    ...drift.reasonCodes,
    ...lifecycle.reasonCodes,
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: lifecycle.callsDiscordApi || drift.callsDiscordApi,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "board_reaction_auto_repair_canary_ready" : "blocked",
    liveAttempted: lifecycle.liveAttempted || drift.monitor.liveAttempted,
    applyRequested: input.apply === true,
    appliedCount,
    repairPlan,
    drift: {
      detected: drift.driftDetected,
      driftCount: drift.drift.driftCount,
      routeId: drift.notificationRoute.routeId,
    },
    lifecycle: {
      status: lifecycle.status,
      cardCount: lifecycle.board.cardCount,
      mismatchCount: lifecycle.mismatchCount,
      liveMismatchCount: lifecycle.liveMismatchCount,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.auto_repair_canary_ready"
        : "discordos.board_reaction.auto_repair_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.auto_repair_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        repairPreviewCount: repairPlan.repairPreviewCount,
        appliedCount,
        liveAttempted: result.liveAttempted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Auto Repair Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- repair candidates: \`${result.repairPlan.candidateCount}\``,
    `- repair preview count: \`${result.repairPlan.repairPreviewCount}\``,
    `- applied count: \`${result.appliedCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionAutoRepairCanary(options);
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
    parseArgs,
    buildRepairPlan,
    buildBoardReactionAutoRepairCanary,
    renderMarkdown,
  },
};
