const {
  _internals: lifecycleInternals,
} = require("./discordos-board-lifecycle-sync");

const EVENT_TYPES = new Set([
  "thread_created",
  "thread_updated",
  "tag_changed",
  "message_created",
]);

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
    eventType: null,
    threadId: null,
    cardId: null,
    workflow: "product-board",
    kind: "ops",
    state: "opened",
    actor: null,
    applyStorage: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--event-type") {
      options.eventType = readValue(args, index, "missing_event_type_value");
      index += 1;
    } else if (arg === "--thread-id") {
      options.threadId = readValue(args, index, "missing_thread_id_value");
      index += 1;
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
    } else if (arg === "--apply-storage") {
      options.applyStorage = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function validateEventInput(input = {}) {
  const reasonCodes = [];
  if (!EVENT_TYPES.has(input.eventType)) {
    reasonCodes.push("event_type_not_admitted");
  }
  if (!input.threadId || !/^\d{17,20}$/.test(input.threadId)) {
    reasonCodes.push("thread_id_invalid");
  }
  if (!input.cardId) {
    reasonCodes.push("card_id_missing");
  }
  return {
    ok: reasonCodes.length === 0,
    reasonCodes,
  };
}

async function buildBoardLifecycleEventIngest({
  env = process.env,
  fetchImpl = fetch,
  ...input
} = {}) {
  const validation = validateEventInput(input);
  const lifecycle = validation.ok
    ? await lifecycleInternals.buildBoardLifecycleSync({
        workflow: input.workflow || "product-board",
        cardId: input.cardId,
        kind: input.kind || "ops",
        state: input.state || "opened",
        actor: input.actor,
        sourceThreadId: input.threadId,
        applyStorage: input.applyStorage,
        env,
        fetchImpl,
      })
    : null;
  const reasonCodes = [...new Set([
    ...validation.reasonCodes,
    ...(lifecycle?.reasonCodes || []),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: reasonCodes.length === 0 ? "event_ingested" : "blocked",
    eventIngest: {
      eventType: input.eventType || null,
      threadIdShapeValid: typeof input.threadId === "string" && /^\d{17,20}$/.test(input.threadId),
      cardId: input.cardId || null,
      mappedState: input.state || "opened",
      storageApplied: lifecycle?.storageApplied === true,
    },
    lifecycleStatus: lifecycle?.status || null,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board.lifecycle_event_ingest_ready"
        : "discordos.board.lifecycle_event_ingest_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board.lifecycle_event_ingest",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        eventType: result.eventIngest.eventType || "unknown",
        storageApplied: result.eventIngest.storageApplied,
        reasonCodeCount: result.reasonCodes.length,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Lifecycle Event Ingest",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.eventIngest.eventType || "unknown"}\``,
    `- card id: \`${result.eventIngest.cardId || "unknown"}\``,
    `- mapped state: \`${result.eventIngest.mappedState || "unknown"}\``,
    `- storage applied: \`${result.eventIngest.storageApplied ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardLifecycleEventIngest(options);
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
    EVENT_TYPES,
    parseArgs,
    validateEventInput,
    buildBoardLifecycleEventIngest,
    renderMarkdown,
  },
};
