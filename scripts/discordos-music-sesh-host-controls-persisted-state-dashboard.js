const {
  _internals: canaryInternals,
} = require("./discordos-music-sesh-host-control-live-storage-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildPersistedStateDashboard(canary) {
  const summary = canary.conflictSummary || {};
  const readbackSummary = canary.readback?.summary || {};
  const storage = canary.storageCanary || {};
  return {
    sessionId: canary.sessionId,
    modeledSessionState: summary.sessionState || "unknown",
    modeledQueueItemCount: Array.isArray(summary.queueItems) ? summary.queueItems.length : 0,
    modeledVoteCount: Number(summary.voteCount || 0),
    modeledAcceptedEventCount: Array.isArray(summary.accepted) ? summary.accepted.length : 0,
    modeledConflictCount: Array.isArray(summary.conflicts) ? summary.conflicts.length : 0,
    persistedSessionCount: Number(readbackSummary.sessionCount || 0),
    persistedQueueItemCount: Number(readbackSummary.queueItemCount || 0),
    persistedVoteCount: Number(readbackSummary.voteCount || 0),
    latestSessionPresent: Boolean(readbackSummary.latestSessionPresent),
    storageActionCount: Number(storage.actionCount || 0),
    storageExecutedCount: Number(storage.executedCount || 0),
    payloadsParameterized: storage.payloadsParameterized === true,
  };
}

function validatePersistedStateDashboard({ canary, dashboard }) {
  const reasonCodes = [...canary.reasonCodes];
  if (canary.sendsMessages || canary.callsMusicProviders || canary.controlsPlayback) {
    reasonCodes.push("host_controls_persisted_state_dashboard_side_effect_boundary_failed");
  }
  if (canary.slashCommandsAdmitted) {
    reasonCodes.push("host_controls_persisted_state_dashboard_slash_command_admitted");
  }
  if (!dashboard.payloadsParameterized) {
    reasonCodes.push("host_controls_persisted_state_dashboard_payloads_not_parameterized");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlsPersistedStateDashboard(input = {}) {
  const canary = await canaryInternals.buildMusicSeshHostControlLiveStorageCanary(input);
  const dashboard = buildPersistedStateDashboard(canary);
  const reasonCodes = validatePersistedStateDashboard({ canary, dashboard });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: canary.callsDiscordApi,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: canary.executesStorageWrite,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "host_controls_persisted_state_dashboard_ready" : "blocked",
    liveAttempted: canary.readback.liveAttempted,
    dashboard,
    canary: {
      status: canary.status,
      storageStatusCount: canary.storageCanary.statuses.length,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_controls_persisted_state_dashboard_ready"
        : "discordos.music_sesh.host_controls_persisted_state_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_controls_persisted_state_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveAttempted: result.liveAttempted,
        persistedSessionCount: dashboard.persistedSessionCount,
        storageExecutedCount: dashboard.storageExecutedCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Controls Persisted State Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- modeled state: \`${result.dashboard.modeledSessionState}\``,
    `- persisted sessions: \`${result.dashboard.persistedSessionCount}\``,
    `- persisted queue items: \`${result.dashboard.persistedQueueItemCount}\``,
    `- persisted votes: \`${result.dashboard.persistedVoteCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlsPersistedStateDashboard(options);
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
    buildPersistedStateDashboard,
    validatePersistedStateDashboard,
    buildMusicSeshHostControlsPersistedStateDashboard,
    renderMarkdown,
  },
};
