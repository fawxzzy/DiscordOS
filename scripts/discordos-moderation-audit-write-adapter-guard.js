const {
  _internals: shadowPersistenceInternals,
} = require("./discordos-moderation-audit-shadow-persistence");
const {
  _internals: supabaseRpcInternals,
} = require("./discordos-supabase-service-rpc");

const STORAGE_WRITE_ENV = "DISCORDOS_MODERATION_AUDIT_WRITE_ADAPTER";
const STORAGE_WRITE_ENV_VALUE = "enabled";
const STORAGE_WRITE_RPC = "discordos_insert_moderation_audit";
const AUDIT_WRITE_GATES = [
  "moderation_preflight_input_valid",
  "sanitized_actor_subject_fingerprints",
  "guild_channel_shape_checked",
  "no_discord_send",
  "live_moderation_disabled",
  "double_guard_required_for_storage_write",
];

function parseArgs(args) {
  const shadowArgs = [];
  const options = {
    allowStorageWrite: false,
    apply: false,
  };

  for (const arg of args) {
    if (arg === "--allow-storage-write") {
      options.allowStorageWrite = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else {
      shadowArgs.push(arg);
    }
  }

  return {
    ...shadowPersistenceInternals.parseArgs(shadowArgs),
    ...options,
  };
}

function buildStorageWritePreview(shadowAdmission) {
  return {
    tableRef: "discordos.discordos_moderation_audit_log",
    operation: "insert_on_conflict_do_nothing",
    conflictTarget: "case_id",
    idempotencyKey: shadowAdmission.rowPreview.caseId,
    rawDiscordIdsExposed: false,
    parameterCount: 11,
    columns: [
      "case_id",
      "action_type",
      "severity",
      "actor_discord_user_fingerprint",
      "subject_discord_user_fingerprint",
      "guild_id",
      "channel_id",
      "reason_present",
      "note_present",
      "proof_payload",
      "reason_codes",
    ],
    sqlShape:
      "insert into discordos.discordos_moderation_audit_log (...) values (...) on conflict (case_id) do nothing",
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

function buildStorageWritePayload(shadowAdmission, input = {}) {
  return {
    case_id: shadowAdmission.rowPreview.caseId,
    action_type: shadowAdmission.rowPreview.actionType,
    severity: shadowAdmission.rowPreview.severity,
    actor_discord_user_fingerprint: shadowAdmission.rowPreview.actorFingerprint,
    subject_discord_user_fingerprint: shadowAdmission.rowPreview.subjectFingerprint,
    guild_id: input.guildId || null,
    channel_id: input.channelId || null,
    reason_present: shadowAdmission.rowPreview.reasonPresent,
    note_present: shadowAdmission.rowPreview.notePresent,
    proof_payload: {
      source: "discordos.moderation_audit_write_adapter_guard",
      rawDiscordIdsExposed: false,
      liveModerationAllowed: false,
    },
    reason_codes: shadowAdmission.reasonCodes,
  };
}

async function executeStorageWrite({ payload, env, fetchImpl }) {
  const config = supabaseRpcInternals.getServiceRoleRpcConfig(env);
  if (!config.ok) {
    return {
      ok: false,
      attempted: false,
      status: "blocked",
      rpc: STORAGE_WRITE_RPC,
      httpStatus: null,
      row: null,
      reasonCodes: config.reasonCodes,
    };
  }

  const rpcResult = await supabaseRpcInternals.callServiceRoleRpc({
    ...config,
    functionName: STORAGE_WRITE_RPC,
    payload: { payload },
    fetchImpl,
  });

  return {
    ok: rpcResult.ok,
    attempted: true,
    status: rpcResult.ok ? "written" : "failed",
    rpc: STORAGE_WRITE_RPC,
    httpStatus: rpcResult.httpStatus,
    row: rpcResult.ok ? rpcResult.payload : null,
    reasonCodes: rpcResult.ok ? [] : ["storage_write_rpc_failed"],
  };
}

async function buildModerationAuditWriteAdapterGuard({
  env = process.env,
  allowStorageWrite = false,
  apply = false,
  fetchImpl = fetch,
  ...input
} = {}) {
  const shadowAdmission = shadowPersistenceInternals.buildModerationAuditShadowPersistenceAdmission(input);
  const storageAdmission = resolveStorageWriteAdmission({
    allowStorageWrite,
    env,
  });
  const initialReasonCodes = [...new Set([
    ...shadowAdmission.reasonCodes,
    ...storageAdmission.reasonCodes,
  ])];
  const storageWritesAllowed = shadowAdmission.ok && storageAdmission.admitted;
  const storageWritePayload = buildStorageWritePayload(shadowAdmission, input);
  let storageWriteResult = {
    ok: false,
    attempted: false,
    status: apply ? "blocked" : "not_requested",
    rpc: STORAGE_WRITE_RPC,
    httpStatus: null,
    row: null,
    reasonCodes: apply && !storageWritesAllowed ? ["storage_write_not_admitted"] : [],
  };

  if (apply && storageWritesAllowed) {
    storageWriteResult = await executeStorageWrite({
      payload: storageWritePayload,
      env,
      fetchImpl,
    });
  }

  const reasonCodes = [...new Set([
    ...initialReasonCodes,
    ...storageWriteResult.reasonCodes,
  ])];
  const result = {
    ok: shadowAdmission.ok && storageAdmission.reasonCodes.length === 0 && storageWriteResult.reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    executesStorageWrite: storageWriteResult.attempted,
    status: reasonCodes.length === 0 ? "guard_ready" : "blocked",
    adapterStatus: storageWriteResult.attempted && storageWriteResult.ok
      ? "storage_write_executed"
      : storageWritesAllowed
        ? "storage_write_plan_admitted"
        : "no_live_no_send_guarded",
    tableName: shadowAdmission.tableName,
    idempotencyKeyField: shadowAdmission.idempotencyKeyField,
    storageWritesAllowed,
    schemaMigrationAllowed: false,
    liveModerationAllowed: false,
    auditWriteGates: AUDIT_WRITE_GATES,
    storageWriteAdmission: storageAdmission,
    shadowAdmission: {
      ok: shadowAdmission.ok,
      status: shadowAdmission.status,
      persistenceStatus: shadowAdmission.persistenceStatus,
      storageWritesAllowed: shadowAdmission.storageWritesAllowed,
      liveModerationAllowed: shadowAdmission.liveModerationAllowed,
    },
    rowPreview: shadowAdmission.rowPreview,
    storageWritePreview: buildStorageWritePreview(shadowAdmission),
    storageWritePayload,
    storageWriteResult,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyModerationAuditWriteAdapterGuardEvent(result),
  };
}

function classifyModerationAuditWriteAdapterGuardEvent(result) {
  return {
    type: result.ok
      ? "discordos.moderation.audit_write_adapter_guard_ready"
      : "discordos.moderation.audit_write_adapter_guard_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.moderation.audit_write_adapter_guard",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      tableName: result.tableName,
      actionType: result.rowPreview.actionType || "unknown",
      storageWritesAllowed: result.storageWritesAllowed,
      executesStorageWrite: result.executesStorageWrite,
      storageWriteStatus: result.storageWriteResult.status,
      liveModerationAllowed: result.liveModerationAllowed,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Moderation Audit Write Adapter Guard",
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
    `- storage write result: \`${result.storageWriteResult.status}\``,
    `- storage write rpc: \`${result.storageWriteResult.rpc}\``,
    `- live moderation allowed: \`${result.liveModerationAllowed ? "true" : "false"}\``,
    `- raw Discord ids exposed: \`${result.storageWritePreview.rawDiscordIdsExposed ? "true" : "false"}\``,
    `- storage write admission: \`${result.storageWriteAdmission.status}\``,
    `- case id: \`${result.rowPreview.caseId || "unknown"}\``,
    `- action: \`${result.rowPreview.actionType || "unknown"}\``,
    `- actor fingerprint present: \`${result.rowPreview.actorFingerprint ? "true" : "false"}\``,
    `- subject fingerprint present: \`${result.rowPreview.subjectFingerprint ? "true" : "false"}\``,
    `- audit write gates: \`${result.auditWriteGates.length}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildModerationAuditWriteAdapterGuard(options);
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
    STORAGE_WRITE_RPC,
    AUDIT_WRITE_GATES,
    parseArgs,
    buildStorageWritePreview,
    buildStorageWritePayload,
    resolveStorageWriteAdmission,
    executeStorageWrite,
    buildModerationAuditWriteAdapterGuard,
    classifyModerationAuditWriteAdapterGuardEvent,
    renderMarkdown,
  },
};
