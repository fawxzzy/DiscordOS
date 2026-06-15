const {
  _internals: conflictInternals,
} = require("./discordos-music-sesh-queue-conflict-host-controls");
const {
  _internals: writeGuardInternals,
} = require("./discordos-music-sesh-write-adapter-guard");
const {
  _internals: readbackInternals,
} = require("./discordos-music-sesh-live-readback");

const CANARY_SESSION_ID = "music-sesh-host-control-live-storage-canary";

function parseArgs(args) {
  const options = {
    json: false,
    live: false,
    allowStorageWrite: false,
    apply: false,
    sessionId: CANARY_SESSION_ID,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--live") {
      options.live = true;
    } else if (arg === "--allow-storage-write") {
      options.allowStorageWrite = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === "--session-id") {
      const value = args[index + 1];
      if (!value) throw new Error("missing_session_id_value");
      options.sessionId = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function buildHostControlCanaryEvents(sessionId = CANARY_SESSION_ID) {
  return conflictInternals.DEFAULT_EVENTS.map((event) => ({
    ...event,
    sessionId,
  }));
}

function buildStorageCanaryActions(sessionId = CANARY_SESSION_ID) {
  return [
    {
      action: "open_session",
      itemTitle: null,
      expectedState: "open",
    },
    {
      action: "queue_item",
      itemTitle: "Host Control Canary Track",
      expectedState: "queued",
    },
    {
      action: "vote",
      itemTitle: "Host Control Canary Track",
      voteDirection: "down",
      expectedState: "voted",
    },
    {
      action: "close_session",
      itemTitle: null,
      expectedState: "closed",
    },
  ].map((item) => ({
    ...item,
    sessionId,
    guildId: "1504668396338413670",
    channelId: "1508139160853286942",
    actorDiscordUserId: "1515220075366580224",
  }));
}

function validateCanary({ conflictResult, writeResults, readback }) {
  const reasonCodes = [];
  if (!conflictResult.ok) {
    reasonCodes.push("host_control_conflict_model_not_ready");
  }
  if (writeResults.some((result) => !result.ok)) {
    reasonCodes.push("host_control_storage_preview_not_ready");
  }
  if (writeResults.some((result) => result.sendsMessages || result.callsMusicProviders || result.controlsPlayback)) {
    reasonCodes.push("host_control_storage_side_effect_boundary_failed");
  }
  if (readback && !readback.ok) {
    reasonCodes.push("host_control_live_readback_failed");
  }
  return reasonCodes;
}

async function buildMusicSeshHostControlLiveStorageCanary({
  env = process.env,
  fetchImpl = fetch,
  live = false,
  allowStorageWrite = false,
  apply = false,
  sessionId = CANARY_SESSION_ID,
} = {}) {
  const conflictResult = conflictInternals.buildMusicSeshQueueConflictHostControls({
    events: buildHostControlCanaryEvents(sessionId),
  });
  const actions = buildStorageCanaryActions(sessionId);
  const writeResults = [];
  for (const action of actions) {
    writeResults.push(await writeGuardInternals.buildMusicSeshWriteAdapterGuard({
      ...action,
      allowStorageWrite,
      apply,
      env,
      fetchImpl,
    }));
  }
  const readback = await readbackInternals.buildMusicSeshLiveReadback({
    live,
    env,
    fetchImpl,
  });
  const reasonCodes = validateCanary({ conflictResult, writeResults, readback });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: writeResults.some((resultItem) => resultItem.executesStorageWrite),
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "host_control_live_storage_canary_ready" : "blocked",
    sessionId,
    conflictSummary: conflictResult.summary,
    storageCanary: {
      actionCount: writeResults.length,
      admittedCount: writeResults.filter((resultItem) => resultItem.storageWritesAllowed).length,
      executedCount: writeResults.filter((resultItem) => resultItem.executesStorageWrite).length,
      payloadsParameterized: writeResults.every((resultItem) => resultItem.storageWritePreview.parameterized === true),
      statuses: writeResults.map((resultItem) => resultItem.adapterStatus),
    },
    readback: {
      liveAttempted: readback.liveAttempted,
      status: readback.status,
      summary: readback.summary,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.host_control_live_storage_canary_ready"
        : "discordos.music_sesh.host_control_live_storage_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.host_control_live_storage_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        actionCount: result.storageCanary.actionCount,
        executedCount: result.storageCanary.executedCount,
        liveAttempted: result.readback.liveAttempted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Host Control Live Storage Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- storage actions: \`${result.storageCanary.actionCount}\``,
    `- storage executed: \`${result.storageCanary.executedCount}\``,
    `- readback live attempted: \`${result.readback.liveAttempted ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshHostControlLiveStorageCanary(options);
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
    CANARY_SESSION_ID,
    parseArgs,
    buildHostControlCanaryEvents,
    buildStorageCanaryActions,
    validateCanary,
    buildMusicSeshHostControlLiveStorageCanary,
    renderMarkdown,
  },
};
