const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-queue-replay-proof");

test("music sesh queue replay proof parses duplicate flag", () => {
  const parsed = _internals.parseArgs(["--json", "--session-id", "music-1", "--include-duplicate"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.sessionId, "music-1");
  assert.equal(parsed.includeDuplicate, true);
});

test("music sesh queue replay proof reduces deterministic session state", () => {
  const result = _internals.buildMusicSeshQueueReplayProof({ sessionId: "music-1" });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesStorage, false);
  assert.equal(result.replay.sessionState, "closed");
  assert.equal(result.replay.queueItemCount, 1);
  assert.equal(result.replay.voteCount, 1);
  assert.equal(result.idempotent, true);
});

test("music sesh queue replay proof ignores duplicate events", () => {
  const result = _internals.buildMusicSeshQueueReplayProof({
    sessionId: "music-1",
    includeDuplicate: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.eventCount, 6);
  assert.equal(result.replay.appliedEventCount, 5);
  assert.equal(result.replay.duplicateEventCount, 1);
});

test("music sesh queue replay proof renders bounded markdown", () => {
  const result = _internals.buildMusicSeshQueueReplayProof();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Queue Replay Proof"));
  assert(rendered.includes("writes storage: `false`"));
});
