const {
  _internals: autoRepairInternals,
} = require("./discordos-board-reaction-auto-repair-canary");

function parseArgs(args) {
  return autoRepairInternals.parseArgs(args);
}

function buildLiveApplyReconciliation(autoRepair) {
  return {
    liveAttempted: autoRepair.liveAttempted === true,
    applyRequested: autoRepair.applyRequested === true,
    appliedCount: Number(autoRepair.appliedCount || 0),
    liveMismatchCount: Number(autoRepair.lifecycle.liveMismatchCount || 0),
    repairPreviewCount: Number(autoRepair.repairPlan.repairPreviewCount || 0),
    driftCount: Number(autoRepair.drift.driftCount || 0),
    readbackAligned: Number(autoRepair.lifecycle.liveMismatchCount || 0) === 0,
  };
}

function validateLiveApplyReconciliation({ autoRepair, reconciliation }) {
  const reasonCodes = [...autoRepair.reasonCodes];
  if (autoRepair.sendsMessages || autoRepair.callsMusicProviders || autoRepair.controlsPlayback) {
    reasonCodes.push("board_reaction_auto_repair_live_apply_side_effect_boundary_failed");
  }
  if (autoRepair.slashCommandsAdmitted) {
    reasonCodes.push("board_reaction_auto_repair_live_apply_slash_command_admitted");
  }
  if (autoRepair.applyRequested && !reconciliation.liveAttempted) {
    reasonCodes.push("board_reaction_auto_repair_live_apply_readback_not_attempted");
  }
  if (!reconciliation.readbackAligned) {
    reasonCodes.push("board_reaction_auto_repair_live_apply_readback_not_aligned");
  }
  return [...new Set(reasonCodes)];
}

async function buildBoardReactionAutoRepairLiveApplyReconciliation(input = {}) {
  const autoRepair = await autoRepairInternals.buildBoardReactionAutoRepairCanary(input);
  const reconciliation = buildLiveApplyReconciliation(autoRepair);
  const reasonCodes = validateLiveApplyReconciliation({ autoRepair, reconciliation });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: autoRepair.callsDiscordApi,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "board_reaction_auto_repair_live_apply_reconciliation_ready" : "blocked",
    reconciliation,
    autoRepair: {
      status: autoRepair.status,
      cardCount: autoRepair.lifecycle.cardCount,
      repairPreviewCount: autoRepair.repairPlan.repairPreviewCount,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_reaction.auto_repair_live_apply_reconciliation_ready"
        : "discordos.board_reaction.auto_repair_live_apply_reconciliation_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_reaction.auto_repair_live_apply_reconciliation",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveAttempted: reconciliation.liveAttempted,
        appliedCount: reconciliation.appliedCount,
        liveMismatchCount: reconciliation.liveMismatchCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Reaction Auto Repair Live Apply Reconciliation",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- live attempted: \`${result.reconciliation.liveAttempted ? "true" : "false"}\``,
    `- applied count: \`${result.reconciliation.appliedCount}\``,
    `- readback aligned: \`${result.reconciliation.readbackAligned ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardReactionAutoRepairLiveApplyReconciliation(options);
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
    buildLiveApplyReconciliation,
    validateLiveApplyReconciliation,
    buildBoardReactionAutoRepairLiveApplyReconciliation,
    renderMarkdown,
  },
};
