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
  const currentSessionId = latestSession?.session_id || latestSession?.sessionId || latestSession?.id || null;
  const currentState = latestSession?.state || latestSession?.currentState || latestSession?.status || "unknown";
  const latestQueueItemTitle = latestQueueItem?.item_title
    || latestQueueItem?.itemTitle
    || latestQueueItem?.title
    || latestQueueItem?.queueItemId
    || latestQueueItem?.queue_item_id
    || null;

  return {
    sessionCount: Number(readback.sessionCount || 0),
    queueItemCount: Number(readback.queueItemCount || 0),
    voteCount: Number(readback.voteCount || 0),
    currentSessionId,
    currentState,
    latestQueueItemTitle,
    generatedAt: readback.generatedAt || null,
  };
}

function buildUserStatusResponse(model = {}) {
  const sessionLabel = model.currentSessionId || "no active session";
  const queueSummary = `${Number(model.queueItemCount || 0)} queued`;
  const voteSummary = `${Number(model.voteCount || 0)} vote${Number(model.voteCount || 0) === 1 ? "" : "s"}`;
  const latestItem = model.latestQueueItemTitle
    ? `Latest: ${model.latestQueueItemTitle}.`
    : "No latest queue item yet.";

  return {
    content: `Music Sesh status: ${sessionLabel} is ${model.currentState || "unknown"}; ${queueSummary}; ${voteSummary}. ${latestItem}`,
    ephemeralPreferred: false,
    allowedMentionsDisabled: true,
  };
}

function contentHasUnsafeMentions(content) {
  return /<@!?&?\d+>|@everyone|@here/i.test(String(content || ""));
}

function buildUserStatusResponseReadback(model = {}, response = {}) {
  const content = String(response.content || "");
  const reasonCodes = [];
  const queuedLabel = `${Number(model.queueItemCount || 0)} queued`;
  const voteLabel = `${Number(model.voteCount || 0)} vote${Number(model.voteCount || 0) === 1 ? "" : "s"}`;

  if (!content.includes(model.currentSessionId || "no active session")) {
    reasonCodes.push("status_response_session_mismatch");
  }
  if (!content.includes(model.currentState || "unknown")) {
    reasonCodes.push("status_response_state_mismatch");
  }
  if (!content.includes(queuedLabel)) {
    reasonCodes.push("status_response_queue_count_mismatch");
  }
  if (!content.includes(voteLabel)) {
    reasonCodes.push("status_response_vote_count_mismatch");
  }
  if (contentHasUnsafeMentions(content)) {
    reasonCodes.push("status_response_unsafe_mentions");
  }
  if (response.allowedMentionsDisabled !== true) {
    reasonCodes.push("status_response_mentions_not_disabled");
  }

  return {
    ok: reasonCodes.length === 0,
    contentPresent: content.length > 0,
    noUnsafeMentions: !contentHasUnsafeMentions(content),
    allowedMentionsDisabled: response.allowedMentionsDisabled === true,
    alignedWithModel: reasonCodes.length === 0,
    reasonCodes,
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
  const userResponse = buildUserStatusResponse(model);
  const responseReadback = buildUserStatusResponseReadback(model, userResponse);
  const reasonCodes = [...new Set([
    ...readback.reasonCodes,
    ...responseReadback.reasonCodes,
  ])];
  const result = {
    ok: readback.ok && responseReadback.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    liveAttempted: readback.liveAttempted,
    status: readback.ok && responseReadback.ok ? "queue_status_ready" : "blocked",
    model,
    userResponse,
    responseReadback,
    readback: {
      status: readback.status,
      summary: readback.summary,
    },
    reasonCodes,
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
    `- user response: \`${result.userResponse.content}\``,
    `- response aligned: \`${result.responseReadback.alignedWithModel ? "true" : "false"}\``,
    `- unsafe mentions: \`${result.responseReadback.noUnsafeMentions ? "false" : "true"}\``,
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
    buildUserStatusResponse,
    contentHasUnsafeMentions,
    buildUserStatusResponseReadback,
    buildMusicSeshQueueStatusReadModel,
    renderMarkdown,
  },
};
