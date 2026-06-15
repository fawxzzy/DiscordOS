const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-lifecycle-sync");

test("board reaction lifecycle sync parses card filter", () => {
  const parsed = _internals.parseArgs(["--json", "--card-id", "card-1"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.cardId, "card-1");
});

test("board reaction lifecycle sync maps state to expected reactions", () => {
  assert.equal(_internals.expectedReactionStatusForState("completed"), "success");
  assert.equal(_internals.expectedReactionStatusForState("blocked"), "failure");
  assert.equal(_internals.expectedReactionStatusForState("ready"), null);
});

test("board reaction lifecycle sync detects mismatches", () => {
  const card = _internals.reconcileReactionLifecycleCard({
    id: "card-1",
    state: "completed",
    reactionStatus: "failure",
    reactionEmojiName: "failure",
  });

  assert.equal(card.ok, false);
  assert(card.reasonCodes.includes("reaction_status_lifecycle_mismatch"));
  assert(card.reasonCodes.includes("failure_reaction_requires_blocked_state"));
});

test("board reaction lifecycle sync reads committed board", async () => {
  const result = await _internals.buildBoardReactionLifecycleSync();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.status, "reaction_lifecycle_synced");
  assert.equal(result.board.cardCount, 35);
  assert.equal(result.mismatchCount, 0);
});

test("board reaction lifecycle sync renders bounded markdown", async () => {
  const result = await _internals.buildBoardReactionLifecycleSync({
    cardId: "user-facing-music-sesh-status-response",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Reaction Lifecycle Sync"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("mismatches: `0`"));
});
