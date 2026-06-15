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

test("music sesh feedback board reads committed cards", async () => {
  const result = await _internals.buildMusicSeshFeedbackBoard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.cardCount, 12);
  assert.equal(result.readyCardCount, 7);
  assert.equal(result.completedCardCount, 5);
  assert.equal(result.nextCard.id, "music-sesh-storage-contract");
});

test("music sesh feedback board renders bounded markdown", async () => {
  const result = await _internals.buildMusicSeshFeedbackBoard({
    cardId: "music-sesh-feedback-board-read-model",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Feedback Board"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("music-sesh-feedback-board-read-model"));
});
