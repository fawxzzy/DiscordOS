const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-active-write-adapter-guard");

test("board active write adapter guard parses storage guard flag", () => {
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
    "--allow-storage-write",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.cardId, "Board 1");
  assert.equal(parsed.workflow, "Product Board");
  assert.equal(parsed.allowStorageWrite, true);
});

test("board active write adapter guard is ready with no-send no-live guard", async () => {
  const result = await _internals.buildBoardActiveWriteAdapterGuard({
    cardId: "Board 1",
    workflow: "Product Board",
    kind: "feature",
    state: "in_progress",
    actor: "zac",
    note: "ready for storage adapter review",
    sourceThreadId: "1515843266946269194",
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
  assert.equal(result.liveBehaviorAllowed, false);
  assert.equal(result.storageWriteAdmission.status, "no_write_guard_active");
  assert.equal(result.storageWritePreview.tableRef, "discordos.discordos_board_cards");
  assert.equal(result.storageWritePreview.operation, "upsert");
  assert.equal(result.rowPreview.cardId, "board-1");
  assert.equal(result.event.type, "discordos.board_card.active_write_adapter_guard_ready");
});

test("board active write adapter guard blocks partial storage write admission", async () => {
  const result = await _internals.buildBoardActiveWriteAdapterGuard({
    cardId: "Board 1",
    workflow: "Product Board",
    kind: "feature",
    state: "opened",
    actor: "zac",
    allowStorageWrite: true,
    env: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.storageWritesAllowed, false);
  assert(result.reasonCodes.includes("storage_write_double_guard_missing"));
});

test("board active write adapter guard admits plan only when double guarded", async () => {
  const result = await _internals.buildBoardActiveWriteAdapterGuard({
    cardId: "Board 1",
    workflow: "Product Board",
    kind: "feature",
    state: "opened",
    actor: "zac",
    allowStorageWrite: true,
    env: {
      DISCORDOS_BOARD_ACTIVE_WRITE_ADAPTER: "enabled",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.storageWritesAllowed, true);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.storageWriteAdmission.status, "storage_write_plan_admitted");
});

test("board active write adapter guard renders bounded markdown", async () => {
  const result = await _internals.buildBoardActiveWriteAdapterGuard({
    cardId: "Board 1",
    workflow: "Product Board",
    kind: "ops",
    state: "opened",
    actor: "zac",
    env: {},
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Active Write Adapter Guard"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("executes storage write: `false`"));
  assert(rendered.includes("live behavior allowed: `false`"));
  assert(!rendered.includes("SUPABASE_SERVICE_ROLE_KEY="));
});
