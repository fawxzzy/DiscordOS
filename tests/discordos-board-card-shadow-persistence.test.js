const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-card-shadow-persistence");

test("board card shadow persistence reuses board runtime args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--card-id",
    "Board 1",
    "--workflow",
    "Product Board",
    "--kind",
    "feature",
    "--state",
    "in_progress",
    "--actor",
    "zac",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.cardId, "Board 1");
  assert.equal(parsed.workflow, "Product Board");
  assert.equal(parsed.state, "in_progress");
});

test("board card shadow persistence builds a no-write row preview", async () => {
  const result = await _internals.buildBoardCardShadowPersistencePlan({
    cardId: "Board 1",
    workflow: "Product Board",
    kind: "feature",
    state: "blocked",
    actor: "zac",
    note: "waiting on proof",
    sourceThreadId: "1515843266946269194",
  });

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.status, "shadow_ready");
  assert.equal(result.persistenceStatus, "shadow_storage");
  assert.equal(result.tableName, "discordos_board_cards");
  assert.equal(result.idempotencyKeyField, "cardId");
  assert.equal(result.retentionClass, "product_state");
  assert.equal(result.storageWritesAllowed, false);
  assert.equal(result.schemaMigrationAllowed, false);
  assert.equal(result.liveBehaviorAllowed, false);
  assert.equal(result.rowPreview.cardId, "board-1");
  assert.equal(result.rowPreview.workflow, "product-board");
  assert.equal(result.rowPreview.proofPayloadPresent, true);
  assert.equal(result.event.type, "discordos.board_card.shadow_persistence_ready");
});

test("board card shadow persistence blocks invalid card input", async () => {
  const result = await _internals.buildBoardCardShadowPersistencePlan({
    cardId: "",
    workflow: "",
    kind: "unknown",
    state: "doing",
    actor: "",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert(result.reasonCodes.includes("card_id_missing"));
  assert(result.reasonCodes.includes("workflow_missing"));
  assert(result.reasonCodes.includes("kind_not_admitted"));
  assert(result.reasonCodes.includes("state_not_admitted"));
});

test("board card shadow persistence renders bounded markdown", async () => {
  const result = await _internals.buildBoardCardShadowPersistencePlan({
    cardId: "Board 1",
    workflow: "Product Board",
    kind: "ops",
    state: "opened",
    actor: "zac",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Card Shadow Persistence"));
  assert(rendered.includes("storage writes allowed: `false`"));
  assert(rendered.includes("live behavior allowed: `false`"));
  assert(!rendered.includes("DISCORDOS_BOT_TOKEN="));
});
