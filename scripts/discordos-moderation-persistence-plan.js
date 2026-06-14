const {
  _internals: moderationPreflightInternals,
} = require("./discordos-moderation-preflight");

const TABLE_NAME = "discordos_moderation_audit_log";
const IDEMPOTENCY_KEY_FIELD = "caseId";
const REQUIRED_COLUMNS = [
  "case_id",
  "action_type",
  "actor_discord_user_fingerprint",
  "subject_discord_user_fingerprint",
  "guild_id",
  "channel_id",
  "reason_present",
  "note_present",
  "occurred_at",
  "proof_payload",
];
const REQUIRED_INDEXES = ["case_id", "action_type", "subject_discord_user_fingerprint", "occurred_at"];

function parseArgs(args) {
  const preflightArgs = [];
  const options = {
    guildId: null,
    channelId: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--guild-id") {
      options.guildId = readValue(args, index, "missing_guild_id_value");
      index += 1;
    } else if (arg === "--channel-id") {
      options.channelId = readValue(args, index, "missing_channel_id_value");
      index += 1;
    } else {
      preflightArgs.push(arg);
      if (args[index + 1] && !args[index + 1].startsWith("--")) {
        preflightArgs.push(args[index + 1]);
        index += 1;
      }
    }
  }

  return {
    ...moderationPreflightInternals.parseArgs(preflightArgs),
    ...options,
  };
}

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

function validateModerationPersistenceInput(input) {
  const preflight = moderationPreflightInternals.buildDiscordOSModerationPreflight(input);
  const reasonCodes = [...preflight.reasonCodes];

  if (!moderationPreflightInternals.isSnowflake(input.guildId)) {
    reasonCodes.push("guild_id_invalid");
  }
  if (moderationPreflightInternals.hasValue(input.channelId) && !moderationPreflightInternals.isSnowflake(input.channelId)) {
    reasonCodes.push("channel_id_invalid");
  }

  return {
    ok: reasonCodes.length === 0,
    preflight,
    reasonCodes,
  };
}

function buildModerationAuditLedgerPlan(input = {}) {
  const validation = validateModerationPersistenceInput(input);
  const auditEnvelope = validation.preflight.auditEnvelope;
  const rowPreview = {
    caseId: auditEnvelope.caseId,
    actionType: auditEnvelope.actionType,
    severity: auditEnvelope.severity,
    actorFingerprint: auditEnvelope.actorFingerprint,
    subjectFingerprint: auditEnvelope.subjectFingerprint,
    guildIdShapeValid: moderationPreflightInternals.isSnowflake(input.guildId),
    channelIdShapeValid: moderationPreflightInternals.hasValue(input.channelId)
      ? moderationPreflightInternals.isSnowflake(input.channelId)
      : null,
    reasonPresent: auditEnvelope.reasonPresent,
    notePresent: auditEnvelope.notePresent,
    proofPayloadPresent: true,
  };
  const result = {
    ok: validation.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: validation.ok ? "ready" : "blocked",
    tableName: TABLE_NAME,
    idempotencyKeyField: IDEMPOTENCY_KEY_FIELD,
    requiredColumns: REQUIRED_COLUMNS,
    requiredIndexes: REQUIRED_INDEXES,
    storageWritesAllowed: false,
    schemaMigrationAllowed: false,
    liveModerationAllowed: false,
    rowPreview,
    reasonCodes: validation.reasonCodes,
  };

  return {
    ...result,
    event: classifyModerationPersistenceEvent(result),
  };
}

function classifyModerationPersistenceEvent(result) {
  return {
    type: result.ok
      ? "discordos.moderation.persistence_plan_ready"
      : "discordos.moderation.persistence_plan_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.moderation.persistence",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      tableName: result.tableName,
      storageWritesAllowed: result.storageWritesAllowed,
      schemaMigrationAllowed: result.schemaMigrationAllowed,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Moderation Persistence Plan",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- table: \`${result.tableName}\``,
    `- idempotency key: \`${result.idempotencyKeyField}\``,
    `- storage writes allowed: \`${result.storageWritesAllowed ? "true" : "false"}\``,
    `- schema migration allowed: \`${result.schemaMigrationAllowed ? "true" : "false"}\``,
    `- live moderation allowed: \`${result.liveModerationAllowed ? "true" : "false"}\``,
    `- case id: \`${result.rowPreview.caseId || "unknown"}\``,
    `- action: \`${result.rowPreview.actionType || "unknown"}\``,
    `- severity: \`${result.rowPreview.severity || "unknown"}\``,
    `- actor fingerprint present: \`${result.rowPreview.actorFingerprint ? "true" : "false"}\``,
    `- subject fingerprint present: \`${result.rowPreview.subjectFingerprint ? "true" : "false"}\``,
    `- required columns: \`${result.requiredColumns.length}\``,
    `- required indexes: \`${result.requiredIndexes.length}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildModerationAuditLedgerPlan(options);
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
    REQUIRED_COLUMNS,
    REQUIRED_INDEXES,
    parseArgs,
    validateModerationPersistenceInput,
    buildModerationAuditLedgerPlan,
    classifyModerationPersistenceEvent,
    renderMarkdown,
  },
};
