const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-feedback-board-live-sync");

test("music sesh feedback board live sync parses guard flags", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--card-id",
    "music-sesh-phase-8-cross-service-room-sync-simple-controls",
    "--allow-sync",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.cardId, "music-sesh-phase-8-cross-service-room-sync-simple-controls");
  assert.equal(parsed.allowSync, true);
  assert.equal(parsed.apply, true);
});

test("music sesh feedback board live sync builds no-send lifecycle preview by default", async () => {
  const result = await _internals.buildMusicSeshFeedbackBoardLiveSync({
    cardId: "music-sesh-phase-8-cross-service-room-sync-simple-controls",
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.status, "live_sync_ready");
  assert.equal(result.nextCard.id, "music-sesh-phase-8-cross-service-room-sync-simple-controls");
  assert.equal(result.selectedCardId, "music-sesh-phase-8-cross-service-room-sync-simple-controls");
  assert.equal(result.lifecycleState, "blocked");
  assert.equal(result.syncAdmission.status, "no_sync_guard_active");
  assert.equal(result.lifecycleStatus, "dry_run");
  assert.equal(result.lifecyclePreview.workflow, "Music Sesh");
});

test("music sesh feedback board live sync blocks partial sync admission", async () => {
  const result = await _internals.buildMusicSeshFeedbackBoardLiveSync({
    cardId: "music-sesh-phase-8-cross-service-room-sync-simple-controls",
    allowSync: true,
    env: {},
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("sync_double_guard_missing"));
});

test("music sesh feedback board live sync renders bounded markdown", async () => {
  const result = await _internals.buildMusicSeshFeedbackBoardLiveSync({
    cardId: "music-sesh-phase-8-cross-service-room-sync-simple-controls",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Feedback Board Live Sync"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("selected card: `music-sesh-phase-8-cross-service-room-sync-simple-controls`"));
});
