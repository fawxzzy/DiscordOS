const {
  _internals: boardWriterInternals,
} = require("./discordos-board-active-write-adapter-guard");

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
    workflow: null,
    cardId: null,
    kind: "ops",
    state: "opened",
    actor: null,
    note: null,
    sourceThreadId: null,
    applyStorage: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--workflow") {
      options.workflow = readValue(args, index, "missing_workflow_value");
      index += 1;
    } else if (arg === "--card-id") {
      options.cardId = readValue(args, index, "missing_card_id_value");
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
    } else if (arg === "--apply-storage") {
      options.applyStorage = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function classifyBoardLifecycleSyncEvent(result) {
  return {
    type: result.ok
      ? "discordos.board.lifecycle_sync_ready"
      : "discordos.board.lifecycle_sync_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.board.lifecycle_sync",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      state: result.sync.state || "unknown",
      storageApplied: result.storageApplied,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildBoardLifecycleSync({
  env = process.env,
  fetchImpl = fetch,
  applyStorage = false,
  ...input
} = {}) {
  const writer = await boardWriterInternals.buildBoardActiveWriteAdapterGuard({
    ...input,
    allowStorageWrite: applyStorage,
    apply: applyStorage,
    env,
    fetchImpl,
  });
  const result = {
    ok: writer.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    storageApplied: writer.executesStorageWrite && writer.storageWriteResult.ok,
    status: writer.ok ? "sync_ready" : "blocked",
    sync: {
      source: "discord_forum_card_lifecycle",
      workflow: input.workflow || null,
      cardId: writer.rowPreview.cardId,
      state: writer.rowPreview.state,
      sourceThreadIdShapeValid: writer.rowPreview.sourceThreadIdShapeValid,
    },
    boardWriter: {
      status: writer.status,
      adapterStatus: writer.adapterStatus,
      storageWriteResult: writer.storageWriteResult.status,
      storageWritesAllowed: writer.storageWritesAllowed,
      liveBehaviorAllowed: writer.liveBehaviorAllowed,
    },
    reasonCodes: writer.reasonCodes,
  };

  return {
    ...result,
    event: classifyBoardLifecycleSyncEvent(result),
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Lifecycle Sync",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- storage applied: \`${result.storageApplied ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- source: \`${result.sync.source}\``,
    `- card id: \`${result.sync.cardId || "unknown"}\``,
    `- state: \`${result.sync.state || "unknown"}\``,
    `- writer status: \`${result.boardWriter.adapterStatus}\``,
    `- live behavior allowed: \`${result.boardWriter.liveBehaviorAllowed ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardLifecycleSync(options);
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
    classifyBoardLifecycleSyncEvent,
    buildBoardLifecycleSync,
    renderMarkdown,
  },
};
