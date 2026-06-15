const HOST_ACTIONS = new Set(["open_session", "lock_session", "close_session"]);

const DEFAULT_EVENTS = [
  { id: "open-1", action: "open_session", actorRole: "host" },
  { id: "queue-1", action: "queue_item", actorRole: "member", itemId: "track-a" },
  { id: "lock-1", action: "lock_session", actorRole: "host" },
  { id: "queue-locked", action: "queue_item", actorRole: "member", itemId: "track-b" },
  { id: "vote-1", action: "vote", actorRole: "member", actorId: "user-1", itemId: "track-a", voteDirection: "down" },
  { id: "vote-duplicate", action: "vote", actorRole: "member", actorId: "user-1", itemId: "track-a", voteDirection: "down" },
  { id: "close-1", action: "close_session", actorRole: "host" },
  { id: "lock-closed", action: "lock_session", actorRole: "host" },
  { id: "queue-closed", action: "queue_item", actorRole: "member", itemId: "track-c" },
];

function parseArgs(args) {
  const options = {
    json: false,
    scenario: "default",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--scenario") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_scenario_value");
      }
      options.scenario = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function buildInitialState() {
  return {
    sessionState: "none",
    queueItems: [],
    votesByActorItem: new Map(),
    accepted: [],
    conflicts: [],
  };
}

function conflict(event, reasonCode) {
  return {
    eventId: event.id || null,
    action: event.action || null,
    reasonCode,
  };
}

function applyEvent(state, event = {}) {
  const next = {
    sessionState: state.sessionState,
    queueItems: [...state.queueItems],
    votesByActorItem: new Map(state.votesByActorItem),
    accepted: [...state.accepted],
    conflicts: [...state.conflicts],
  };

  if (HOST_ACTIONS.has(event.action) && event.actorRole !== "host") {
    next.conflicts.push(conflict(event, "host_action_requires_host"));
    return next;
  }
  if (next.sessionState === "closed" && event.action !== "open_session") {
    next.conflicts.push(conflict(event, "session_closed"));
    return next;
  }
  if (event.action === "open_session") {
    next.sessionState = "open";
    next.accepted.push(event.id);
    return next;
  }
  if (event.action === "lock_session") {
    next.sessionState = "locked";
    next.accepted.push(event.id);
    return next;
  }
  if (event.action === "close_session") {
    next.sessionState = "closed";
    next.accepted.push(event.id);
    return next;
  }
  if (event.action === "queue_item") {
    if (next.sessionState === "locked") {
      next.conflicts.push(conflict(event, "queue_rejected_session_locked"));
      return next;
    }
    if (next.sessionState !== "open") {
      next.conflicts.push(conflict(event, "queue_requires_open_session"));
      return next;
    }
    if (next.queueItems.includes(event.itemId)) {
      next.conflicts.push(conflict(event, "queue_item_duplicate"));
      return next;
    }
    next.queueItems.push(event.itemId);
    next.accepted.push(event.id);
    return next;
  }
  if (event.action === "vote") {
    const voteKey = `${event.actorId || "unknown"}:${event.itemId || "unknown"}`;
    if (!next.queueItems.includes(event.itemId)) {
      next.conflicts.push(conflict(event, "vote_requires_queued_item"));
      return next;
    }
    if (next.votesByActorItem.has(voteKey)) {
      next.conflicts.push(conflict(event, "duplicate_vote_ignored"));
      return next;
    }
    next.votesByActorItem.set(voteKey, event.voteDirection || "down");
    next.accepted.push(event.id);
    return next;
  }

  next.conflicts.push(conflict(event, "action_not_admitted"));
  return next;
}

function reduceConflictScenario(events = DEFAULT_EVENTS) {
  let state = buildInitialState();
  for (const event of events) {
    state = applyEvent(state, event);
  }
  return {
    sessionState: state.sessionState,
    queueItems: state.queueItems,
    voteCount: state.votesByActorItem.size,
    accepted: state.accepted,
    conflicts: state.conflicts,
  };
}

function validateConflictResolution(summary = {}) {
  const reasonCodes = [];
  const conflictReasons = new Set((summary.conflicts || []).map((item) => item.reasonCode));
  if (!conflictReasons.has("queue_rejected_session_locked")) {
    reasonCodes.push("locked_queue_conflict_not_proven");
  }
  if (!conflictReasons.has("duplicate_vote_ignored")) {
    reasonCodes.push("duplicate_vote_conflict_not_proven");
  }
  if (!conflictReasons.has("session_closed")) {
    reasonCodes.push("closed_session_conflict_not_proven");
  }
  if (summary.sessionState !== "closed") {
    reasonCodes.push("host_close_did_not_win");
  }
  if (summary.voteCount !== 1) {
    reasonCodes.push("duplicate_vote_not_deduped");
  }
  return {
    ok: reasonCodes.length === 0,
    reasonCodes,
  };
}

function buildMusicSeshQueueConflictHostControls({ events = DEFAULT_EVENTS } = {}) {
  const summary = reduceConflictScenario(events);
  const validation = validateConflictResolution(summary);
  const result = {
    ok: validation.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: validation.ok ? "queue_conflict_host_controls_ready" : "blocked",
    summary,
    reasonCodes: validation.reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.queue_conflict_host_controls_ready"
        : "discordos.music_sesh.queue_conflict_host_controls_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.queue_conflict_host_controls",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        sessionState: summary.sessionState,
        conflictCount: summary.conflicts.length,
        slashCommandsAdmitted: false,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Queue Conflict And Host Controls",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- final session state: \`${result.summary.sessionState}\``,
    `- accepted events: \`${result.summary.accepted.length}\``,
    `- conflicts: \`${result.summary.conflicts.length}\``,
    `- votes: \`${result.summary.voteCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildMusicSeshQueueConflictHostControls(options);
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
    HOST_ACTIONS,
    DEFAULT_EVENTS,
    parseArgs,
    buildInitialState,
    applyEvent,
    reduceConflictScenario,
    validateConflictResolution,
    buildMusicSeshQueueConflictHostControls,
    renderMarkdown,
  },
};
