const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-card-migration-plan");

function journalMessage({
  id = null,
  eventId = "journal-event",
  cardId = "mazer-card",
  state = "in_progress",
  occurredAt = "2026-07-14T12:00:00.000Z",
  timestamp = "2026-07-14T12:00:01.000Z",
} = {}) {
  return {
    id,
    timestamp,
    content: [
      `ATLAS-JOURNAL-EVENT-ID: \`${eventId}\``,
      `- card: \`${cardId}\``,
      `- state: \`${state}\``,
      `- occurred: \`${occurredAt}\``,
    ].join("\n"),
  };
}

function response(payload, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => payload };
}

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

test("legacy open threads map into the canonical in-progress lifecycle", () => {
  assert.equal(_internals.mapLegacyState("open", "active"), "in_progress");
  assert.equal(_internals.mapLegacyState("backlog", "active"), "planning");
  assert.equal(_internals.mapLegacyState("open", "completed"), "completed");
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
  assert.equal(event.card.progress, "100%");
  assert.deepEqual(event.card.nextActions, [
    "Retain this completed record as historical evidence",
    "Create or reopen active work only when new evidence changes the accepted outcome",
  ]);
  assert.deepEqual(event.entry.next, event.card.nextActions);
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

test("normalization preserves the four exact Mazer journal lifecycle states", () => {
  const blockedShapes = [
    ["1524974571059675198", "mazer-auth-gate-persistent-login", "review", "in_progress"],
    ["1524974583348858880", "mazer-discordos-board-discipline", "review", "in_progress"],
    ["1525635672961060925", "mazer-auth-ui-flow-hardening", "in_progress", "planning"],
    ["1526644909241667644", "mazer-shared-run-status-panel", "in_progress", "planning"],
  ];

  for (const [threadId, cardId, baselineState, journalState] of blockedShapes) {
    const resolved = _internals.resolveJournalLifecycle({
      cardId,
      messages: [journalMessage({ id: threadId, eventId: `existing:${threadId}`, cardId, state: journalState })],
    });
    const merged = _internals.mergeLifecycleState({ baselineState, journalLifecycle: resolved });
    assert.equal(merged.ok, true, cardId);
    assert.equal(merged.state, journalState, cardId);
    assert.equal(merged.decision, "journal_state_preserved", cardId);
    assert.equal(merged.previousState, null, cardId);
  }
});

test("normalization uses the owner baseline when no journal exists", () => {
  const resolved = _internals.resolveJournalLifecycle({ cardId: "mazer-no-journal", messages: [] });
  const merged = _internals.mergeLifecycleState({ baselineState: "in_progress", journalLifecycle: resolved });
  assert.equal(resolved.status, "journal_absent");
  assert.equal(merged.state, "in_progress");
  assert.equal(merged.decision, "baseline_used_no_journal");
});

test("normalization records matching lifecycle evidence without inventing a transition", () => {
  const resolved = _internals.resolveJournalLifecycle({
    cardId: "mazer-same-state",
    messages: [journalMessage({ cardId: "mazer-same-state", state: "review" })],
  });
  const merged = _internals.mergeLifecycleState({ baselineState: "review", journalLifecycle: resolved });
  assert.equal(merged.state, "review");
  assert.equal(merged.previousState, null);
  assert.equal(merged.decision, "journal_matches_baseline");
});

test("normalization never reopens completed or archived journal state", () => {
  for (const terminalState of ["completed", "archived"]) {
    const cardId = `mazer-${terminalState}`;
    const resolved = _internals.resolveJournalLifecycle({
      cardId,
      messages: [journalMessage({ cardId, state: terminalState })],
    });
    const merged = _internals.mergeLifecycleState({ baselineState: "in_progress", journalLifecycle: resolved });
    assert.equal(merged.ok, true);
    assert.equal(merged.state, terminalState);
    assert.equal(merged.decision, "journal_state_preserved");
  }
});

test("ambiguous latest journal lifecycle fails closed", () => {
  const resolved = _internals.resolveJournalLifecycle({
    cardId: "mazer-ambiguous",
    messages: [
      journalMessage({ id: null, eventId: "event-a", cardId: "mazer-ambiguous", state: "planning" }),
      journalMessage({ id: null, eventId: "event-b", cardId: "mazer-ambiguous", state: "in_progress" }),
    ],
  });
  const merged = _internals.mergeLifecycleState({ baselineState: "review", journalLifecycle: resolved });
  assert.equal(resolved.ok, false);
  assert.deepEqual(resolved.reasonCodes, ["journal_lifecycle_latest_state_ambiguous"]);
  assert.equal(merged.ok, false);
  assert.equal(merged.state, null);
});

test("duplicate journal event variants fail closed even when one was posted later", () => {
  const resolved = _internals.resolveJournalLifecycle({
    cardId: "mazer-conflicting-event",
    messages: [
      journalMessage({ id: "10", eventId: "same-event", cardId: "mazer-conflicting-event", state: "planning", timestamp: "2026-07-14T12:00:00.000Z" }),
      journalMessage({ id: "11", eventId: "same-event", cardId: "mazer-conflicting-event", state: "in_progress", timestamp: "2026-07-14T12:01:00.000Z" }),
    ],
  });
  assert.equal(resolved.ok, false);
  assert(resolved.reasonCodes.includes("journal_lifecycle_event_conflict"));
});

test("explicit lifecycle transitions require authorization and proof", () => {
  const journalLifecycle = { ok: true, state: "in_progress", reasonCodes: [] };
  const transition = {
    eventId: "transition:mazer-auth:review",
    cardId: "mazer-auth",
    threadId: "thread",
    fromState: "in_progress",
    toState: "review",
    actor: "atlas.operator",
    note: "Review authorized by the operator.",
    occurredAt: "2026-07-14T13:00:00.000Z",
    proof: { strength: "human_verified", receiptPath: "runtime/receipts/authorized.json" },
  };
  const blocked = _internals.mergeLifecycleState({ baselineState: "review", journalLifecycle, transition });
  assert.equal(blocked.ok, false);
  assert(blocked.reasonCodes.includes("lifecycle_transition_not_authorized"));

  const admitted = _internals.mergeLifecycleState({
    baselineState: "review",
    journalLifecycle,
    transition: { ...transition, authorized: true },
  });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.state, "review");
  assert.equal(admitted.previousState, "in_progress");
  assert.equal(admitted.decision, "authorized_transition");
  assert.equal(admitted.transition.proof.strength, "human_verified");
});

test("authorized lifecycle transition is represented in the migration event", () => {
  const transition = {
    eventId: "transition:mazer-auth:review",
    cardId: "mazer-auth",
    threadId: "thread",
    fromState: "in_progress",
    toState: "review",
    actor: "atlas.operator",
    note: "Review authorized by the operator.",
    occurredAt: "2026-07-14T13:00:00.000Z",
    authorized: true,
    proof: {
      strength: "human_verified",
      receiptPath: "runtime/receipts/authorized.json",
      messageId: null,
      generatedAt: "2026-07-14T12:59:00.000Z",
    },
  };
  const event = _internals.buildMigrationEvent({
    board: { id: "mazer-active", project: "Mazer", role: "active", forumChannelId: "mazer-forum" },
    thread: { id: "thread", name: "mazer: auth" },
    source: {
      sourceType: "mazer_board",
      cardId: "mazer-auth",
      project: "Mazer",
      sourceThreadId: "thread",
      type: "feature",
      rawState: "open",
      priority: "High",
      owner: "Mazer",
      progress: "90%",
      summary: "Auth is ready for review.",
      objective: "Verify auth.",
      acceptanceCriteria: ["Review passes"],
      discoveries: [],
      nextActions: ["Review"],
      blockers: [],
      evidence: [],
    },
    guildId: "guild",
    lifecycle: {
      state: "review",
      previousState: "in_progress",
      decision: "authorized_transition",
      transition,
    },
  });
  assert.equal(event.eventId, transition.eventId);
  assert.equal(event.occurredAt, transition.occurredAt);
  assert.equal(event.actor, transition.actor);
  assert.equal(event.card.previousState, "in_progress");
  assert.equal(event.card.state, "review");
  assert.deepEqual(event.transition, transition);
  assert.equal(event.correlation.receipt, transition.proof.receiptPath);
  assert.equal(event.entry.headline, "Authorized lifecycle transition");
});

test("migration plan reads live journal history before emitting normalization", async () => {
  const threadId = "1524974571059675198";
  const cardId = "mazer-auth-gate-persistent-login";
  const fetchImpl = async (url) => {
    const target = new URL(url);
    if (target.pathname === "/api/v10/channels/mazer-forum") {
      return response({ id: "mazer-forum", guild_id: "guild" });
    }
    if (target.pathname === "/api/v10/guilds/guild/threads/active") {
      return response({ threads: [{ id: threadId, name: "mazer: auth gate persistent login", parent_id: "mazer-forum" }] });
    }
    if (target.pathname === "/api/v10/channels/mazer-forum/threads/archived/public") {
      return response({ threads: [], has_more: false });
    }
    if (target.pathname === `/api/v10/channels/${threadId}/messages/${threadId}`) {
      return response({ id: threadId, content: "Legacy card body" });
    }
    if (target.pathname === `/api/v10/channels/${threadId}/messages`) {
      return response([journalMessage({ id: "1527000000000000000", cardId, state: "in_progress" })]);
    }
    return response({ message: "unexpected route" }, false, 404);
  };
  const result = await _internals.buildMigrationPlan({
    boards: [{ id: "mazer-active", project: "Mazer", role: "active", forumChannelId: "mazer-forum" }],
    mazerCards: [{
      id: cardId,
      liveThreadId: threadId,
      title: "mazer: auth gate persistent login",
      state: "open",
      completionPercent: 90,
      summary: "Keep login persistent.",
    }],
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.eventCount, 1);
  assert.equal(result.journalPreservedCount, 1);
  assert.equal(result.rows[0].baselineState, "review");
  assert.equal(result.rows[0].journalState, "in_progress");
  assert.equal(result.events[0].card.state, "in_progress");
  assert.equal(result.events[0].card.previousState, undefined);
});
