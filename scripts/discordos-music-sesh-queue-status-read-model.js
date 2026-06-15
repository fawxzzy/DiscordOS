const {
  _internals: readbackInternals,
} = require("./discordos-music-sesh-live-readback");

function parseArgs(args) {
  const options = {
    json: false,
    live: false,
  };

  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--live") {
      options.live = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function buildQueueStatusReadModel(readback = {}) {
  const latestSession = readback.latestSession || null;
  const latestQueueItem = readback.latestQueueItem || null;
  return {
    sessionCount: Number(readback.sessionCount || 0),
    queueItemCount: Number(readback.queueItemCount || 0),
    voteCount: Number(readback.voteCount || 0),
    currentSessionId: latestSession?.session_id || latestSession?.id || null,
    currentState: latestSession?.state || latestSession?.status || "unknown",
    latestQueueItemTitle: latestQueueItem?.item_title || latestQueueItem?.title || null,
    generatedAt: readback.generatedAt || null,
  };
}

async function buildMusicSeshQueueStatusReadModel({
  live = false,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const readback = await readbackInternals.buildMusicSeshLiveReadback({
    live,
    env,
    fetchImpl,
  });
  const model = buildQueueStatusReadModel(readback.readback || {});
  const result = {
    ok: readback.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    liveAttempted: readback.liveAttempted,
    status: readback.ok ? "queue_status_ready" : "blocked",
    model,
    readback: {
      status: readback.status,
      summary: readback.summary,
    },
    reasonCodes: readback.reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.queue_status_ready"
        : "discordos.music_sesh.queue_status_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.queue_status",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveAttempted: result.liveAttempted,
        queueItemCount: model.queueItemCount,
        voteCount: model.voteCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Queue Status",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- sessions: \`${result.model.sessionCount}\``,
    `- queue items: \`${result.model.queueItemCount}\``,
    `- votes: \`${result.model.voteCount}\``,
    `- current state: \`${result.model.currentState}\``,
    `- latest queue item: \`${result.model.latestQueueItemTitle || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshQueueStatusReadModel(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) {
      process.exitCode = 1;
    }
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
    buildQueueStatusReadModel,
    buildMusicSeshQueueStatusReadModel,
    renderMarkdown,
  },
};
