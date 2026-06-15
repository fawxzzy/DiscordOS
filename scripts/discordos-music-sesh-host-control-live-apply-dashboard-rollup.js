const {
  _internals: reconciliationInternals,
} = require("./discordos-music-sesh-host-control-live-apply-reconciliation");

function parseArgs(args) {
  return reconciliationInternals.parseArgs(args);
}

function buildHostControlLiveApplyRollup(reconciliationResult) {
  const reconciliation = reconciliationResult.reconciliation || {};
  const applied = reconciliation.liveApplyRequested === true;
  const readbackAttempted = reconciliation.liveReadbackAttempted === true;
  const aligned = reconciliation.dashboardReflectsReadback === true;
  return {
    applyAttemptCount: applied ? 1 : 0,
    readbackAttemptCount: readbackAttempted ? 1 : 0,
    alignedReadbackCount: aligned ? 1 : 0,
    storageExecutedCount: Number(reconciliation.storageExecutedCount || 0),
    modeledAcceptedEventCount: Number(reconciliation.modeledAcceptedEventCount || 0),
    modeledConflictCount: Number(reconciliation.modeledConflictCount || 0),
    persistedSessionCount: Number(reconciliation.persistedSessionCount || 0),
    persistedQueueItemCount: Number(reconciliation.persistedQueueItemCount || 0),
    persistedVoteCount: Number(reconciliation.persistedVoteCount || 0),
    operatorStatus: aligned ? "ready" : "attention_required",
  };
}

function validateHostControlLiveApplyRollup({ reconciliationResult, rollup }) {
  const reasonCodes = [...reconciliationResult.reasonCodes];
  if (reconciliationResult.sendsMessages || reconciliationResult.callsMusicProviders || reconciliationResult.controlsPlayback) {
    reasonCodes.push("host_control_live_apply_rollup_side_effect_boundary_failed");
  }
  if (reconciliationResult.slashCommandsAdmitted) {
    reasonCodes.push("host_control_live_apply_rollup_slash_command_admitted");
  }
  if (rollup.applyAttemptCount > 0 && rollup.readbackAttemptCount === 0) {
    reasonCodes.push("host_control_live_apply_rollup_readback_missing");
  }
  if (rollup.operatorStatus !== "ready") {
    reasonCodes.push("host_control_live_apply_rollup_alignment_required");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlLiveApplyDashboardRollup(input = {}) {
  const reconciliationResult =
    await reconciliationInternals.buildMusicSeshHostControlLiveApplyReconciliation(input);
  const rollup = buildHostControlLiveApplyRollup(reconciliationResult);
  const reasonCodes = validateHostControlLiveApplyRollup({ reconciliationResult, rollup });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: reconciliationResult.callsDiscordApi,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: reconciliationResult.executesStorageWrite,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "host_control_live_apply_dashboard_rollup_ready" : "blocked",
    sourceStatus: reconciliationResult.status,
    rollup,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_live_apply_dashboard_rollup_ready"
        : "discordos.music_sesh.host_control_live_apply_dashboard_rollup_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_live_apply_dashboard_rollup",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        applyAttemptCount: rollup.applyAttemptCount,
        readbackAttemptCount: rollup.readbackAttemptCount,
        operatorStatus: rollup.operatorStatus,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Live Apply Dashboard Rollup",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- operator status: \`${result.rollup.operatorStatus}\``,
    `- apply attempts: \`${result.rollup.applyAttemptCount}\``,
    `- readback attempts: \`${result.rollup.readbackAttemptCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlLiveApplyDashboardRollup(options);
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
    buildHostControlLiveApplyRollup,
    validateHostControlLiveApplyRollup,
    buildMusicSeshHostControlLiveApplyDashboardRollup,
    renderMarkdown,
  },
};
