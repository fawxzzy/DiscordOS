const {
  _internals: shadowPersistenceInternals,
} = require("./discordos-board-card-shadow-persistence");

const STORAGE_WRITE_ENV = "DISCORDOS_BOARD_ACTIVE_WRITE_ADAPTER";
const STORAGE_WRITE_ENV_VALUE = "enabled";
const ACTIVE_WRITE_GATES = [
  "board_runtime_input_valid",
  "storage_schema_admitted",
  "no_discord_send",
  "live_behavior_disabled",
  "parameterized_upsert_preview",
  "double_guard_required_for_storage_write",
];

function parseArgs(args) {
  const shadowArgs = [];
  const options = {
    allowStorageWrite: false,
  };

  for (const arg of args) {
    if (arg === "--allow-storage-write") {
      options.allowStorageWrite = true;
    } else {
      shadowArgs.push(arg);
    }
  }

  return {
    ...shadowPersistenceInternals.parseArgs(shadowArgs),
    ...options,
  };
}

function buildStorageWritePreview(shadowPlan) {
  return {
    tableRef: "discordos.discordos_board_cards",
    operation: "upsert",
    conflictTarget: "card_id",
    idempotencyKey: shadowPlan.rowPreview.cardId,
    parameterCount: 11,
    columns: [
      "card_id",
      "workflow",
      "kind",
      "current_state",
      "source_thread_id",
      "latest_transition_at",
      "latest_transition_actor",
      "latest_transition_note_present",
      "proof_payload",
      "reason_codes",
      "updated_at",
    ],
    sqlShape:
      "insert into discordos.discordos_board_cards (...) values (...) on conflict (card_id) do update set ...",
  };
}

function resolveStorageWriteAdmission({ allowStorageWrite, env }) {
  const envEnabled = env?.[STORAGE_WRITE_ENV] === STORAGE_WRITE_ENV_VALUE;

  if (!allowStorageWrite && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "no_write_guard_active",
      reasonCodes: [],
    };
  }

  if (allowStorageWrite && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "storage_write_plan_admitted",
      reasonCodes: [],
    };
  }

  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["storage_write_double_guard_missing"],
  };
}

async function buildBoardActiveWriteAdapterGuard({
  env = process.env,
  allowStorageWrite = false,
  ...input
} = {}) {
  const shadowPlan = await shadowPersistenceInternals.buildBoardCardShadowPersistencePlan(input);
  const storageAdmission = resolveStorageWriteAdmission({
    allowStorageWrite,
    env,
  });
  const reasonCodes = [...new Set([
    ...shadowPlan.reasonCodes,
    ...storageAdmission.reasonCodes,
  ])];
  const storageWritesAllowed = shadowPlan.ok && storageAdmission.admitted;
  const result = {
    ok: shadowPlan.ok && storageAdmission.reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    executesStorageWrite: false,
    status: reasonCodes.length === 0 ? "guard_ready" : "blocked",
    adapterStatus: storageWritesAllowed ? "storage_write_plan_admitted" : "no_live_no_send_guarded",
    tableName: shadowPlan.tableName,
    idempotencyKeyField: shadowPlan.idempotencyKeyField,
    retentionClass: shadowPlan.retentionClass,
    storageWritesAllowed,
    schemaMigrationAllowed: false,
    liveBehaviorAllowed: false,
    activeWriteGates: ACTIVE_WRITE_GATES,
    storageWriteAdmission: storageAdmission,
    shadowPlan: {
      ok: shadowPlan.ok,
      status: shadowPlan.status,
      persistenceStatus: shadowPlan.persistenceStatus,
      storageWritesAllowed: shadowPlan.storageWritesAllowed,
      liveBehaviorAllowed: shadowPlan.liveBehaviorAllowed,
    },
    rowPreview: shadowPlan.rowPreview,
    storageWritePreview: buildStorageWritePreview(shadowPlan),
    reasonCodes,
  };

  return {
    ...result,
    event: classifyBoardActiveWriteAdapterGuardEvent(result),
  };
}

function classifyBoardActiveWriteAdapterGuardEvent(result) {
  return {
    type: result.ok
      ? "discordos.board_card.active_write_adapter_guard_ready"
      : "discordos.board_card.active_write_adapter_guard_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.board_card.active_write_adapter_guard",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      tableName: result.tableName,
      workflow: result.rowPreview.workflow || "unknown",
      state: result.rowPreview.state || "unknown",
      storageWritesAllowed: result.storageWritesAllowed,
      executesStorageWrite: result.executesStorageWrite,
      liveBehaviorAllowed: result.liveBehaviorAllowed,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Active Write Adapter Guard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- adapter status: \`${result.adapterStatus}\``,
    `- table: \`${result.tableName}\``,
    `- storage writes allowed: \`${result.storageWritesAllowed ? "true" : "false"}\``,
    `- live behavior allowed: \`${result.liveBehaviorAllowed ? "true" : "false"}\``,
    `- storage write admission: \`${result.storageWriteAdmission.status}\``,
    `- card id: \`${result.rowPreview.cardId || "unknown"}\``,
    `- workflow: \`${result.rowPreview.workflow || "unknown"}\``,
    `- state: \`${result.rowPreview.state || "unknown"}\``,
    `- write preview operation: \`${result.storageWritePreview.operation}\``,
    `- active write gates: \`${result.activeWriteGates.length}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardActiveWriteAdapterGuard(options);
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
    STORAGE_WRITE_ENV,
    STORAGE_WRITE_ENV_VALUE,
    ACTIVE_WRITE_GATES,
    parseArgs,
    buildStorageWritePreview,
    resolveStorageWriteAdmission,
    buildBoardActiveWriteAdapterGuard,
    classifyBoardActiveWriteAdapterGuardEvent,
    renderMarkdown,
  },
};
