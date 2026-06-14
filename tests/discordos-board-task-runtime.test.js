const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-task-runtime");

test("board task runtime parses card inputs", () => {
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
    "--source-thread-id",
    "1515843266946269194",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.cardId, "Board 1");
  assert.equal(parsed.workflow, "Product Board");
  assert.equal(parsed.kind, "feature");
  assert.equal(parsed.state, "in_progress");
});

test("board task runtime builds no-send lifecycle command preview", () => {
  const result = _internals.buildBoardTaskRuntimePreview({
    cardId: "Board 1",
    workflow: "Product Board",
    kind: "feature",
    state: "blocked",
    actor: "zac",
    note: "waiting on operator proof",
    sourceThreadId: "1515843266946269194",
  });

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.liveBehaviorAllowed, false);
  assert.equal(result.persistenceAllowed, false);
  assert.equal(result.runtime.card.cardId, "board-1");
  assert.equal(result.runtime.card.workflow, "product-board");
  assert.equal(result.runtime.card.currentState, "blocked");
  assert.equal(result.runtime.card.sourceThreadIdShapeValid, true);
  assert(result.runtime.publication.command.includes("forum-card-lifecycle"));
  assert.equal(result.event.type, "discordos.board_task.runtime_ready");
});

test("board task runtime blocks invalid identities and states", () => {
  const result = _internals.buildBoardTaskRuntimePreview({
    cardId: "",
    workflow: "",
    kind: "unknown",
    state: "doing",
    actor: "",
    sourceThreadId: "abc",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("card_id_missing"));
  assert(result.reasonCodes.includes("workflow_missing"));
  assert(result.reasonCodes.includes("kind_not_admitted"));
  assert(result.reasonCodes.includes("state_not_admitted"));
  assert(result.reasonCodes.includes("actor_missing"));
  assert(result.reasonCodes.includes("source_thread_id_invalid"));
});

test("board task runtime renders bounded markdown", () => {
  const result = _internals.buildBoardTaskRuntimePreview({
    cardId: "Board 1",
    workflow: "Product Board",
    kind: "ops",
    state: "opened",
    actor: "zac",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Task Runtime"));
  assert(rendered.includes("card id: `board-1`"));
  assert(rendered.includes("workflow: `product-board`"));
  assert(rendered.includes("sends messages: `false`"));
  assert(!rendered.includes("bot-secret"));
});
