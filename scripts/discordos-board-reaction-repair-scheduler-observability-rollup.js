const {
  _internals: guardedApplyInternals,
} = require("./discordos-board-reaction-scheduler-guarded-apply");

function parseArgs(args) {
  return guardedApplyInternals.parseArgs(args);
}

function buildSchedulerObservabilityRollup(guardedResult) {
  const plan = guardedResult.plan || {};
  return {
    repairAttemptCount: plan.wouldApply ? 1 : 0,
    skippedAlignedCardCount: plan.skipsAlignedCards ? 1 : 0,
    driftBackedRepairCount: plan.driftBacked ? 1 : 0,
    readbackRequiredCount: plan.requiresReadback ? 1 : 0,
    customReactionGuardCount: plan.usesCustomReactionGuard ? 1 : 0,
    operatorStatus: plan.driftBacked && !plan.wouldApply ? "awaiting_apply_guard" : "ready",
  };
}

function validateSchedulerObservabilityRollup({ guardedResult, rollup }) {
  const reasonCodes = [...guardedResult.reasonCodes];
  if (guardedResult.sendsMessages || guardedResult.callsMusicProviders || guardedResult.controlsPlayback) {
    reasonCodes.push("board_reaction_scheduler_observability_side_effect_boundary_failed");
  }
  if (guardedResult.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_scheduler_observability_slash_command_admitted");
  }
  if (rollup.readbackRequiredCount < 1 || rollup.customReactionGuardCount < 1) {
    reasonCodes.push("board_reaction_scheduler_observability_guard_missing");
  }
  if (rollup.operatorStatus !== "ready" && rollup.operatorStatus !== "awaiting_apply_guard") {
    reasonCodes.push("board_reaction_scheduler_observability_status_invalid");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionRepairSchedulerObservabilityRollup(input = {}) {
  const guardedResult = await guardedApplyInternals.buildBoardReactionSchedulerGuardedApply(input);
  const rollup = buildSchedulerObservabilityRollup(guardedResult);
  const reasonCodes = validateSchedulerObservabilityRollup({ guardedResult, rollup });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "board_reaction_repair_scheduler_observability_rollup_ready" : "blocked",
    sourceStatus: guardedResult.status,
    rollup,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.repair_scheduler_observability_rollup_ready"
        : "discordos.board_reaction.repair_scheduler_observability_rollup_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.repair_scheduler_observability_rollup",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        repairAttemptCount: rollup.repairAttemptCount,
        skippedAlignedCardCount: rollup.skippedAlignedCardCount,
        operatorStatus: rollup.operatorStatus,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Repair Scheduler Observability Rollup",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- operator status: \`${result.rollup.operatorStatus}\``,
    `- skipped aligned cards: \`${result.rollup.skippedAlignedCardCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionRepairSchedulerObservabilityRollup(options);
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
    buildSchedulerObservabilityRollup,
    validateSchedulerObservabilityRollup,
    buildBoardReactionRepairSchedulerObservabilityRollup,
    renderMarkdown,
  },
};
