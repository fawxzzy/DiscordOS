const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-feedback-board");

test("music sesh feedback board parses card filter", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--card-id",
    "music-sesh-storage-contract",
    "--state",
    "ready",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.cardId, "music-sesh-storage-contract");
  assert.equal(parsed.state, "ready");
});

test("music sesh feedback board classifies card metadata", () => {
  const card = _internals.classifyCard({
    id: "card-1",
    title: "Card",
    state: "ready",
    priority: "high",
    category: "music_sesh",
    nextCommand: "npm run ops:discordos:music-sesh-runtime",
  });

  assert.equal(card.ok, true);
  assert.equal(card.priority, "high");
});

test("music sesh feedback board accepts canonical and legacy lifecycle states", () => {
  for (const state of [
    "intake",
    "planning",
    "open",
    "backlog",
    "ready",
    "in_progress",
    "review",
    "blocked",
    "archived",
  ]) {
    const card = _internals.classifyCard({
      id: `card-${state}`,
      title: `Card ${state}`,
      state,
      priority: "medium",
      nextCommand: "npm run example",
      reactionStatus: "failure",
      reactionEmojiName: "failure",
      reactionEmojiId: "1507384094424694785",
    });

    assert.equal(card.reasonCodes.includes("card_state_invalid"), false);
  }
});

test("music sesh feedback board requires completed card reaction metadata", () => {
  const card = _internals.classifyCard({
    id: "card-1",
    title: "Card",
    state: "completed",
    priority: "high",
    category: "music_sesh",
    nextCommand: "npm run ops:discordos:music-sesh-runtime",
  });

  assert.equal(card.ok, false);
  assert(card.reasonCodes.includes("card_live_thread_id_missing"));
  assert(card.reasonCodes.includes("card_live_message_id_missing"));
  assert(card.reasonCodes.includes("card_reaction_status_invalid"));
  assert(card.reasonCodes.includes("card_reaction_emoji_name_invalid"));
  assert(card.reasonCodes.includes("card_reaction_emoji_id_invalid"));
});

test("music sesh feedback board reads committed cards", async () => {
  const result = await _internals.buildMusicSeshFeedbackBoard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.cardCount, 1);
  assert.equal(result.readyCardCount, 0);
  assert.equal(result.completedCardCount, 0);
  assert.equal(result.blockedCardCount, 1);
  assert.equal(result.reactionReadyCardCount, 0);
  assert.equal(result.nextCard.id, "music-sesh-phase-8-cross-service-room-sync-simple-controls");
});

test("music sesh feedback board renders bounded markdown", async () => {
  const result = await _internals.buildMusicSeshFeedbackBoard({
    cardId: "music-sesh-phase-8-cross-service-room-sync-simple-controls",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Feedback Board"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("music-sesh-phase-8-cross-service-room-sync-simple-controls"));
  assert(rendered.includes("reaction-ready cards: `"));
});
