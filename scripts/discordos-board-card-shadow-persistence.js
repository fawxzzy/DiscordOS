const {
  _internals: boardTaskRuntimeInternals,
} = require("./discordos-board-task-runtime");
const {
  _internals: schemaAdmissionInternals,
} = require("./discordos-board-card-schema-admission-status");

const TABLE_NAME = "discordos_board_cards";
const IDEMPOTENCY_KEY_FIELD = "cardId";
const RETENTION_CLASS = "product_state";

function parseArgs(args) {
  return boardTaskRuntimeInternals.parseArgs(args);
}

function buildShadowRowPreview(runtimePreview) {
  const card = runtimePreview.runtime.card;
  const transition = runtimePreview.runtime.transition;

  return {
    cardId: card.cardId,
    workflow: card.workflow,
    kind: card.kind,
    state: card.currentState,
    sourceThreadIdShapeValid: card.sourceThreadIdShapeValid,
    actorPresent: transition.actorPresent,
    notePresent: transition.notePresent,
    proofPayloadPresent: true,
    idempotencyKey: card.cardId,
  };
}

async function buildBoardCardShadowPersistencePlan({
  fsImpl,
  docsFile,
  sourceFile,
  ...input
} = {}) {
  const runtimePreview = boardTaskRuntimeInternals.buildBoardTaskRuntimePreview(input);
  const schemaAdmission = await schemaAdmissionInternals.buildBoardCardSchemaAdmissionStatus({
    fsImpl,
    docsFile,
    sourceFile,
  });
  const reasonCodes = [...new Set([
    ...runtimePreview.reasonCodes,
    ...schemaAdmission.reasonCodes,
  ])];
  const result = {
    ok: runtimePreview.ok && schemaAdmission.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: reasonCodes.length === 0 ? "shadow_ready" : "blocked",
    persistenceStatus: "shadow_storage",
    tableName: TABLE_NAME,
    idempotencyKeyField: IDEMPOTENCY_KEY_FIELD,
    retentionClass: RETENTION_CLASS,
    storageWritesAllowed: false,
    schemaMigrationAllowed: false,
    liveBehaviorAllowed: false,
    shadowWritePreviewOnly: true,
    runtimePreview,
    schemaAdmission: {
      ok: schemaAdmission.ok,
      status: schemaAdmission.status,
      tableName: schemaAdmission.tableName,
      migrationAllowed: schemaAdmission.migrationAllowed,
      storageWritesAllowed: schemaAdmission.storageWritesAllowed,
    },
    rowPreview: buildShadowRowPreview(runtimePreview),
    reasonCodes,
  };

  return {
    ...result,
    event: classifyBoardCardShadowPersistenceEvent(result),
  };
}

function classifyBoardCardShadowPersistenceEvent(result) {
  return {
    type: result.ok
      ? "discordos.board_card.shadow_persistence_ready"
      : "discordos.board_card.shadow_persistence_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.board_card.shadow_persistence",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      tableName: result.tableName,
      workflow: result.rowPreview.workflow || "unknown",
      state: result.rowPreview.state || "unknown",
      storageWritesAllowed: result.storageWritesAllowed,
      liveBehaviorAllowed: result.liveBehaviorAllowed,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Card Shadow Persistence",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- persistence status: \`${result.persistenceStatus}\``,
    `- table: \`${result.tableName}\``,
    `- idempotency key: \`${result.idempotencyKeyField}\``,
    `- retention class: \`${result.retentionClass}\``,
    `- storage writes allowed: \`${result.storageWritesAllowed ? "true" : "false"}\``,
    `- schema migration allowed: \`${result.schemaMigrationAllowed ? "true" : "false"}\``,
    `- live behavior allowed: \`${result.liveBehaviorAllowed ? "true" : "false"}\``,
    `- card id: \`${result.rowPreview.cardId || "unknown"}\``,
    `- workflow: \`${result.rowPreview.workflow || "unknown"}\``,
    `- state: \`${result.rowPreview.state || "unknown"}\``,
    `- proof payload present: \`${result.rowPreview.proofPayloadPresent ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardCardShadowPersistencePlan(options);
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
    TABLE_NAME,
    IDEMPOTENCY_KEY_FIELD,
    RETENTION_CLASS,
    parseArgs,
    buildShadowRowPreview,
    buildBoardCardShadowPersistencePlan,
    classifyBoardCardShadowPersistenceEvent,
    renderMarkdown,
  },
};
