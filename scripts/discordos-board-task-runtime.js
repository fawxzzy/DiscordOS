const ALLOWED_KINDS = new Set(["feature", "bug", "ops", "release", "moderation"]);
const ALLOWED_STATES = new Set(["opened", "in_progress", "blocked", "completed", "closed"]);

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

function parseArgs(args) {
  const options = {
    json: false,
    cardId: null,
    workflow: null,
    kind: "ops",
    state: "opened",
    actor: null,
    note: null,
    sourceThreadId: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--card-id") {
      options.cardId = readValue(args, index, "missing_card_id_value");
      index += 1;
    } else if (arg === "--workflow") {
      options.workflow = readValue(args, index, "missing_workflow_value");
      index += 1;
    } else if (arg === "--kind") {
      options.kind = readValue(args, index, "missing_kind_value");
      index += 1;
    } else if (arg === "--state") {
      options.state = readValue(args, index, "missing_state_value");
      index += 1;
    } else if (arg === "--actor") {
      options.actor = readValue(args, index, "missing_actor_value");
      index += 1;
    } else if (arg === "--note") {
      options.note = readValue(args, index, "missing_note_value");
      index += 1;
    } else if (arg === "--source-thread-id") {
      options.sourceThreadId = readValue(args, index, "missing_source_thread_id_value");
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSnowflake(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value.trim());
}

function validateBoardTaskInput(input) {
  const reasonCodes = [];
  const cardId = normalizeIdentity(input.cardId);
  const workflow = normalizeIdentity(input.workflow);

  if (!cardId) {
    reasonCodes.push("card_id_missing");
  }
  if (!workflow) {
    reasonCodes.push("workflow_missing");
  }
  if (!ALLOWED_KINDS.has(input.kind)) {
    reasonCodes.push("kind_not_admitted");
  }
  if (!ALLOWED_STATES.has(input.state)) {
    reasonCodes.push("state_not_admitted");
  }
  if (!hasValue(input.actor)) {
    reasonCodes.push("actor_missing");
  }
  if (hasValue(input.sourceThreadId) && !isSnowflake(input.sourceThreadId)) {
    reasonCodes.push("source_thread_id_invalid");
  }
  if (hasValue(input.note) && input.note.length > 1000) {
    reasonCodes.push("note_too_long");
  }

  return {
    ok: reasonCodes.length === 0,
    cardId,
    workflow,
    reasonCodes,
  };
}

function buildLifecycleCommand({ cardId, workflow, state, note }) {
  const body = hasValue(note) ? note.trim().replace(/"/g, '\\"') : `Move ${cardId} to ${state}`;
  return `npm run ops:discord:forum-card-lifecycle -- --workflow "${workflow}" --card-id "${cardId}" --state "${state}" --body "${body}"`;
}

function buildBoardTaskRuntimePreview(input = {}) {
  const validation = validateBoardTaskInput(input);
  const runtime = {
    card: {
      cardId: validation.cardId || null,
      workflow: validation.workflow || null,
      kind: input.kind || null,
      sourceThreadIdShapeValid: hasValue(input.sourceThreadId) ? isSnowflake(input.sourceThreadId) : null,
      currentState: ALLOWED_STATES.has(input.state) ? input.state : null,
    },
    transition: {
      actorPresent: hasValue(input.actor),
      notePresent: hasValue(input.note),
      fromState: null,
      toState: ALLOWED_STATES.has(input.state) ? input.state : null,
    },
    publication: {
      allowedThroughLifecycleCommand: validation.ok,
      command: validation.ok
        ? buildLifecycleCommand({
          cardId: validation.cardId,
          workflow: validation.workflow,
          state: input.state,
          note: input.note,
        })
        : null,
    },
  };
  const result = {
    ok: validation.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: validation.ok ? "ready" : "blocked",
    liveBehaviorAllowed: false,
    persistenceAllowed: false,
    runtime,
    reasonCodes: validation.reasonCodes,
  };

  return {
    ...result,
    event: classifyBoardTaskRuntimeEvent(result),
  };
}

function classifyBoardTaskRuntimeEvent(result) {
  return {
    type: result.ok
      ? "discordos.board_task.runtime_ready"
      : "discordos.board_task.runtime_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.board_task.runtime",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      workflow: result.runtime.card.workflow || "unknown",
      state: result.runtime.card.currentState || "unknown",
      liveBehaviorAllowed: result.liveBehaviorAllowed,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Task Runtime",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- card id: \`${result.runtime.card.cardId || "unknown"}\``,
    `- workflow: \`${result.runtime.card.workflow || "unknown"}\``,
    `- kind: \`${result.runtime.card.kind || "unknown"}\``,
    `- current state: \`${result.runtime.card.currentState || "unknown"}\``,
    `- live behavior allowed: \`${result.liveBehaviorAllowed ? "true" : "false"}\``,
    `- persistence allowed: \`${result.persistenceAllowed ? "true" : "false"}\``,
    `- lifecycle command: \`${result.runtime.publication.command || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildBoardTaskRuntimePreview(options);
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
    ALLOWED_KINDS,
    ALLOWED_STATES,
    parseArgs,
    hasValue,
    normalizeIdentity,
    isSnowflake,
    validateBoardTaskInput,
    buildLifecycleCommand,
    classifyBoardTaskRuntimeEvent,
    buildBoardTaskRuntimePreview,
    renderMarkdown,
  },
};
