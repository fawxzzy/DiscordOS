const {
  _internals: persistencePlanInternals,
} = require("./discordos-moderation-persistence-plan");

const SHADOW_ADMISSION_GATES = [
  "schema_contract_present",
  "sanitized_actor_subject_fingerprints",
  "guild_channel_shape_checked",
  "idempotent_case_key_present",
  "live_moderation_disabled",
  "storage_write_disabled",
];

function parseArgs(args) {
  return persistencePlanInternals.parseArgs(args);
}

function buildModerationAuditShadowPersistenceAdmission(input = {}) {
  const plan = persistencePlanInternals.buildModerationAuditLedgerPlan(input);
  const result = {
    ok: plan.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: plan.ok ? "shadow_ready" : "blocked",
    persistenceStatus: "shadow_storage",
    tableName: plan.tableName,
    idempotencyKeyField: plan.idempotencyKeyField,
    requiredColumns: plan.requiredColumns,
    requiredIndexes: plan.requiredIndexes,
    storageWritesAllowed: false,
    schemaMigrationAllowed: false,
    liveModerationAllowed: false,
    shadowAdmissionGates: SHADOW_ADMISSION_GATES,
    ledgerPlan: plan,
    rowPreview: {
      caseId: plan.rowPreview.caseId,
      actionType: plan.rowPreview.actionType,
      severity: plan.rowPreview.severity,
      actorFingerprint: plan.rowPreview.actorFingerprint,
      subjectFingerprint: plan.rowPreview.subjectFingerprint,
      guildIdShapeValid: plan.rowPreview.guildIdShapeValid,
      channelIdShapeValid: plan.rowPreview.channelIdShapeValid,
      reasonPresent: plan.rowPreview.reasonPresent,
      notePresent: plan.rowPreview.notePresent,
      proofPayloadPresent: plan.rowPreview.proofPayloadPresent,
    },
    reasonCodes: plan.reasonCodes,
  };

  return {
    ...result,
    event: classifyModerationAuditShadowPersistenceEvent(result),
  };
}

function classifyModerationAuditShadowPersistenceEvent(result) {
  return {
    type: result.ok
      ? "discordos.moderation.audit_shadow_persistence_ready"
      : "discordos.moderation.audit_shadow_persistence_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.moderation.audit_shadow_persistence",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      tableName: result.tableName,
      actionType: result.rowPreview.actionType || "unknown",
      storageWritesAllowed: result.storageWritesAllowed,
      liveModerationAllowed: result.liveModerationAllowed,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Moderation Audit Shadow Persistence",
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
    `- storage writes allowed: \`${result.storageWritesAllowed ? "true" : "false"}\``,
    `- schema migration allowed: \`${result.schemaMigrationAllowed ? "true" : "false"}\``,
    `- live moderation allowed: \`${result.liveModerationAllowed ? "true" : "false"}\``,
    `- case id: \`${result.rowPreview.caseId || "unknown"}\``,
    `- action: \`${result.rowPreview.actionType || "unknown"}\``,
    `- actor fingerprint present: \`${result.rowPreview.actorFingerprint ? "true" : "false"}\``,
    `- subject fingerprint present: \`${result.rowPreview.subjectFingerprint ? "true" : "false"}\``,
    `- shadow admission gates: \`${result.shadowAdmissionGates.length}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildModerationAuditShadowPersistenceAdmission(options);
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
    SHADOW_ADMISSION_GATES,
    parseArgs,
    buildModerationAuditShadowPersistenceAdmission,
    classifyModerationAuditShadowPersistenceEvent,
    renderMarkdown,
  },
};
