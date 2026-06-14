const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-card-schema-admission-status");

async function writeFile(dir, fileName, text) {
  const filePath = path.join(dir, fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
  return filePath;
}

test("board card schema admission args default to contract paths", () => {
  const parsed = _internals.parseArgs([]);

  assert.equal(parsed.json, false);
  assert.equal(parsed.docsFile, _internals.DEFAULT_DOCS_FILE);
  assert.equal(parsed.sourceFile, _internals.DEFAULT_SOURCE_FILE);
});

test("board card schema admission status passes current contract", async () => {
  const result = await _internals.buildBoardCardSchemaAdmissionStatus();

  assert.equal(result.ok, true);
  assert.equal(result.schemaAdmissionStatus, "planning_ready");
  assert.equal(result.migrationAllowed, false);
  assert.equal(result.storageWritesAllowed, false);
  assert.equal(result.event.type, "discordos.board_card.schema_admission_ready");
});

test("board card schema admission blocks missing source tokens", () => {
  const result = _internals.classifyRequiredText("DiscordOSBoardCardSchemaAdmissionStatus", _internals.REQUIRED_SOURCE_TOKENS, "missing");

  assert.equal(result.ok, false);
  assert(result.missing.includes("discordos_board_cards"));
});

test("board card schema admission blocks runtime tokens", () => {
  const result = _internals.classifyRuntimeFreeSource("createClient(process.env.SUPABASE_URL)");

  assert.equal(result.ok, false);
  assert(result.banned.includes("process.env"));
  assert(result.banned.includes("createClient"));
});

test("board card schema admission supports fixture paths", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-board-schema-"));
  const docsFile = await writeFile(dir, "docs.md", _internals.REQUIRED_DOC_ANCHORS.join("\n"));
  const sourceFile = await writeFile(dir, "board.ts", _internals.REQUIRED_SOURCE_TOKENS.join("\n"));

  const result = await _internals.buildBoardCardSchemaAdmissionStatus({ docsFile, sourceFile });

  assert.equal(result.ok, true);
});

test("board card schema admission renders bounded output", async () => {
  const result = await _internals.buildBoardCardSchemaAdmissionStatus();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Card Schema Admission Status"));
  assert(rendered.includes("migration allowed: `false`"));
  assert(!rendered.includes("SUPABASE_SERVICE_ROLE_KEY"));
});
