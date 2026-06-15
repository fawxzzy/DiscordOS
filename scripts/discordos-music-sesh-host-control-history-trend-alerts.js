const {
  _internals: historyInternals,
} = require("./discordos-music-sesh-host-control-rollup-history-persistence");

function parseArgs(args) {
  return historyInternals.parseArgs(args);
}

function buildTrendAlertSummary({ latest, history = [] }) {
  const records = Array.isArray(history) && history.length > 0 ? history : [latest].filter(Boolean);
  const conflictRecords = records.filter((record) => Number(record.modeledConflictCount || 0) > 0);
  const driftRecords = records.filter((record) =>
    Number(record.readbackAttemptCount || 0) > Number(record.alignedReadbackCount || 0)
      || record.operatorStatus === "attention_required"
  );
  const repeatedConflict = conflictRecords.length >= 2;
  const repeatedReadbackDrift = driftRecords.length >= 2;
  const attentionRequired = repeatedConflict || repeatedReadbackDrift;
  return {
    recordCount: records.length,
    conflictRecordCount: conflictRecords.length,
    driftRecordCount: driftRecords.length,
    repeatedConflict,
    repeatedReadbackDrift,
    attentionRequired,
    alertLevel: attentionRequired ? "watch" : "clear",
    sendsMessages: false,
    controlsPlayback: false,
  };
}

function validateTrendAlerts({ historyResult, trend }) {
  const reasonCodes = [...historyResult.reasonCodes];
  if (historyResult.sendsMessages || historyResult.callsMusicProviders || historyResult.controlsPlayback) {
    reasonCodes.push("host_control_history_trend_alerts_side_effect_boundary_failed");
  }
  if (historyResult.slashCommandsAdmitted) {
    reasonCodes.push("host_control_history_trend_alerts_slash_command_admitted");
  }
  if (trend.sendsMessages || trend.controlsPlayback) {
    reasonCodes.push("host_control_history_trend_alerts_action_boundary_failed");
  }
  if (trend.recordCount < 1) {
    reasonCodes.push("host_control_history_trend_alerts_history_empty");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshHostControlHistoryTrendAlerts(input = {}) {
  const historyResult = await historyInternals.buildMusicSeshHostControlRollupHistoryPersistence(input);
  const trend = buildTrendAlertSummary({
    latest: historyResult.latest,
    history: input.history || [historyResult.latest],
  });
  const reasonCodes = validateTrendAlerts({ historyResult, trend });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "host_control_history_trend_alerts_ready" : "blocked",
    sourceStatus: historyResult.status,
    trend,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_history_trend_alerts_ready"
        : "discordos.music_sesh.host_control_history_trend_alerts_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_history_trend_alerts",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertLevel: trend.alertLevel,
        conflictRecordCount: trend.conflictRecordCount,
        driftRecordCount: trend.driftRecordCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control History Trend Alerts",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- alert level: \`${result.trend.alertLevel}\``,
    `- conflict records: \`${result.trend.conflictRecordCount}\``,
    `- drift records: \`${result.trend.driftRecordCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlHistoryTrendAlerts(options);
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
    buildTrendAlertSummary,
    validateTrendAlerts,
    buildMusicSeshHostControlHistoryTrendAlerts,
    renderMarkdown,
  },
};
