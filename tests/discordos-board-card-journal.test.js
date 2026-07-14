const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-card-journal");

function response({ ok = true, status = 200, payload = null } = {}) {
  return { ok, status, json: async () => payload };
}

function event(overrides = {}) {
  return {
    schemaVersion: "atlas.board-card-journal.v1",
    eventId: "evt-001",
    occurredAt: "2026-07-13T12:00:00.000Z",
    actor: "fitness-task",
    card: {
      id: "FIT-42",
      project: "Fitness",
      sourceForumChannelId: "fitness-forum",
      title: "Feature: Journal every card checkpoint",
      type: "feature",
      state: "in_progress",
      priority: "High",
      owner: "Fitness",
      progress: "40%",
      summary: "Keep the card body and its progress thread synchronized.",
      objective: "Make work observable while it happens.",
      acceptanceCriteria: ["Starter body is canonical", "Progress is appended"],
      discoveries: ["State-only sync was insufficient"],
      nextActions: ["Run live readback"],
      blockers: [],
      evidence: ["focused tests passed"],
    },
    entry: {
      kind: "checkpoint",
      headline: "Implementation checkpoint",
      completed: ["Built the renderer"],
      discovered: ["Legacy context must be retained"],
      next: ["Verify idempotency"],
      blockers: [],
      evidence: ["tests: green"],
    },
    correlation: {
      taskId: "task-42",
      branch: "codex/card-journal",
      commit: null,
    },
    ...overrides,
  };
}

test("canonical body normalizes metadata and preserves legacy context", () => {
  const normalized = _internals.normalizeEvent(event());
  const body = _internals.buildCanonicalBody(normalized, "Legacy planning notes");
  assert(body.includes("ATLAS-CARD-ID: `FIT-42`"));
  assert(body.includes("- state: `in_progress`"));
  assert(body.includes("## Acceptance criteria"));
  assert(body.includes("- autonomous implementation: `not_admitted`"));
  assert(body.includes("Legacy planning notes"));
  assert(body.endsWith(_internals.CARD_END));
  assert(body.length <= 2000);
});

test("canonical body can be parsed back into the autonomy contract", () => {
  const normalized = _internals.normalizeEvent(event({
    card: { ...event().card, state: "ready" },
  }));
  const parsed = _internals.parseManagedCardBody(_internals.buildCanonicalBody(normalized));
  assert.equal(parsed.id, "FIT-42");
  assert.equal(parsed.project, "Fitness");
  assert.equal(parsed.state, "ready");
  assert.equal(parsed.objective, "Make work observable while it happens.");
  assert.deepEqual(parsed.acceptanceCriteria, ["Starter body is canonical", "Progress is appended"]);
  assert.deepEqual(parsed.nextActions, ["Run live readback"]);
  assert.deepEqual(parsed.blockers, []);
});

test("Ready is the only autonomous execution admission state", () => {
  const ready = _internals.normalizeEvent(event({
    card: {
      ...event().card,
      previousState: "planning",
      state: "ready",
    },
  }));
  const admission = _internals.evaluateAutonomyAdmission(ready.card);
  assert.equal(admission.admitted, true);
  assert.equal(admission.status, "ready_for_autonomous_execution");
  assert.deepEqual(_internals.validateEvent(ready), []);
  assert(_internals.buildCanonicalBody(ready).includes("- autonomous implementation: `admitted`"));
});

test("Ready fails closed when planning is incomplete or blocked", () => {
  const ready = _internals.normalizeEvent(event({
    card: {
      ...event().card,
      previousState: "planning",
      state: "ready",
      owner: "Unassigned",
      priority: "Unspecified",
      objective: "",
      acceptanceCriteria: [],
      nextActions: [],
      blockers: ["Architecture decision pending"],
    },
  }));
  const admission = _internals.evaluateAutonomyAdmission(ready.card);
  assert.equal(admission.admitted, false);
  assert(admission.reasonCodes.includes("autonomy_objective_missing"));
  assert(admission.reasonCodes.includes("autonomy_acceptance_criteria_missing"));
  assert(admission.reasonCodes.includes("autonomy_next_actions_missing"));
  assert(admission.reasonCodes.includes("autonomy_owner_unassigned"));
  assert(admission.reasonCodes.includes("autonomy_priority_unassigned"));
  assert(admission.reasonCodes.includes("autonomy_blockers_present"));
  assert.deepEqual(_internals.validateEvent(ready), admission.reasonCodes);
});

test("lifecycle transitions admit the planning path and reject skipped gates", () => {
  assert.equal(_internals.validateLifecycleTransition("intake", "planning").allowed, true);
  assert.equal(_internals.validateLifecycleTransition("planning", "ready").allowed, true);
  assert.equal(_internals.validateLifecycleTransition("ready", "in_progress").allowed, true);
  assert.equal(_internals.validateLifecycleTransition("in_progress", "review").allowed, true);
  assert.equal(_internals.validateLifecycleTransition("review", "completed").allowed, true);
  assert.equal(_internals.validateLifecycleTransition("completed", "archived").allowed, true);
  assert.equal(_internals.validateLifecycleTransition("in_progress", "in_progress").status, "same_state_checkpoint");
  assert.deepEqual(
    _internals.validateLifecycleTransition("planning", "in_progress").reasonCodes,
    ["card_lifecycle_transition_not_admitted"]
  );
});

test("card titles repair mojibake and normalize dash separators", () => {
  assert.equal(
    _internals.normalizeCardTitle("Feature: History \u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d Progress"),
    "Feature: History - Progress"
  );
  assert.equal(
    _internals.normalizeCardTitle("Feature: History â€” Progress"),
    "Feature: History - Progress"
  );
  assert.equal(
    _internals.normalizeCardTitle("Feature: History — Progress"),
    "Feature: History - Progress"
  );
});

test("known encoding corruption is repaired in every event text field", () => {
  const mojibake = "\u00e2\u20ac\u201d";
  const normalized = _internals.normalizeEvent(event({
    card: {
      ...event().card,
      summary: `Summary ${mojibake} detail`,
      discoveries: [`Discovery ${mojibake} detail`],
    },
    entry: {
      ...event().entry,
      headline: `Checkpoint ${mojibake} verified`,
    },
  }));
  assert.equal(normalized.card.summary, "Summary - detail");
  assert.deepEqual(normalized.card.discoveries, ["Discovery - detail"]);
  assert.equal(normalized.entry.headline, "Checkpoint - verified");
});

test("managed card refresh replaces stale managed content without duplicating it", () => {
  const normalized = _internals.normalizeEvent(event());
  const oldBody = `${_internals.CARD_START}\nATLAS-CARD-ID: \`FIT-42\`\n- state: \`planning\`\n${_internals.CARD_END}\n\nOperator note`;
  const body = _internals.buildCanonicalBody(normalized, oldBody);
  assert.equal((body.match(/ATLAS-CARD-ID/g) || []).length, 1);
  assert(!body.includes("- state: `planning`"));
  assert(body.includes("Operator note"));
});

test("board provenance links survive canonical body compaction", () => {
  const normalized = _internals.normalizeEvent(event({
    card: {
      ...event().card,
      summary: "Historical record",
      acceptanceCriteria: Array.from({ length: 30 }, (_, index) => `Long acceptance criterion ${index} ${"x".repeat(80)}`),
      evidence: [
        "proof passed",
        "original card: https://discord.com/channels/guild/source-thread",
      ],
    },
  }));
  const body = _internals.buildCanonicalBody(normalized, "Legacy context");
  assert(body.includes("## Board links"));
  assert(body.includes("original card: https://discord.com/channels/guild/source-thread"));
  assert(body.endsWith(_internals.CARD_END));
  assert(body.length <= 2000);
});

test("journal entry contains stable identity, discoveries, and task correlation", () => {
  const message = _internals.buildJournalMessage(_internals.normalizeEvent(event()));
  assert(message.includes("ATLAS-JOURNAL-EVENT-ID: `evt-001`"));
  assert(message.includes("- card: `FIT-42`"));
  assert(message.includes("- idempotency: `evt-001`"));
  assert(message.includes("## Discovered"));
  assert(message.includes("Legacy context must be retained"));
  assert(message.includes("- task: `task-42`"));
  assert(message.length <= 2000);
});

test("live mutation requires both journal guards", async () => {
  const result = await _internals.buildBoardCardJournal({
    payload: event(),
    apply: true,
    allowApply: false,
    env: { DISCORDOS_BOT_TOKEN: "token" },
  });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("board_card_journal_double_guard_missing"));
  assert(result.reasonCodes.includes("board_card_journal_not_admitted"));
});

test("dry run reads identity and proposes a new card without writes", async () => {
  const calls = [];
  const result = await _internals.buildBoardCardJournal({
    payload: event(),
    apply: false,
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/channels/fitness-forum")) return response({ payload: { id: "fitness-forum", guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/fitness-forum/threads/archived/public?limit=100")) return response({ payload: { threads: [] } });
      throw new Error(`unexpected ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].preview.action, "create_card_and_append_journal");
  assert(calls.every((call) => call.method === "GET"));
});

test("apply creates card, appends journal, and reads back both surfaces", async () => {
  let starter = "";
  let journal = "";
  const result = await _internals.buildBoardCardJournal({
    payload: event(),
    apply: true,
    allowApply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_BOARD_CARD_JOURNAL: "enabled",
    },
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/fitness-forum") && init.method === "GET") {
        return response({ payload: { id: "fitness-forum", guild_id: "guild" } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/fitness-forum/threads/archived/public?limit=100")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/fitness-forum/threads") && init.method === "POST") {
        starter = JSON.parse(init.body).message.content;
        return response({ status: 201, payload: { id: "new-thread", message: { id: "new-thread" } } });
      }
      if (url.endsWith("/channels/new-thread/messages?limit=100")) return response({ payload: [] });
      if (url.endsWith("/channels/new-thread/messages") && init.method === "POST") {
        journal = JSON.parse(init.body).content;
        return response({ status: 201, payload: { id: "journal-message", content: journal } });
      }
      if (url.endsWith("/channels/new-thread/messages/new-thread")) return response({ payload: { id: "new-thread", content: starter } });
      if (url.endsWith("/channels/new-thread/messages/journal-message")) return response({ payload: { id: "journal-message", content: journal } });
      throw new Error(`unexpected ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].cardAction, "created");
  assert.equal(result.results[0].journalAction, "created");
  assert.deepEqual(result.results[0].readback, { starter: true, journal: true });
});

test("retry reuses one journal event instead of posting a duplicate", async () => {
  const normalized = _internals.normalizeEvent(event({ card: { ...event().card, threadId: "existing-thread" } }));
  const starter = _internals.buildCanonicalBody(normalized, "");
  const journal = _internals.buildJournalMessage(normalized);
  let posts = 0;
  const result = await _internals.buildBoardCardJournal({
    payload: event({ card: { ...event().card, threadId: "existing-thread" } }),
    apply: true,
    allowApply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_BOARD_CARD_JOURNAL: "enabled",
    },
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/fitness-forum") && init.method === "GET") return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [{ id: "existing-thread", name: event().card.title, parent_id: "fitness-forum", thread_metadata: { archived: false } }] } });
      if (url.endsWith("/channels/fitness-forum/threads/archived/public?limit=100")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/existing-thread/messages/existing-thread") && init.method === "GET") return response({ payload: { id: "existing-thread", content: starter } });
      if (url.endsWith("/channels/existing-thread/messages/existing-thread") && init.method === "PATCH") return response({ payload: { id: "existing-thread", content: starter } });
      if (url.endsWith("/channels/existing-thread/messages?limit=100")) return response({ payload: [{ id: "existing-journal", content: journal }] });
      if (url.endsWith("/channels/existing-thread/messages/existing-journal")) return response({ payload: { id: "existing-journal", content: journal } });
      if (url.endsWith("/channels/existing-thread/messages") && init.method === "POST") {
        posts += 1;
        return response({ status: 201, payload: { id: "unexpected" } });
      }
      throw new Error(`unexpected ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].journalAction, "reused");
  assert.equal(posts, 0);
});

test("retry finds an existing journal event beyond the first message page", async () => {
  const normalized = _internals.normalizeEvent(event({ card: { ...event().card, threadId: "existing-thread" } }));
  const starter = _internals.buildCanonicalBody(normalized, "");
  const journal = _internals.buildJournalMessage(normalized);
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: `new-${100 - index}`,
    content: "other event",
  }));
  let posts = 0;
  const result = await _internals.buildBoardCardJournal({
    payload: event({ card: { ...event().card, threadId: "existing-thread" } }),
    apply: true,
    allowApply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_BOARD_CARD_JOURNAL: "enabled",
    },
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/fitness-forum") && init.method === "GET") return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [{ id: "existing-thread", name: event().card.title, parent_id: "fitness-forum", thread_metadata: { archived: false } }] } });
      if (url.endsWith("/channels/fitness-forum/threads/archived/public?limit=100")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/existing-thread/messages/existing-thread") && init.method === "GET") return response({ payload: { id: "existing-thread", content: starter } });
      if (url.endsWith("/channels/existing-thread/messages/existing-thread") && init.method === "PATCH") return response({ payload: { id: "existing-thread", content: starter } });
      if (url.endsWith("/channels/existing-thread/messages?limit=100")) return response({ payload: firstPage });
      if (url.endsWith("/channels/existing-thread/messages?limit=100&before=new-1")) return response({ payload: [{ id: "existing-journal", content: journal }] });
      if (url.endsWith("/channels/existing-thread/messages/existing-journal")) return response({ payload: { id: "existing-journal", content: journal } });
      if (url.endsWith("/channels/existing-thread/messages") && init.method === "POST") {
        posts += 1;
        return response({ status: 201, payload: { id: "unexpected" } });
      }
      throw new Error(`unexpected ${init.method} ${url}`);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.results[0].journalAction, "reused");
  assert.equal(posts, 0);
});

test("legacy starter is preserved in thread messages before normalization", async () => {
  const raw = event({ card: { ...event().card, threadId: "legacy-thread" } });
  const legacyBody = "Legacy full planning context that must survive migration.";
  let starter = legacyBody;
  let journalBody = "";
  let snapshotBody = "";
  const result = await _internals.buildBoardCardJournal({
    payload: raw,
    apply: true,
    allowApply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_BOARD_CARD_JOURNAL: "enabled",
    },
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/fitness-forum") && init.method === "GET") return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [{ id: "legacy-thread", name: event().card.title, parent_id: "fitness-forum", thread_metadata: { archived: false } }] } });
      if (url.endsWith("/channels/fitness-forum/threads/archived/public?limit=100")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/legacy-thread/messages/legacy-thread") && init.method === "GET") return response({ payload: { id: "legacy-thread", content: starter } });
      if (url.endsWith("/channels/legacy-thread/messages/legacy-thread") && init.method === "PATCH") {
        starter = JSON.parse(init.body).content;
        return response({ payload: { id: "legacy-thread", content: starter } });
      }
      if (url.endsWith("/channels/legacy-thread/messages?limit=100")) return response({ payload: [] });
      if (url.endsWith("/channels/legacy-thread/messages") && init.method === "POST") {
        const content = JSON.parse(init.body).content;
        if (content.includes("ATLAS-LEGACY-SNAPSHOT-ID")) {
          snapshotBody = content;
          return response({ status: 201, payload: { id: "snapshot-message", content } });
        }
        journalBody = content;
        return response({ status: 201, payload: { id: "journal-message", content } });
      }
      if (url.endsWith("/channels/legacy-thread/messages/journal-message")) return response({ payload: { id: "journal-message", content: journalBody } });
      throw new Error(`unexpected ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].legacySnapshot.action, "created");
  assert(snapshotBody.includes(legacyBody));
  assert(starter.includes(_internals.CARD_START));
});

test("archived historical card is reopened for journaling and restored afterward", async () => {
  const completedEvent = event({
    card: {
      ...event().card,
      sourceForumChannelId: "completed-forum",
      threadId: "archived-thread",
      title: "Feature: Completed history",
      state: "completed",
      progress: "100%",
    },
  });
  const normalized = _internals.normalizeEvent(completedEvent);
  let starter = _internals.buildCanonicalBody(normalized, "");
  let journalBody = "";
  const stateChanges = [];
  const result = await _internals.buildBoardCardJournal({
    payload: completedEvent,
    apply: true,
    allowApply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_BOARD_CARD_JOURNAL: "enabled",
    },
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/completed-forum") && init.method === "GET") return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [{ id: "archived-thread", name: "Old title", parent_id: "completed-forum", thread_metadata: { archived: true, locked: true } }] } });
      }
      if (url.endsWith("/channels/archived-thread") && init.method === "PATCH") {
        const body = JSON.parse(init.body);
        if (Object.hasOwn(body, "archived")) stateChanges.push(body);
        return response({ payload: { id: "archived-thread", ...body } });
      }
      if (url.endsWith("/channels/archived-thread/messages/archived-thread") && init.method === "GET") return response({ payload: { id: "archived-thread", content: starter } });
      if (url.endsWith("/channels/archived-thread/messages/archived-thread") && init.method === "PATCH") {
        starter = JSON.parse(init.body).content;
        return response({ payload: { id: "archived-thread", content: starter } });
      }
      if (url.endsWith("/channels/archived-thread/messages?limit=100")) return response({ payload: [] });
      if (url.endsWith("/channels/archived-thread/messages") && init.method === "POST") {
        journalBody = JSON.parse(init.body).content;
        return response({ status: 201, payload: { id: "journal-message", content: journalBody } });
      }
      if (url.endsWith("/channels/archived-thread/messages/journal-message")) return response({ payload: { id: "journal-message", content: journalBody } });
      throw new Error(`unexpected ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].archiveRestore, "restored");
  assert.deepEqual(stateChanges, [
    { archived: false, locked: false },
    { archived: true, locked: true },
  ]);
  assert.equal(result.results[0].journalAction, "created");
});

test("duplicate stable identities block instead of guessing", async () => {
  const marker = _internals.cardMarker("FIT-42");
  const located = await _internals.findCardThread({
    event: _internals.normalizeEvent(event()),
    threads: [
      { id: "one", name: "One" },
      { id: "two", name: "Two" },
    ],
    token: "token",
    fetchImpl: async () => response({ payload: { content: marker } }),
  });
  assert.equal(located.match, null);
  assert(located.reasonCodes.includes("duplicate_stable_card_identity"));
});

test("forum inventory reads every archived thread page", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: `archived-${index}`,
    name: `Archived ${index}`,
    parent_id: "forum",
    thread_metadata: {
      archived: true,
      archive_timestamp: `2026-07-13T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
    },
  }));
  firstPage.at(-1).thread_metadata.archive_timestamp = "2026-07-12T00:00:00.000Z";
  const result = await _internals.listForumThreads({
    forumChannelId: "forum",
    guildId: "guild",
    token: "token",
    fetchImpl: async (url) => {
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: firstPage, has_more: true } });
      }
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100&before=2026-07-12T00%3A00%3A00.000Z")) {
        return response({ payload: { threads: [{ id: "archived-100", name: "Archived 100", parent_id: "forum", thread_metadata: { archived: true } }], has_more: false } });
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.archivedPageCount, 2);
  assert.equal(result.threads.length, 101);
});

test("forum inventory fails closed when archived pagination has no cursor", async () => {
  const result = await _internals.listForumThreads({
    forumChannelId: "forum",
    guildId: "guild",
    token: "token",
    fetchImpl: async (url) => {
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: true } });
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.truncated, true);
  assert(result.reasonCodes.includes("archived_threads_pagination_cursor_missing"));
});
