const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-moderation-audit-shadow-persistence");

test("moderation audit shadow persistence parses moderation persistence inputs", () => {
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
    "--severity",
    "high",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.action, "warn");
  assert.equal(parsed.guildId, "1515843266946269194");
  assert.equal(parsed.severity, "high");
});

test("moderation audit shadow persistence admits sanitized no-write ledger preview", () => {
  const result = _internals.buildModerationAuditShadowPersistenceAdmission({
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
  assert.equal(result.status, "shadow_ready");
  assert.equal(result.persistenceStatus, "shadow_storage");
  assert.equal(result.tableName, "discordos_moderation_audit_log");
  assert.equal(result.storageWritesAllowed, false);
  assert.equal(result.schemaMigrationAllowed, false);
  assert.equal(result.liveModerationAllowed, false);
  assert.equal(result.rowPreview.caseId, "mod-1");
  assert.equal(result.rowPreview.actorFingerprint.length, 12);
  assert.equal(result.rowPreview.subjectFingerprint.length, 12);
  assert(result.shadowAdmissionGates.includes("storage_write_disabled"));
  assert.equal(result.event.type, "discordos.moderation.audit_shadow_persistence_ready");
});

test("moderation audit shadow persistence blocks invalid guild input", () => {
  const result = _internals.buildModerationAuditShadowPersistenceAdmission({
    caseId: "mod-1",
    action: "note",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    guildId: "abc",
    reason: "review",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert(result.reasonCodes.includes("guild_id_invalid"));
});

test("moderation audit shadow persistence renders without raw Discord ids", () => {
  const result = _internals.buildModerationAuditShadowPersistenceAdmission({
    caseId: "MOD 1",
    action: "close",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    guildId: "1515843266946269194",
    reason: "resolved",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Moderation Audit Shadow Persistence"));
  assert(rendered.includes("storage writes allowed: `false`"));
  assert(rendered.includes("actor fingerprint present: `true`"));
  assert(!rendered.includes("1504671871512346695"));
  assert(!rendered.includes("1515220075366580224"));
});
