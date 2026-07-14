const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-mazer-feedback-board");

test("mazer feedback board parses card filters", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--card-id",
    "mazer-ai-level-rank-progression",
    "--state",
    "open",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.cardId, "mazer-ai-level-rank-progression");
  assert.equal(parsed.state, "open");
});

test("mazer feedback board classifies planned marker cards", () => {
  const card = _internals.classifyCard({
    id: "mazer-card",
    title: "Mazer Card",
    state: "open",
    priority: "high",
    category: "mazer",
    markerName: "Level/rank/complexity contract",
    completionPercent: 28,
    summary: "Defines the level and complexity contract.",
    whyItMatters: "It keeps difficulty scaling explainable.",
    currentStatus: "The contract is planned but not finalized.",
    workBreakdown: ["Define player level, AI level, maze level, and complexity terms."],
    nextActions: ["Write the first progression formula table."],
    acceptanceCriteria: ["The contract is documented."],
    proofPlan: ["Run the board verifier."],
    reference: "repos/mazer/docs/research/MAZER_AUTH_AI_VISUAL_COMPLETION_MARKER.md",
    nextCommand: "npm run ops:discordos:mazer-feedback-board:json -- --card-id mazer-card",
    reactionStatus: "failure",
    reactionEmojiName: "failure",
    reactionEmojiId: "1507384094424694785",
  });

  assert.equal(card.ok, true);
  assert.equal(card.markerName, "Level/rank/complexity contract");
  assert.equal(card.completionPercent, 28);
});

test("mazer feedback board classifies backlog cards without active markers", () => {
  const card = _internals.classifyCard({
    id: "mazer-backlog-card",
    title: "mazer: backlog card",
    state: "backlog",
    priority: "medium",
    category: "mazer",
    summary: "Backlog-only future Mazer work.",
    whyItMatters: "It keeps future scope visible without implying active work.",
    currentStatus: "Backlog only.",
    workBreakdown: ["Record the future scope without active implementation claims."],
    nextActions: ["Wait for explicit prioritization before implementation."],
    acceptanceCriteria: ["No active current-work marker is assigned."],
    proofPlan: ["Run the board verifier."],
    reference: "repos/mazer/docs/research/MAZER_AUTH_AI_VISUAL_COMPLETION_MARKER.md",
    nextCommand: "npm run ops:discordos:mazer-feedback-board:json -- --card-id mazer-backlog-card",
    reactionStatus: "failure",
    reactionEmojiName: "failure",
    reactionEmojiId: "1507384094424694785",
  });

  assert.equal(card.ok, true);
  assert.equal(card.classification, "backlog");
  assert.equal(card.markerName, null);
  assert.equal(card.completionPercent, null);
});

test("mazer feedback board rejects backlog cards that carry active markers", () => {
  const card = _internals.classifyCard({
    id: "mazer-backlog-card",
    title: "mazer: backlog card",
    state: "backlog",
    priority: "medium",
    category: "mazer",
    markerName: "Future Marker",
    completionPercent: 0,
    summary: "Backlog-only future Mazer work.",
    whyItMatters: "It keeps future scope visible without implying active work.",
    currentStatus: "Backlog only.",
    workBreakdown: ["Record the future scope without active implementation claims."],
    nextActions: ["Wait for explicit prioritization before implementation."],
    acceptanceCriteria: ["No active current-work marker is assigned."],
    proofPlan: ["Run the board verifier."],
    reference: "repos/mazer/docs/research/MAZER_AUTH_AI_VISUAL_COMPLETION_MARKER.md",
    nextCommand: "npm run ops:discordos:mazer-feedback-board:json -- --card-id mazer-backlog-card",
    reactionStatus: "failure",
    reactionEmojiName: "failure",
    reactionEmojiId: "1507384094424694785",
  });

  assert.equal(card.ok, false);
  assert(card.reasonCodes.includes("card_backlog_marker_name_present"));
  assert(card.reasonCodes.includes("card_backlog_completion_percent_present"));
});

test("mazer feedback board requires an active selector when Ready work exists", async () => {
  const board = await _internals.readBoard(_internals.DEFAULT_BOARD_PATH);
  const candidate = board.cards.find((card) => card.state === "open");
  candidate.state = "ready";
  board.board.planning.activeCardId = null;

  const planning = _internals.buildMazerBoardPlanning(board);

  assert.equal(planning.ok, false);
  assert(planning.reasonCodes.includes("board_planning_active_card_missing_for_ready_work"));
});

test("mazer feedback board rejects incomplete card contract", () => {
  const card = _internals.classifyCard({
    id: "",
    title: "",
    state: "doing",
    priority: "urgent",
    category: "",
    completionPercent: 101,
    nextCommand: "node script.js",
  });

  assert.equal(card.ok, false);
  assert(card.reasonCodes.includes("card_id_missing"));
  assert(card.reasonCodes.includes("card_title_missing"));
  assert(card.reasonCodes.includes("card_state_invalid"));
  assert(card.reasonCodes.includes("card_priority_invalid"));
  assert(card.reasonCodes.includes("card_category_missing"));
  assert(card.reasonCodes.includes("card_marker_name_missing"));
  assert(card.reasonCodes.includes("card_completion_percent_invalid"));
  assert(card.reasonCodes.includes("card_summary_missing"));
  assert(card.reasonCodes.includes("card_why_it_matters_missing"));
  assert(card.reasonCodes.includes("card_current_status_missing"));
  assert(card.reasonCodes.includes("card_work_breakdown_missing"));
  assert(card.reasonCodes.includes("card_next_actions_missing"));
  assert(card.reasonCodes.includes("card_acceptance_criteria_missing"));
  assert(card.reasonCodes.includes("card_proof_plan_missing"));
  assert(card.reasonCodes.includes("card_reference_missing"));
  assert(card.reasonCodes.includes("card_next_command_invalid"));
  assert(card.reasonCodes.includes("card_reaction_status_invalid"));
});

test("mazer feedback board reads committed cards", async () => {
  const result = await _internals.buildMazerFeedbackBoard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, true);
  assert.equal(result.boardId, "mazer");
  assert.equal(result.boardLabel, "mazer");
  assert.equal(result.placement.channelFamily, "project-feedback");
  assert.equal(result.placement.forumChannelId, "1524889569475170478");
  assert.equal(result.liveForumChannelId, "1524889569475170478");
  assert.equal(result.legacyForumChannelId, "1524844302981926972");
  assert.equal(result.cardCount, 64);
  assert.equal(result.openCardCount, 40);
  assert.equal(result.readyCardCount, 0);
  assert.equal(result.completedCardCount, 5);
  assert.equal(result.blockedCardCount, 0);
  assert.equal(result.backlogCardCount, 19);
  assert.equal(result.reactionReadyCardCount, 64);
  assert.equal(result.nextCard, null);
  assert.deepEqual(result.planning, {
    ok: true,
    activeCardId: null,
    epicCount: 9,
    mappedCardCount: 64,
    dependencyCount: 34,
    parallelTrackCount: 1,
  });
  assert(result.cards.some((card) => card.id === "mazer-account-scoped-settings-persistence"));
  assert(result.cards.some((card) => card.id === "mazer-player-input-movement-correctness"));
  assert(result.cards.some((card) => card.id === "mazer-procedural-difficulty-generator-shaping"));
  assert(result.cards.some((card) => card.id === "mazer-mobile-shell-device-harness"));
  assert(result.cards.some((card) => card.id === "mazer-visual-defaults-menu-controls"));
  assert(result.cards.some((card) => card.id === "mazer-icon-quality-2026-visual-target"));
  assert(result.cards.some((card) => card.id === "mazer-play-mode-perpetual-loop"));
  assert(result.cards.some((card) => card.id === "mazer-play-camera-zoom-minimap"));
  assert(result.cards.some((card) => card.id === "mazer-diagonal-path-graph-contract"));
  assert(result.cards.some((card) => card.id === "mazer-discordos-board-discipline"));
  assert(result.cards.some((card) => card.id === "mazer-player-rank-only-progression-display"));
  assert(result.cards.some((card) => card.id === "mazer-ai-run-corpus-quality-calibration"));
  assert(result.cards.some((card) => card.id === "mazer-cross-viewport-ui-reliability"));
  assert(result.cards.some((card) => card.id === "mazer-browser-layout-persistence"));
  assert(result.cards.some((card) => card.id === "mazer-ui-component-layout-standards"));
  assert(result.cards.some((card) => card.id === "mazer-shared-run-status-panel"));
  assert(result.cards.some((card) => card.id === "mazer-maze-feature-progression-parity"));
  assert(result.cards.some((card) => card.id === "mazer-player-trail-readability-lock"));
  assert(result.cards.some((card) => card.id === "mazer-run-quality-metric-contract-v2"));
  assert(result.cards.some((card) => card.id === "mazer-run-quality-telemetry-capture-v2"));
  assert(result.cards.some((card) => card.id === "mazer-run-quality-player-results-ui"));
  assert(result.cards.some((card) => card.id === "mazer-run-quality-leaderboard-admission"));
  assert(result.cards.some((card) => card.id === "mazer-run-quality-achievement-admission"));
  assert(result.cards.some((card) => card.id === "mazer-moving-maze-lane-correction-contract"));
  assert(result.cards.some((card) => card.id === "mazer-moving-maze-one-tile-lane-snap"));
  assert(result.cards.some((card) => card.id === "mazer-endless-progression-mode-contract"));
  assert(result.cards.some((card) => card.id === "mazer-endless-content-band-manifest"));
  assert(result.cards.some((card) => card.id === "mazer-shop-and-random-item-economy-contract"));
  assert(result.cards.some((card) => card.id === "mazer-offline-first-play-sync-and-conflict-contract"));
  assert(result.cards.some((card) => card.id === "mazer-installable-pwa-offline-shell"));
  assert(result.cards.some((card) => card.id === "mazer-account-license-entitlement-contract"));
  assert(result.cards.some((card) => card.id === "mazer-moving-maze-assisted-motion-proof"));
  assert(result.cards.some((card) => card.id === "mazer-web-share-metadata-and-preview-asset"));
  assert(result.cards.some((card) => card.id === "mazer-web-share-preview-platform-verification"));
  assert(result.cards.some((card) => card.id === "mazer-auth-ui-flow-hardening"));
  const authCard = result.cards.find((card) => card.id === "mazer-auth-ui-flow-hardening");
  assert.equal(authCard.primaryEpicId, "player-systems");
  assert(authCard.supportingEpicIds.includes("feel-and-polish"));
  assert(authCard.dependsOnCardIds.includes("mazer-cross-viewport-ui-reliability"));
  assert(result.cards.some((card) => card.id === "mazer-ai-token-assisted-maze-completion" && card.state === "backlog"));
  assert(result.cards.some((card) => card.id === "mazer-invisibility-cloak-item" && card.state === "backlog"));
  assert(result.cards.some((card) => card.id === "mazer-multiplayer-foundation" && card.state === "backlog"));
  assert(result.cards.some((card) => card.id === "mazer-endless-multiplayer-survival-mode" && card.state === "backlog"));
  assert(result.cards.some((card) => card.id === "mazer-moving-procedural-maze-mode" && card.state === "backlog"));
  assert(result.averageCompletionPercent > 0);
});

test("mazer feedback board renders bounded markdown", async () => {
  const result = await _internals.buildMazerFeedbackBoard({
    cardId: "mazer-ai-level-rank-progression",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Mazer Feedback Board"));
  assert(rendered.includes("sends messages: `true`"));
  assert(rendered.includes("placement: `project-feedback`"));
  assert(rendered.includes("placement forum channel id: `1524889569475170478`"));
  assert(rendered.includes("live forum channel id: `1524889569475170478`"));
  assert(rendered.includes("legacy forum channel id: `1524844302981926972`"));
  assert(rendered.includes("mazer-ai-level-rank-progression"));
  assert(rendered.includes("Progression, score, rank, and maze-rating contract"));
  assert(rendered.includes("reaction `failure`"));
});
