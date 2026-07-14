const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-lifecycle-sync");

test("board reaction lifecycle sync parses card filter", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--card-id",
    "card-1",
    "--live",
    "--allow-apply",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.cardId, "card-1");
  assert.equal(parsed.live, true);
  assert.equal(parsed.allowApply, true);
  assert.equal(parsed.apply, true);
});

test("board reaction lifecycle sync maps state to expected reactions", () => {
  assert.equal(_internals.expectedReactionStatusForState("completed"), "success");
  assert.equal(_internals.expectedReactionStatusForState("archived"), "success");
  assert.equal(_internals.expectedReactionStatusForState("blocked"), "failure");
  assert.equal(_internals.expectedReactionStatusForState("ready"), "failure");
  assert.equal(_internals.expectedReactionStatusForState("backlog"), "failure");
});

test("board reaction lifecycle sync accepts archived success without rewriting lifecycle", () => {
  const card = _internals.reconcileReactionLifecycleCard({
    id: "card-archived",
    state: "archived",
    reactionStatus: "success",
    reactionEmojiName: "success",
  });

  assert.equal(card.ok, true);
  assert.equal(card.expectedReactionStatus, "success");
  assert.equal(card.lifecycleStateFromReaction, "archived");
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
  assert(card.reasonCodes.includes("failure_reaction_requires_incomplete_state"));
});

test("board reaction lifecycle sync keeps incomplete reactions independent from lifecycle", () => {
  for (const state of ["intake", "planning", "open", "backlog", "ready", "in_progress", "review", "blocked"]) {
    const card = _internals.reconcileReactionLifecycleCard({
      id: `card-${state}`,
      state,
      reactionStatus: "failure",
      reactionEmojiName: "failure",
    });

    assert.equal(card.ok, true);
    assert.equal(card.lifecycleStateFromReaction, state);
  }
});

test("board reaction lifecycle sync reads committed board", async () => {
  const result = await _internals.buildBoardReactionLifecycleSync();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.status, "reaction_lifecycle_synced");
  assert.equal(result.board.cardCount, 1);
  assert.equal(result.mismatchCount, 0);
});

test("board reaction lifecycle sync renders bounded markdown", async () => {
  const result = await _internals.buildBoardReactionLifecycleSync({
    cardId: "music-sesh-phase-8-cross-service-room-sync-simple-controls",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Reaction Lifecycle Sync"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("mismatches: `0`"));
});

test("board reaction lifecycle sync can live-read custom success reaction", async () => {
  const result = await _internals.buildBoardReactionLifecycleSync({
    cardId: "music-sesh-phase-8-cross-service-room-sync-simple-controls",
    live: true,
    env: {
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        reactions: [
          {
            emoji: {
              name: "failure",
              id: "1507384094424694785",
            },
            count: 1,
            me: true,
          },
        ],
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.callsDiscordApi, true);
  assert.equal(result.liveAttempted, true);
  assert.equal(result.liveMismatchCount, 0);
  assert.equal(result.liveReconciledCards[0].readback.currentReactionPresent, true);
});
