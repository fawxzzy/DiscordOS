const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-moderation-persistence-plan");

test("moderation persistence plan parses preflight and persistence inputs", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--case-id",
    "mod-1",
    "--action",
    "warn",
    "--subject-user-id",
    "1504671871512346695",
    "--actor-user-id",
    "1515220075366580224",
    "--guild-id",
    "1515843266946269194",
    "--channel-id",
    "1504671871512346695",
    "--reason",
    "rule review",
    "--severity",
    "high",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.action, "warn");
  assert.equal(parsed.guildId, "1515843266946269194");
  assert.equal(parsed.channelId, "1504671871512346695");
  assert.equal(parsed.severity, "high");
});

test("moderation persistence plan builds sanitized ledger row plan", () => {
  const result = _internals.buildModerationAuditLedgerPlan({
    caseId: "MOD 1",
    action: "warn",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    guildId: "1515843266946269194",
    channelId: "1504671871512346695",
    reason: "rule review",
    severity: "high",
    note: "operator reviewed",
  });

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.storageWritesAllowed, false);
  assert.equal(result.schemaMigrationAllowed, false);
  assert.equal(result.liveModerationAllowed, false);
  assert.equal(result.tableName, "discordos_moderation_audit_log");
  assert.equal(result.idempotencyKeyField, "caseId");
  assert.equal(result.rowPreview.caseId, "mod-1");
  assert.equal(result.rowPreview.actorFingerprint.length, 12);
  assert.equal(result.rowPreview.subjectFingerprint.length, 12);
  assert.equal(result.rowPreview.guildIdShapeValid, true);
  assert.equal(result.rowPreview.channelIdShapeValid, true);
  assert.equal(result.event.type, "discordos.moderation.persistence_plan_ready");
});

test("moderation persistence plan blocks invalid guild and channel ids", () => {
  const result = _internals.buildModerationAuditLedgerPlan({
    caseId: "mod-1",
    action: "note",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    guildId: "abc",
    channelId: "def",
    reason: "review",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("guild_id_invalid"));
  assert(result.reasonCodes.includes("channel_id_invalid"));
});

test("moderation persistence plan renders without raw Discord ids", () => {
  const result = _internals.buildModerationAuditLedgerPlan({
    caseId: "MOD 1",
    action: "close",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    guildId: "1515843266946269194",
    reason: "resolved",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Moderation Persistence Plan"));
  assert(rendered.includes("table: `discordos_moderation_audit_log`"));
  assert(rendered.includes("actor fingerprint present: `true`"));
  assert(!rendered.includes("1504671871512346695"));
  assert(!rendered.includes("1515220075366580224"));
});
