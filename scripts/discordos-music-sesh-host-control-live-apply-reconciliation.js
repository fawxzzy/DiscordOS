const {
  _internals: dashboardInternals,
} = require("./discordos-music-sesh-host-controls-persisted-state-dashboard");

function parseArgs(args) {
  return dashboardInternals.parseArgs(args);
}

function buildHostControlApplyReconciliation(dashboardResult) {
  const dashboard = dashboardResult.dashboard || {};
  const liveApplyRequested = dashboardResult.executesStorageWrite === true;
  return {
    liveApplyRequested,
    liveReadbackAttempted: dashboardResult.liveAttempted === true,
    storageExecutedCount: Number(dashboard.storageExecutedCount || 0),
    modeledAcceptedEventCount: Number(dashboard.modeledAcceptedEventCount || 0),
    modeledConflictCount: Number(dashboard.modeledConflictCount || 0),
    persistedSessionCount: Number(dashboard.persistedSessionCount || 0),
    persistedQueueItemCount: Number(dashboard.persistedQueueItemCount || 0),
    persistedVoteCount: Number(dashboard.persistedVoteCount || 0),
    dashboardReflectsReadback: dashboardResult.liveAttempted === true
      ? dashboard.latestSessionPresent === true || dashboard.persistedSessionCount > 0
      : true,
  };
}

function validateHostControlApplyReconciliation({ dashboardResult, reconciliation }) {
  const reasonCodes = [...dashboardResult.reasonCodes];
  if (dashboardResult.sendsMessages || dashboardResult.callsMusicProviders || dashboardResult.controlsPlayback) {
    reasonCodes.push("host_control_live_apply_reconciliation_side_effect_boundary_failed");
  }
  if (dashboardResult.slashCommandsAdmitted) {
    reasonCodes.push("host_control_live_apply_reconciliation_slash_command_admitted");
  }
  if (dashboardResult.executesStorageWrite && !dashboardResult.liveAttempted) {
    reasonCodes.push("host_control_live_apply_reconciliation_readback_not_attempted");
  }
  if (!reconciliation.dashboardReflectsReadback) {
    reasonCodes.push("host_control_live_apply_reconciliation_readback_not_reflected");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlLiveApplyReconciliation(input = {}) {
  const dashboardResult = await dashboardInternals.buildMusicSeshHostControlsPersistedStateDashboard(input);
  const reconciliation = buildHostControlApplyReconciliation(dashboardResult);
  const reasonCodes = validateHostControlApplyReconciliation({ dashboardResult, reconciliation });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: dashboardResult.callsDiscordApi,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: dashboardResult.executesStorageWrite,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "host_control_live_apply_reconciliation_ready" : "blocked",
    dashboardStatus: dashboardResult.status,
    reconciliation,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_live_apply_reconciliation_ready"
        : "discordos.music_sesh.host_control_live_apply_reconciliation_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_live_apply_reconciliation",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        executesStorageWrite: result.executesStorageWrite,
        liveReadbackAttempted: reconciliation.liveReadbackAttempted,
        storageExecutedCount: reconciliation.storageExecutedCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Live Apply Reconciliation",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- readback attempted: \`${result.reconciliation.liveReadbackAttempted ? "true" : "false"}\``,
    `- persisted sessions: \`${result.reconciliation.persistedSessionCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlLiveApplyReconciliation(options);
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
    buildHostControlApplyReconciliation,
    validateHostControlApplyReconciliation,
    buildMusicSeshHostControlLiveApplyReconciliation,
    renderMarkdown,
  },
};
