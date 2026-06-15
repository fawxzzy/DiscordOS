const {
  _internals: reconciliationInternals,
} = require("./discordos-board-reaction-auto-repair-live-apply-reconciliation");

function parseArgs(args) {
  return reconciliationInternals.parseArgs(args);
}

function buildDriftRepairSchedule(reconciliationResult) {
  const reconciliation = reconciliationResult.reconciliation || {};
  const driftCount = Number(reconciliation.driftCount || 0);
  const repairPreviewCount = Number(reconciliation.repairPreviewCount || 0);
  const shouldSchedule = driftCount > 0 || repairPreviewCount > 0;
  return {
    shouldSchedule,
    cadence: shouldSchedule ? "on_drift_detected" : "idle_until_drift",
    admittedCardOnly: true,
    dryRunByDefault: true,
    driftCount,
    repairPreviewCount,
    appliedCount: Number(reconciliation.appliedCount || 0),
    readbackAligned: reconciliation.readbackAligned === true,
  };
}

function validateDriftRepairSchedule({ reconciliationResult, schedule }) {
  const reasonCodes = [...reconciliationResult.reasonCodes];
  if (reconciliationResult.sendsMessages || reconciliationResult.callsMusicProviders || reconciliationResult.controlsPlayback) {
    reasonCodes.push("board_reaction_repair_scheduler_side_effect_boundary_failed");
  }
  if (reconciliationResult.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_repair_scheduler_slash_command_admitted");
  }
  if (!schedule.admittedCardOnly) {
    reasonCodes.push("board_reaction_repair_scheduler_admitted_card_boundary_missing");
  }
  if (!schedule.readbackAligned) {
    reasonCodes.push("board_reaction_repair_scheduler_readback_not_aligned");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionRepairDriftScheduler(input = {}) {
  const reconciliationResult =
    await reconciliationInternals.buildBoardReactionAutoRepairLiveApplyReconciliation(input);
  const schedule = buildDriftRepairSchedule(reconciliationResult);
  const reasonCodes = validateDriftRepairSchedule({ reconciliationResult, schedule });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: reconciliationResult.callsDiscordApi,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "board_reaction_repair_drift_scheduler_ready" : "blocked",
    reconciliationStatus: reconciliationResult.status,
    schedule,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.repair_drift_scheduler_ready"
        : "discordos.board_reaction.repair_drift_scheduler_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.repair_drift_scheduler",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        shouldSchedule: schedule.shouldSchedule,
        driftCount: schedule.driftCount,
        repairPreviewCount: schedule.repairPreviewCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Repair Drift Scheduler",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- cadence: \`${result.schedule.cadence}\``,
    `- should schedule: \`${result.schedule.shouldSchedule ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionRepairDriftScheduler(options);
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
    buildDriftRepairSchedule,
    validateDriftRepairSchedule,
    buildBoardReactionRepairDriftScheduler,
    renderMarkdown,
  },
};
