const {
  _internals: schedulerInternals,
} = require("./discordos-board-reaction-repair-drift-scheduler");

function parseArgs(args) {
  const parsed = schedulerInternals.parseArgs(args);
  return {
    ...parsed,
    apply: args.includes("--apply"),
  };
}

function buildGuardedApplyPlan({ schedulerResult, apply = false }) {
  const schedule = schedulerResult.schedule || {};
  const driftBacked = Number(schedule.driftCount || 0) > 0 || Number(schedule.repairPreviewCount || 0) > 0;
  return {
    mode: apply && driftBacked ? "guarded_apply_on_drift" : "preview_or_idle",
    wouldApply: apply === true && driftBacked === true,
    driftBacked,
    admittedCardOnly: schedule.admittedCardOnly === true,
    skipsAlignedCards: schedule.readbackAligned === true && driftBacked === false,
    usesCustomReactionGuard: true,
    requiresReadback: true,
    cadence: schedule.cadence || "idle_until_drift",
  };
}

function validateGuardedApply({ schedulerResult, plan }) {
  const reasonCodes = [...schedulerResult.reasonCodes];
  if (schedulerResult.sendsMessages || schedulerResult.callsMusicProviders || schedulerResult.controlsPlayback) {
    reasonCodes.push("board_reaction_scheduler_guarded_apply_side_effect_boundary_failed");
  }
  if (schedulerResult.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_scheduler_guarded_apply_slash_command_admitted");
  }
  if (!plan.admittedCardOnly) {
    reasonCodes.push("board_reaction_scheduler_guarded_apply_admitted_card_boundary_missing");
  }
  if (!plan.usesCustomReactionGuard || !plan.requiresReadback) {
    reasonCodes.push("board_reaction_scheduler_guarded_apply_guard_missing");
  }
  if (!plan.driftBacked && !plan.skipsAlignedCards) {
    reasonCodes.push("board_reaction_scheduler_guarded_apply_aligned_skip_missing");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionSchedulerGuardedApply(input = {}) {
  const schedulerResult = await schedulerInternals.buildBoardReactionRepairDriftScheduler(input);
  const plan = buildGuardedApplyPlan({ schedulerResult, apply: input.apply });
  const reasonCodes = validateGuardedApply({ schedulerResult, plan });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: plan.wouldApply,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "board_reaction_scheduler_guarded_apply_ready" : "blocked",
    sourceStatus: schedulerResult.status,
    plan,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.scheduler_guarded_apply_ready"
        : "discordos.board_reaction.scheduler_guarded_apply_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.scheduler_guarded_apply",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        mode: plan.mode,
        driftBacked: plan.driftBacked,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Scheduler Guarded Apply",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- mode: \`${result.plan.mode}\``,
    `- drift backed: \`${result.plan.driftBacked ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionSchedulerGuardedApply(options);
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
    buildGuardedApplyPlan,
    validateGuardedApply,
    buildBoardReactionSchedulerGuardedApply,
    renderMarkdown,
  },
};
