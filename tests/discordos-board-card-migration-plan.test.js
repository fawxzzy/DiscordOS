const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-card-migration-plan");

test("fitness source preserves stable card identity and maps fixed work to review", () => {
  const source = _internals.normalizeFitnessSource({
    card_id: "FF-CORE-001",
    report_type: "feature",
    report_type_label: "Feature",
    status: "fixed",
    area: "Progression",
    title: "Complete Progression Engine V2",
    forum_thread_link: "https://discord.com/channels/guild/1514380081219506298",
    latest_update_summary: "Verification passed.",
    card_sections: { acceptance_criteria: ["Deterministic progression"] },
  });
  assert.equal(source.cardId, "FF-CORE-001");
  assert.equal(source.sourceThreadId, "1514380081219506298");
  assert.equal(_internals.mapFitnessState({ status: source.rawState }, "active"), "review");
});

test("mazer completed source remains completed on the active board for transfer", () => {
  const source = _internals.normalizeMazerSource({
    id: "mazer-player-rank-only-progression-display",
    title: "mazer: rank-only player progression display",
    state: "completed",
    completionPercent: 100,
    liveThreadId: "thread",
    summary: "Rank-only display shipped.",
  });
  assert.equal(_internals.mapMazerState({ state: source.rawState, completionPercent: 100 }, "active"), "completed");
});

test("completed clone can resolve an owner source by unique normalized title", () => {
  const source = {
    cardId: "FF-HISTORY-001",
    sourceThreadId: "source",
    title: "Feature: History / Analytics — Rebuild useful history metrics and progression analytics",
    plainTitle: "Rebuild useful history metrics and progression analytics",
  };
  const result = _internals.selectSource({
    thread: { id: "completed", name: source.title },
    boardRole: "completed",
    sources: [source],
    existingCardId: null,
  });
  assert.equal(result.source.cardId, "FF-HISTORY-001");
  assert.equal(result.matchedBy, "unique_source_title");
});

test("ambiguous completed title blocks rather than assigning an identity", () => {
  const sources = [
    { cardId: "ONE", sourceThreadId: "one", title: "Feature: Same", plainTitle: "Same" },
    { cardId: "TWO", sourceThreadId: "two", title: "Feature: Same", plainTitle: "Same" },
  ];
  const result = _internals.selectSource({
    thread: { id: "completed", name: "Feature: Same" },
    boardRole: "completed",
    sources,
    existingCardId: null,
  });
  assert.equal(result.source, null);
  assert(result.reasonCodes.includes("source_title_identity_ambiguous"));
});

test("fallback identity is deterministic from board and thread", () => {
  const source = _internals.fallbackSource({
    board: { id: "completed", project: "DiscordOS", role: "completed" },
    thread: { id: "123", name: "Legacy completed card" },
    starter: { content: "Legacy details" },
  });
  assert.equal(source.cardId, "legacy-completed-123");
  assert.equal(source.rawState, "completed");
});

test("completed migration event carries the original source-card link", () => {
  const event = _internals.buildMigrationEvent({
    board: { id: "completed", project: "Fitness", role: "completed", forumChannelId: "forum" },
    thread: { id: "completed-thread", name: "Feature: Completed" },
    source: {
      sourceType: "fitness_export",
      cardId: "FIT-1",
      project: "Fitness",
      sourceThreadId: "source-thread",
      type: "feature",
      rawState: "fixed",
      priority: "High",
      owner: "Fitness",
      progress: "100%",
      summary: "Complete",
      objective: "Ship it",
      acceptanceCriteria: ["Verified"],
      discoveries: [],
      nextActions: ["Retain evidence"],
      blockers: [],
      evidence: ["tests passed"],
    },
    guildId: "guild",
  });
  assert(event.card.evidence.includes("original card: https://discord.com/channels/guild/source-thread"));
  assert.deepEqual(event.entry.evidence, event.card.evidence);
});

test("completed migration never reports its own thread as the original source", () => {
  const event = _internals.buildMigrationEvent({
    board: { id: "completed", project: "Fitness", role: "completed", forumChannelId: "forum" },
    thread: { id: "same-thread", name: "Legacy complete" },
    source: {
      sourceType: "thread_fallback",
      cardId: "legacy-completed-same-thread",
      project: "Fitness",
      sourceThreadId: "same-thread",
      type: "feature",
      rawState: "completed",
      priority: "Unspecified",
      owner: "Fitness",
      progress: "100%",
      summary: "Complete",
      objective: "Preserve history",
      acceptanceCriteria: [],
      discoveries: [],
      nextActions: [],
      blockers: [],
      evidence: [],
    },
    guildId: "guild",
  });
  assert(event.card.evidence.includes("original card: source thread unavailable in retained source data"));
  assert(!event.card.evidence.some((line) => line.includes("/same-thread")));
});
