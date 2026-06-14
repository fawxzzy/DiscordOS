const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-card-persistence-status");

test("board card persistence status args default to contract paths", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    docsFile: _internals.DEFAULT_DOCS_FILE,
    sourceFile: _internals.DEFAULT_SOURCE_FILE,
  });
});

test("board card persistence status passes current contract", async () => {
  const result = await _internals.buildBoardCardPersistenceStatus();

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.persistenceStatus, "contract_only");
  assert.equal(result.storageWritesAllowed, false);
  assert.equal(result.schemaMigrationAllowed, false);
  assert.equal(result.event.type, "discordos.board_card.persistence_contract_ready");
});

test("board card persistence status blocks missing source tokens", () => {
  const result = _internals.classifyRequiredText(
    "DiscordOSBoardCardPersistenceContract",
    _internals.REQUIRED_SOURCE_TOKENS,
    "missing"
  );

  assert.equal(result.ok, false);
  assert(result.missing.includes("discordos_supabase"));
});

test("board card persistence status blocks runtime tokens", () => {
  const result = _internals.classifyRuntimeFreeSource("createClient(process.env.SUPABASE_URL)");

  assert.equal(result.ok, false);
  assert(result.banned.includes("process.env"));
  assert(result.banned.includes("createClient"));
});

test("board card persistence status renders bounded output", async () => {
  const result = await _internals.buildBoardCardPersistenceStatus();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Card Persistence Status"));
  assert(rendered.includes("storage writes allowed: `false`"));
  assert(!rendered.includes("SUPABASE_SERVICE_ROLE_KEY"));
});
