const {
  _internals: rollupInternals,
} = require("./discordos-music-sesh-host-control-live-apply-dashboard-rollup");

function parseArgs(args) {
  return rollupInternals.parseArgs(args);
}

function buildRollupHistoryRecord({ rollupResult, now = new Date("2026-06-15T00:00:00.000Z") }) {
  const rollup = rollupResult.rollup || {};
  return {
    schemaVersion: 1,
    capturedAt: now.toISOString(),
    sourceStatus: rollupResult.status,
    operatorStatus: rollup.operatorStatus || "unknown",
    applyAttemptCount: Number(rollup.applyAttemptCount || 0),
    readbackAttemptCount: Number(rollup.readbackAttemptCount || 0),
    alignedReadbackCount: Number(rollup.alignedReadbackCount || 0),
    storageExecutedCount: Number(rollup.storageExecutedCount || 0),
    modeledAcceptedEventCount: Number(rollup.modeledAcceptedEventCount || 0),
    modeledConflictCount: Number(rollup.modeledConflictCount || 0),
  };
}

function buildBoundedHistory({ existingRecords = [], record, limit = 12 }) {
  const safeExisting = Array.isArray(existingRecords) ? existingRecords : [];
  return [...safeExisting, record].slice(Math.max(0, safeExisting.length + 1 - limit));
}

function validateRollupHistoryPersistence({ rollupResult, history, record }) {
  const reasonCodes = [...rollupResult.reasonCodes];
  if (rollupResult.sendsMessages || rollupResult.callsMusicProviders || rollupResult.controlsPlayback) {
    reasonCodes.push("host_control_rollup_history_side_effect_boundary_failed");
  }
  if (rollupResult.slashCommandsAdmitted) {
    reasonCodes.push("host_control_rollup_history_slash_command_admitted");
  }
  if (!record.capturedAt || Number.isNaN(Date.parse(record.capturedAt))) {
    reasonCodes.push("host_control_rollup_history_timestamp_invalid");
  }
  if (!Array.isArray(history) || history.length === 0) {
    reasonCodes.push("host_control_rollup_history_empty");
  }
  if (history.length > 12) {
    reasonCodes.push("host_control_rollup_history_unbounded");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlRollupHistoryPersistence(input = {}) {
  const rollupResult = await rollupInternals.buildMusicSeshHostControlLiveApplyDashboardRollup(input);
  const record = buildRollupHistoryRecord({ rollupResult, now: input.now });
  const history = buildBoundedHistory({
    existingRecords: input.existingRecords,
    record,
    limit: input.limit || 12,
  });
  const reasonCodes = validateRollupHistoryPersistence({ rollupResult, history, record });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: rollupResult.callsDiscordApi,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "host_control_rollup_history_persistence_ready" : "blocked",
    retention: {
      limit: input.limit || 12,
      retainedCount: history.length,
      latestCapturedAt: record.capturedAt,
    },
    latest: record,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_rollup_history_persistence_ready"
        : "discordos.music_sesh.host_control_rollup_history_persistence_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_rollup_history_persistence",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        retainedCount: history.length,
        operatorStatus: record.operatorStatus,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Rollup History Persistence",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- retained count: \`${result.retention.retainedCount}\``,
    `- operator status: \`${result.latest.operatorStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlRollupHistoryPersistence(options);
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
    buildRollupHistoryRecord,
    buildBoundedHistory,
    validateRollupHistoryPersistence,
    buildMusicSeshHostControlRollupHistoryPersistence,
    renderMarkdown,
  },
};
