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
    "--apply",
    "--allow-storage-write",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.caseId, "MOD 1");
  assert.equal(parsed.action, "warn");
  assert.equal(parsed.allowStorageWrite, true);
  assert.equal(parsed.apply, true);
});

test("moderation audit write adapter guard is ready with no-send no-live guard", async () => {
  const result = await _internals.buildModerationAuditWriteAdapterGuard({
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

test("moderation audit write adapter guard blocks partial storage write admission", async () => {
  const result = await _internals.buildModerationAuditWriteAdapterGuard({
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

test("moderation audit write adapter guard admits plan only when double guarded", async () => {
  const result = await _internals.buildModerationAuditWriteAdapterGuard({
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

test("moderation audit write adapter guard executes storage RPC only when applied and configured", async () => {
  const calls = [];
  const result = await _internals.buildModerationAuditWriteAdapterGuard({
    caseId: "MOD 1",
    action: "warn",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    guildId: "1515843266946269194",
    reason: "review",
    severity: "medium",
    allowStorageWrite: true,
    apply: true,
    env: {
      DISCORDOS_MODERATION_AUDIT_WRITE_ADAPTER: "enabled",
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ caseId: "mod-1", operation: "inserted" }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.executesStorageWrite, true);
  assert.equal(result.adapterStatus, "storage_write_executed");
  assert.equal(result.storageWriteResult.status, "written");
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/discordos_insert_moderation_audit");
  assert.equal(JSON.parse(calls[0].init.body).payload.case_id, "mod-1");
  assert.equal(calls[0].init.headers.Authorization, "Bearer service-role");
});

test("moderation audit write adapter guard renders without raw Discord ids", async () => {
  const result = await _internals.buildModerationAuditWriteAdapterGuard({
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
