const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-lifecycle-event-ingest");

test("board lifecycle event ingest parses forum event inputs", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--event-type",
    "thread_updated",
    "--thread-id",
    "1515885988403216495",
    "--card-id",
    "board-1",
    "--state",
    "completed",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.eventType, "thread_updated");
  assert.equal(parsed.threadId, "1515885988403216495");
});

test("board lifecycle event ingest maps event to lifecycle sync", async () => {
  const result = await _internals.buildBoardLifecycleEventIngest({
    eventType: "thread_updated",
    threadId: "1515885988403216495",
    cardId: "board-1",
    workflow: "product-board",
    state: "completed",
    actor: "zac",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.eventIngest.mappedState, "completed");
  assert.equal(result.lifecycleStatus, "sync_ready");
});

test("board lifecycle event ingest blocks invalid event", async () => {
  const result = await _internals.buildBoardLifecycleEventIngest({
    eventType: "unknown",
    threadId: "x",
    cardId: "",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("event_type_not_admitted"));
  assert(result.reasonCodes.includes("thread_id_invalid"));
});

test("board lifecycle event ingest renders bounded markdown", async () => {
  const result = await _internals.buildBoardLifecycleEventIngest({
    eventType: "thread_created",
    threadId: "1515885988403216495",
    cardId: "board-1",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Lifecycle Event Ingest"));
  assert(rendered.includes("sends messages: `false`"));
});
