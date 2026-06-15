function parseArgs(args) {
  const options = {
    json: false,
    sessionId: "music-sesh-smoke",
    includeDuplicate: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--include-duplicate") {
      options.includeDuplicate = true;
    } else if (arg === "--session-id") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_session_id_value");
      }
      options.sessionId = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function buildReplayEvents({ sessionId = "music-sesh-smoke", includeDuplicate = false } = {}) {
  const events = [
    { eventId: `${sessionId}:1`, action: "open_session", sessionId },
    { eventId: `${sessionId}:2`, action: "queue_item", sessionId, queueItemId: `${sessionId}:track-a`, title: "Track A" },
    { eventId: `${sessionId}:3`, action: "vote", sessionId, queueItemId: `${sessionId}:track-a`, actorFingerprint: "actor-a", direction: "up" },
    { eventId: `${sessionId}:4`, action: "lock_session", sessionId },
    { eventId: `${sessionId}:5`, action: "close_session", sessionId },
  ];
  return includeDuplicate ? [...events, { ...events[2] }] : events;
}

function replayEvents(events) {
  const seen = new Set();
  const state = {
    sessionState: "new",
    queueItems: new Map(),
    votes: new Map(),
    duplicateEventCount: 0,
  };

  for (const event of events) {
    if (seen.has(event.eventId)) {
      state.duplicateEventCount += 1;
      continue;
    }
    seen.add(event.eventId);

    if (event.action === "open_session") {
      state.sessionState = "open";
    } else if (event.action === "queue_item") {
      state.queueItems.set(event.queueItemId, {
        queueItemId: event.queueItemId,
        title: event.title,
        state: "queued",
      });
    } else if (event.action === "vote") {
      state.votes.set(`${event.queueItemId}:${event.actorFingerprint}`, {
        queueItemId: event.queueItemId,
        actorFingerprint: event.actorFingerprint,
        direction: event.direction,
      });
    } else if (event.action === "lock_session") {
      state.sessionState = "locked";
    } else if (event.action === "close_session") {
      state.sessionState = "closed";
    }
  }

  return {
    sessionState: state.sessionState,
    queueItemCount: state.queueItems.size,
    voteCount: state.votes.size,
    duplicateEventCount: state.duplicateEventCount,
    appliedEventCount: seen.size,
  };
}

function buildMusicSeshQueueReplayProof(input = {}) {
  const events = buildReplayEvents(input);
  const replay = replayEvents(events);
  const reasonCodes = [];
  if (replay.sessionState !== "closed") {
    reasonCodes.push("session_replay_not_closed");
  }
  if (replay.queueItemCount < 1) {
    reasonCodes.push("queue_replay_missing_item");
  }

  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    writesStorage: false,
    status: reasonCodes.length === 0 ? "replay_proof_ready" : "blocked",
    eventCount: events.length,
    replay,
    idempotent: replay.duplicateEventCount === 0 || replay.appliedEventCount < events.length,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyMusicSeshQueueReplayProofEvent(result),
  };
}

function classifyMusicSeshQueueReplayProofEvent(result) {
  return {
    type: result.ok
      ? "discordos.music_sesh.queue_replay_proof_ready"
      : "discordos.music_sesh.queue_replay_proof_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.music_sesh.queue_replay_proof",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      eventCount: result.eventCount,
      appliedEventCount: result.replay.appliedEventCount,
      duplicateEventCount: result.replay.duplicateEventCount,
      queueItemCount: result.replay.queueItemCount,
      voteCount: result.replay.voteCount,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Queue Replay Proof",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes storage: \`${result.writesStorage ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- events: \`${result.eventCount}\``,
    `- applied events: \`${result.replay.appliedEventCount}\``,
    `- duplicate events: \`${result.replay.duplicateEventCount}\``,
    `- session state: \`${result.replay.sessionState}\``,
    `- queue items: \`${result.replay.queueItemCount}\``,
    `- votes: \`${result.replay.voteCount}\``,
    `- idempotent: \`${result.idempotent ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildMusicSeshQueueReplayProof(options);
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
    buildReplayEvents,
    replayEvents,
    buildMusicSeshQueueReplayProof,
    classifyMusicSeshQueueReplayProofEvent,
    renderMarkdown,
  },
};
