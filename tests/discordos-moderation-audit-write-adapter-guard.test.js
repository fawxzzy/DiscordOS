const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-moderation-audit-write-adapter-guard");

test("moderation audit write adapter guard parses storage guard flag", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--case-id",
    "MOD 1",
    "--action",
    "warn",
    "--subject-user-id",
    "1504671871512346695",
    "--actor-user-id",
    "1515220075366580224",
    "--guild-id",
    "1515843266946269194",
    "--allow-storage-write",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.caseId, "MOD 1");
  assert.equal(parsed.action, "warn");
  assert.equal(parsed.allowStorageWrite, true);
});

test("moderation audit write adapter guard is ready with no-send no-live guard", () => {
  const result = _internals.buildModerationAuditWriteAdapterGuard({
    caseId: "MOD 1",
    action: "warn",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    guildId: "1515843266946269194",
    channelId: "1504671871512346695",
    reason: "rule review",
    severity: "high",
    note: "operator reviewed",
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.status, "guard_ready");
  assert.equal(result.adapterStatus, "no_live_no_send_guarded");
  assert.equal(result.storageWritesAllowed, false);
  assert.equal(result.liveModerationAllowed, false);
  assert.equal(result.storageWriteAdmission.status, "no_write_guard_active");
  assert.equal(result.storageWritePreview.tableRef, "discordos.discordos_moderation_audit_log");
  assert.equal(result.storageWritePreview.rawDiscordIdsExposed, false);
  assert.equal(result.rowPreview.caseId, "mod-1");
  assert.equal(result.event.type, "discordos.moderation.audit_write_adapter_guard_ready");
});

test("moderation audit write adapter guard blocks partial storage write admission", () => {
  const result = _internals.buildModerationAuditWriteAdapterGuard({
    caseId: "MOD 1",
    action: "warn",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    guildId: "1515843266946269194",
    severity: "medium",
    reason: "rule review",
    allowStorageWrite: true,
    env: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.storageWritesAllowed, false);
  assert(result.reasonCodes.includes("storage_write_double_guard_missing"));
});

test("moderation audit write adapter guard admits plan only when double guarded", () => {
  const result = _internals.buildModerationAuditWriteAdapterGuard({
    caseId: "MOD 1",
    action: "warn",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    guildId: "1515843266946269194",
    severity: "medium",
    reason: "rule review",
    allowStorageWrite: true,
    env: {
      DISCORDOS_MODERATION_AUDIT_WRITE_ADAPTER: "enabled",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.storageWritesAllowed, true);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.storageWriteAdmission.status, "storage_write_plan_admitted");
});

test("moderation audit write adapter guard renders without raw Discord ids", () => {
  const result = _internals.buildModerationAuditWriteAdapterGuard({
    caseId: "MOD 1",
    action: "close",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    guildId: "1515843266946269194",
    reason: "resolved",
    env: {},
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Moderation Audit Write Adapter Guard"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("raw Discord ids exposed: `false`"));
  assert(!rendered.includes("1504671871512346695"));
  assert(!rendered.includes("1515220075366580224"));
});
