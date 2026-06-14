const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-moderation-audit-log-schema-admission-status");

async function writeFile(dir, fileName, text) {
  const filePath = path.join(dir, fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
  return filePath;
}

test("moderation audit log schema admission args default to contract paths", () => {
  const parsed = _internals.parseArgs([]);

  assert.equal(parsed.json, false);
  assert.equal(parsed.docsFile, _internals.DEFAULT_DOCS_FILE);
  assert.equal(parsed.sourceFile, _internals.DEFAULT_SOURCE_FILE);
});

test("moderation audit log schema admission status passes current contract", async () => {
  const result = await _internals.buildModerationAuditLogSchemaAdmissionStatus();

  assert.equal(result.ok, true);
  assert.equal(result.schemaAdmissionStatus, "planning_ready");
  assert.equal(result.migrationAllowed, false);
  assert.equal(result.storageWritesAllowed, false);
  assert.equal(result.event.type, "discordos.moderation.audit_log.schema_admission_ready");
});

test("moderation audit log schema admission blocks missing source tokens", () => {
  const result = _internals.classifyRequiredText(
    "DiscordOSModerationAuditLogSchemaAdmissionStatus",
    _internals.REQUIRED_SOURCE_TOKENS,
    "missing"
  );

  assert.equal(result.ok, false);
  assert(result.missing.includes("discordos_moderation_audit_log"));
});

test("moderation audit log schema admission blocks runtime tokens", () => {
  const result = _internals.classifyRuntimeFreeSource("new Client({ token: process.env.DISCORDOS_BOT_TOKEN })");

  assert.equal(result.ok, false);
  assert(result.banned.includes("process.env"));
  assert(result.banned.includes("new Client"));
});

test("moderation audit log schema admission supports fixture paths", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-mod-schema-"));
  const docsFile = await writeFile(dir, "docs.md", _internals.REQUIRED_DOC_ANCHORS.join("\n"));
  const sourceFile = await writeFile(dir, "moderation.ts", _internals.REQUIRED_SOURCE_TOKENS.join("\n"));

  const result = await _internals.buildModerationAuditLogSchemaAdmissionStatus({ docsFile, sourceFile });

  assert.equal(result.ok, true);
});

test("moderation audit log schema admission renders bounded output", async () => {
  const result = await _internals.buildModerationAuditLogSchemaAdmissionStatus();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Moderation Audit Log Schema Admission Status"));
  assert(rendered.includes("storage writes allowed: `false`"));
  assert(!rendered.includes("DISCORDOS_BOT_TOKEN="));
});
