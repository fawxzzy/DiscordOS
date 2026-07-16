const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-completed-transfer");
const { _internals: journal } = require("../scripts/discordos-board-card-journal");

function response({ ok = true, status = 200, payload = null } = {}) {
  return { ok, status, json: async () => payload };
}

const baseOptions = {
  sourceThreadId: "source-thread",
  sourceForumChannelId: "source-forum",
  completedForumChannelId: "completed-forum",
  cardId: "CARD-42",
  evidence: "tests and readback passed",
  env: {
    DISCORDOS_BOT_TOKEN: "token",
    DISCORDOS_BOARD_COMPLETED_TRANSFER: "enabled",
  },
};

function makeExistingTransferHarness({
  eventId,
  destinationArchived = false,
  destinationLocked = false,
  destinationBody = "exact",
  destinationTags = ["feature-tag", "completed-tag"],
  reactionPresent = true,
  journalMode = "exact",
  failJournalCreate = false,
  failJournalUpdate = false,
  failDestinationRestoreOnce = false,
  failDestinationRestoreAlways = false,
  sourceMode = "postimage",
  omitUnlockedSourceLock = false,
} = {}) {
  const occurredAt = "2026-07-16T15:00:00.000Z";
  const originalSource = "Original card";
  const sourceUrl = "https://discord.com/channels/guild/source-thread";
  const destinationUrl = "https://discord.com/channels/guild/completed-thread";
  const expectedDestination = _internals.buildCompletedMessage({
    cardId: "CARD-42",
    sourceForumChannelId: "source-forum",
    title: "Card title",
    eventId,
    occurredAt,
    sourceContent: originalSource,
    sourceUrl,
    destinationUrl: null,
    evidence: baseOptions.evidence,
  });
  const expectedSource = _internals.buildSourceMessage({ sourceContent: originalSource, destinationUrl, cardId: "CARD-42" });
  const expectedJournal = journal.buildJournalMessage(_internals.buildCompletedEvent({
    cardId: "CARD-42",
    sourceForumChannelId: "source-forum",
    title: "Card title",
    eventId,
    occurredAt,
    sourceUrl,
    destinationUrl,
    evidence: baseOptions.evidence,
  }));
  const state = {
    sourceContent: sourceMode === "postimage" ? expectedSource : originalSource,
    sourceArchived: sourceMode === "postimage",
    sourceLocked: sourceMode === "postimage",
    destinationName: "Card title",
    destinationContent: destinationBody === "exact" ? expectedDestination : `${_internals.cardMarker("CARD-42")}\ncorrupt-body`,
    destinationTags: [...destinationTags],
    destinationArchived,
    destinationLocked,
    reactionPresent,
    destinationRestoreFailuresRemaining: failDestinationRestoreAlways ? 6 : failDestinationRestoreOnce ? 3 : 0,
    journalContent: journalMode === "exact"
      ? expectedJournal
      : journalMode === "corrupt"
        ? `${journal.eventMarker(eventId)}\ncorrupt-journal`
        : null,
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    if (url.endsWith("/channels/source-thread/messages/source-thread")) {
      if (method === "PATCH") state.sourceContent = body.content;
      return response({ payload: { id: "source-thread", content: state.sourceContent } });
    }
    if (url.endsWith("/channels/source-thread")) {
      if (method === "PATCH") {
        state.sourceArchived = body.archived;
        state.sourceLocked = body.locked;
      }
      return response({ payload: {
        id: "source-thread",
        name: "Card title",
        parent_id: "source-forum",
        guild_id: "guild",
        thread_metadata: {
          archived: state.sourceArchived,
          ...(!omitUnlockedSourceLock || state.sourceLocked ? { locked: state.sourceLocked } : {}),
        },
      } });
    }
    if (url.endsWith("/guilds/guild/threads/active")) {
      return response({ payload: { threads: state.destinationArchived ? [] : [{
        id: "completed-thread",
        name: state.destinationName,
        parent_id: "completed-forum",
        applied_tags: [...state.destinationTags],
        thread_metadata: { archived: false, locked: state.destinationLocked },
      }] } });
    }
    if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
      return response({ payload: { threads: state.destinationArchived ? [{
        id: "completed-thread",
        name: state.destinationName,
        parent_id: "completed-forum",
        applied_tags: [...state.destinationTags],
        thread_metadata: {
          archived: true,
          locked: state.destinationLocked,
          archive_timestamp: "2026-07-16T14:00:00.000Z",
        },
      }] : [], has_more: false } });
    }
    if (url.includes("/channels/completed-thread/messages/completed-thread/reactions/")) {
      if (method === "PUT") state.reactionPresent = true;
      return response({ status: 204, payload: null });
    }
    if (url.endsWith("/channels/completed-thread/messages/completed-thread")) {
      if (method === "PATCH") state.destinationContent = body.content;
      return response({ payload: {
        id: "completed-thread",
        content: state.destinationContent,
        reactions: state.reactionPresent
          ? [{ emoji: { name: "success", id: "1507384062166302851" }, me: true, count: 1 }]
          : [],
      } });
    }
    if (url.endsWith("/channels/completed-thread/messages?limit=100")) {
      return response({ payload: state.journalContent == null ? [] : [{ id: "journal", content: state.journalContent }] });
    }
    if (url.endsWith("/channels/completed-thread/messages/journal")) {
      if (method === "PATCH") {
        if (failJournalUpdate) return response({ ok: false, status: 500, payload: { message: "Injected journal update failure" } });
        state.journalContent = body.content;
      }
      return response({ payload: { id: "journal", content: state.journalContent } });
    }
    if (url.endsWith("/channels/completed-thread/messages") && method === "POST") {
      if (failJournalCreate) return response({ ok: false, status: 500, payload: { message: "Injected journal create failure" } });
      state.journalContent = body.content;
      return response({ status: 201, payload: { id: "journal" } });
    }
    if (url.endsWith("/channels/completed-thread")) {
      if (method === "PATCH") {
        if (Object.hasOwn(body, "archived")) {
          if (body.archived === true && state.destinationRestoreFailuresRemaining > 0) {
            state.destinationRestoreFailuresRemaining -= 1;
            return response({ ok: false, status: 500, payload: { message: "Injected destination restore failure" } });
          }
          state.destinationArchived = body.archived;
          state.destinationLocked = body.locked;
        }
        if (Object.hasOwn(body, "applied_tags")) state.destinationTags = [...body.applied_tags];
        if (Object.hasOwn(body, "name")) state.destinationName = body.name;
      }
      return response({ payload: {
        id: "completed-thread",
        name: state.destinationName,
        parent_id: "completed-forum",
        applied_tags: [...state.destinationTags],
        thread_metadata: { archived: state.destinationArchived, locked: state.destinationLocked },
      } });
    }
    throw new Error(`unexpected request ${method} ${url}`);
  };
  return {
    state,
    calls,
    expectedDestination,
    expectedSource,
    expectedJournal,
    run: (overrides = {}) => _internals.buildCompletedBoardTransfer({
      ...baseOptions,
      eventId,
      occurredAt,
      completedTagIds: ["feature-tag", "completed-tag"],
      requireStableIdentity: true,
      sourceContentPreimage: originalSource,
      sourceTitlePreimage: "Card title",
      destinationStatePreimage: { archived: destinationArchived, locked: destinationLocked },
      repairExactPostimage: true,
      apply: true,
      allowApply: true,
      fetchImpl,
      ...overrides,
    }),
  };
}

test("completed transfer requires both apply guards", async () => {
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    apply: true,
    allowApply: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert(result.reasonCodes.includes("board_completed_transfer_double_guard_missing"));
  assert(result.reasonCodes.includes("board_completed_transfer_not_admitted"));
});

test("completed transfer dry-run reads both boards without mutation", async () => {
  const calls = [];
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    apply: false,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        return response({ payload: { id: "source-thread", content: "Original card" } });
      }
      if (url.endsWith("/channels/source-thread")) {
        return response({ payload: { id: "source-thread", name: "Card title", parent_id: "source-forum", guild_id: "guild" } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [] } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "dry_run");
  assert.equal(result.preview.action, "create_completed_card");
  assert(calls.every((call) => call.method === "GET"));
});

test("completed transfer creates, verifies, links, archives, and locks", async () => {
  const calls = [];
  let completedContent = "";
  let completedTags = [];
  let completionJournal = "";
  let sourceContent = "Original card details";
  let reactionPresent = false;
  let sourceArchived = false;
  let sourceLocked = false;
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    completedTagIds: ["feature-tag", "completed-tag"],
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        if (init.method === "PATCH") {
          sourceContent = JSON.parse(init.body).content;
          return response({ payload: { id: "source-thread", content: sourceContent } });
        }
        return response({ payload: { id: "source-thread", content: sourceContent } });
      }
      if (url.endsWith("/channels/source-thread")) {
        if (init.method === "PATCH") {
          const body = JSON.parse(init.body);
          sourceArchived = body.archived;
          sourceLocked = body.locked;
        }
        return response({ payload: {
          id: "source-thread",
          name: "Card title",
          parent_id: "source-forum",
          guild_id: "guild",
          thread_metadata: { archived: sourceArchived, locked: sourceLocked },
        } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [] } });
      }
      if (url.endsWith("/channels/completed-forum/threads") && init.method === "POST") {
        const payload = JSON.parse(init.body);
        completedContent = payload.message.content;
        completedTags = payload.applied_tags;
        return response({ status: 201, payload: { id: "completed-thread", message: { id: "completed-thread" } } });
      }
      if (url.endsWith("/channels/completed-thread/messages/completed-thread")) {
        return response({ payload: {
          id: "completed-thread",
          content: completedContent,
          reactions: reactionPresent
            ? [{ emoji: { name: "success", id: "1507384062166302851" }, me: true, count: 1 }]
            : [],
        } });
      }
      if (url.endsWith("/channels/completed-thread/messages?limit=100")) {
        return response({ payload: [] });
      }
      if (url.endsWith("/channels/completed-thread/messages") && init.method === "POST") {
        completionJournal = JSON.parse(init.body).content;
        return response({ status: 201, payload: { id: "completion-journal", content: completionJournal } });
      }
      if (url.endsWith("/channels/completed-thread/messages/completion-journal")) {
        return response({ payload: { id: "completion-journal", content: completionJournal } });
      }
      if (url.includes("/channels/completed-thread/messages/completed-thread/reactions/") && init.method === "PUT") {
        reactionPresent = true;
        return response({ status: 204 });
      }
      if (url.endsWith("/channels/completed-thread")) {
        return response({ payload: { id: "completed-thread", name: "Card title", parent_id: "completed-forum", applied_tags: completedTags } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.status, "transferred");
  assert.equal(result.completed.threadId, "completed-thread");
  assert.equal(result.completed.reaction.presentAfter, true);
  assert.equal(result.completed.journal.action, "created");
  assert.equal(result.completed.readback.canonicalBodyPresent, true);
  assert.equal(result.completed.readback.appliedTagsExact, true);
  assert.deepEqual(completedTags, ["feature-tag", "completed-tag"]);
  assert.equal(result.completed.readback.journalMarkerPresent, true);
  assert.equal(result.source.readback.archived, true);
  assert.equal(result.source.readback.locked, true);
  assert(sourceContent.includes("https://discord.com/channels/guild/completed-thread"));
  assert(completedContent.includes("ATLAS-CARD-ID: `CARD-42`"));
  assert(completedContent.includes("<!-- ATLAS-CARD:START -->"));
  assert(completionJournal.includes("ATLAS-JOURNAL-EVENT-ID: `completed:CARD-42`"));
  assert(calls.some((call) => call.url.endsWith("/channels/source-thread") && call.method === "PATCH"));
});

test("a newly created destination persists exact resume state after journal failure", async () => {
  const eventId = "completed:CARD-42:new-destination-resume";
  const occurredAt = "2026-07-16T18:00:00.000Z";
  let destinationExists = false;
  let destinationContent = "";
  let destinationTags = [];
  let journalContent = null;
  let journalCreateFails = true;
  let reactionPresent = false;
  let sourceContent = "Original card";
  let sourceArchived = false;
  let sourceLocked = false;
  let destinationCreates = 0;
  let journalCreates = 0;
  const run = (destinationStatePreimage = null) => _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    eventId,
    occurredAt,
    completedTagIds: ["feature-tag", "completed-tag"],
    requireStableIdentity: true,
    sourceContentPreimage: "Original card",
    sourceTitlePreimage: "Card title",
    destinationStatePreimage,
    repairExactPostimage: true,
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        if (init.method === "PATCH") sourceContent = JSON.parse(init.body).content;
        return response({ payload: { id: "source-thread", content: sourceContent } });
      }
      if (url.endsWith("/channels/source-thread")) {
        if (init.method === "PATCH") {
          const body = JSON.parse(init.body);
          sourceArchived = body.archived;
          sourceLocked = body.locked;
        }
        return response({ payload: {
          id: "source-thread",
          name: "Card title",
          parent_id: "source-forum",
          guild_id: "guild",
          thread_metadata: { archived: sourceArchived, locked: sourceLocked },
        } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) {
        return response({ payload: { threads: destinationExists ? [{
          id: "completed-thread",
          name: "Card title",
          parent_id: "completed-forum",
          applied_tags: destinationTags,
          thread_metadata: { archived: false, locked: false },
        }] : [] } });
      }
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: false } });
      }
      if (url.endsWith("/channels/completed-forum/threads") && init.method === "POST") {
        destinationCreates += 1;
        destinationExists = true;
        const body = JSON.parse(init.body);
        destinationContent = body.message.content;
        destinationTags = body.applied_tags;
        return response({ status: 201, payload: { id: "completed-thread", message: { id: "completed-thread" } } });
      }
      if (url.endsWith("/channels/completed-thread/messages/completed-thread")) {
        return response({ payload: {
          id: "completed-thread",
          content: destinationContent,
          reactions: reactionPresent
            ? [{ emoji: { name: "success", id: "1507384062166302851" }, me: true, count: 1 }]
            : [],
        } });
      }
      if (url.endsWith("/channels/completed-thread/messages?limit=100")) {
        return response({ payload: journalContent ? [{ id: "completion-journal", content: journalContent }] : [] });
      }
      if (url.endsWith("/channels/completed-thread/messages") && init.method === "POST") {
        if (journalCreateFails) return response({ ok: false, status: 500, payload: { message: "Injected journal failure" } });
        journalCreates += 1;
        journalContent = JSON.parse(init.body).content;
        return response({ status: 201, payload: { id: "completion-journal", content: journalContent } });
      }
      if (url.endsWith("/channels/completed-thread/messages/completion-journal")) {
        return response({ payload: { id: "completion-journal", content: journalContent } });
      }
      if (url.includes("/channels/completed-thread/messages/completed-thread/reactions/") && init.method === "PUT") {
        reactionPresent = true;
        return response({ status: 204 });
      }
      if (url.endsWith("/channels/completed-thread")) {
        return response({ payload: {
          id: "completed-thread",
          name: "Card title",
          parent_id: "completed-forum",
          applied_tags: destinationTags,
          thread_metadata: { archived: false, locked: false },
        } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });

  const partial = await run();
  assert.equal(partial.ok, false);
  assert(partial.reasonCodes.includes("completed_card_journal_create_failed"));
  assert.equal(partial.writeCount, 1, "the destination creation is retained in the blocked receipt");
  assert.equal(partial.completed.threadId, "completed-thread");
  assert.deepEqual(partial.completed.archiveState.expected, { archived: false, locked: false });

  journalCreateFails = false;
  const resumeState = { threadId: partial.completed.threadId, ...partial.completed.archiveState.expected };
  const resumed = await run(resumeState);
  assert.equal(resumed.ok, true, JSON.stringify(resumed, null, 2));
  assert.equal(resumed.writeCount, 4, "journal, reaction, source link, and source archive are the only resume writes");
  assert.equal(destinationCreates, 1, "resume must reuse the exact created destination");
  assert.equal(journalCreates, 1);

  const replay = await run(resumeState);
  assert.equal(replay.ok, true, JSON.stringify(replay, null, 2));
  assert.equal(replay.writeCount, 0);
  assert.equal(destinationCreates, 1);
  assert.equal(journalCreates, 1);
});

test("destination failure never archives the source card", async () => {
  const calls = [];
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        return response({ payload: { id: "source-thread", content: "Original card" } });
      }
      if (url.endsWith("/channels/source-thread")) {
        return response({ payload: { id: "source-thread", name: "Card title", parent_id: "source-forum", guild_id: "guild" } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [] } });
      }
      if (url.endsWith("/channels/completed-forum/threads") && init.method === "POST") {
        return response({ ok: false, status: 403, payload: { message: "Missing Permissions" } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert(result.reasonCodes.includes("card_thread_create_failed"));
  assert.equal(result.completed.archiveState.expected, null, "failed creation must not invent destination state");
  assert(!calls.some((call) => call.url.endsWith("/channels/source-thread") && call.method === "PATCH"));
});

test("completed message identity makes retries deterministic", () => {
  const content = _internals.buildCompletedMessage({
    cardId: "CARD-42",
    sourceContent: "Original card",
    sourceUrl: "https://discord.com/channels/guild/source",
    evidence: "verified",
  });
  assert(content.includes("ATLAS-CARD-ID: `CARD-42`"));
  assert(content.includes("- state: `completed`"));
  assert(content.includes("https://discord.com/channels/guild/source"));
  assert(content.length <= 2000);
});

test("completed transfer preserves the managed-card boundary for long source cards", () => {
  const destinationUrl = "https://discord.com/channels/guild/completed-thread";
  const sourceContent = `${journal.CARD_START}\nATLAS-CARD-ID: \`CARD-42\`\n- state: \`review\`\n\n${"Detailed work evidence. ".repeat(120)}\n${journal.CARD_END}`;
  const content = _internals.buildSourceMessage({
    sourceContent,
    destinationUrl,
    cardId: "CARD-42",
  });

  assert(content.startsWith(journal.CARD_START));
  assert(content.includes("## Archived completion"));
  assert(content.includes(`ATLAS-COMPLETED-CARD: ${destinationUrl}`));
  assert(content.endsWith(journal.CARD_END));
  assert.equal(content.match(new RegExp(journal.CARD_END, "g"))?.length, 1);
  assert(content.length <= 2000);
});

test("completed transfer repairs a source card whose closing boundary was truncated", () => {
  const destinationUrl = "https://discord.com/channels/guild/completed-thread";
  const brokenSource = `${journal.CARD_START}\nATLAS-CARD-ID: \`CARD-42\`\n- state: \`review\`\n\nExisting details\n\n## Archived completion\n- card id: \`CARD-42\`\n- completed card: ${destinationUrl}\nATLAS-COMPLETED-CARD: ${destinationUrl}`;
  const content = _internals.buildSourceMessage({
    sourceContent: brokenSource,
    destinationUrl,
    cardId: "CARD-42",
  });

  assert(content.startsWith(journal.CARD_START));
  assert(content.endsWith(journal.CARD_END));
  assert.equal(content.match(/## Archived completion/g)?.length, 1);
  assert.equal(content.match(new RegExp(journal.CARD_END, "g"))?.length, 1);
  assert(content.length <= 2000);
});

test("legacy completed cards are reused by one exact title match", async () => {
  const result = await _internals.findCompletedThread({
    threads: [
      { id: "legacy-completed", name: "Card title" },
      { id: "other", name: "Different card" },
    ],
    cardId: "CARD-42",
    expectedTitle: "Card title",
    token: "token",
    fetchImpl: async (url) => response({
      payload: { id: url.includes("legacy-completed") ? "legacy-completed" : "other", content: "legacy body" },
    }),
  });
  assert.equal(result.thread.id, "legacy-completed");
  assert.equal(result.matchedBy, "unique_legacy_title");
});

test("ambiguous legacy titles block instead of guessing", async () => {
  const result = await _internals.findCompletedThread({
    threads: [
      { id: "legacy-one", name: "Card title" },
      { id: "legacy-two", name: "Card title" },
    ],
    cardId: "CARD-42",
    expectedTitle: "Card title",
    token: "token",
    fetchImpl: async () => response({ payload: { content: "legacy body" } }),
  });
  assert.equal(result.ambiguous, true);
  assert.deepEqual(result.candidateThreadIds, ["legacy-one", "legacy-two"]);
});

test("duplicate stable identities are ambiguous", async () => {
  const result = await _internals.findCompletedThread({
    threads: [
      { id: "stable-one", name: "One" },
      { id: "stable-two", name: "Two" },
    ],
    cardId: "CARD-42",
    expectedTitle: "Card title",
    token: "token",
    fetchImpl: async () => response({ payload: { content: "ATLAS-CARD-ID: `CARD-42`" } }),
  });
  assert.equal(result.ambiguous, true);
  assert.equal(result.matchedBy, "ambiguous_stable_card_id");
  assert.deepEqual(result.candidateThreadIds, ["stable-one", "stable-two"]);
});

test("targeted transfers never reuse a title-only destination", async () => {
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    requireStableIdentity: true,
    apply: false,
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        return response({ payload: { id: "source-thread", content: "Original card" } });
      }
      if (url.endsWith("/channels/source-thread")) {
        return response({ payload: { id: "source-thread", name: "Card title", parent_id: "source-forum", guild_id: "guild" } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [{ id: "legacy", name: "Card title", parent_id: "completed-forum" }] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/legacy/messages/legacy")) return response({ payload: { id: "legacy", content: "legacy body" } });
      throw new Error(`unexpected request ${url}`);
    },
  });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("completed_card_stable_identity_required"));
});

test("delayed resume finds an archived stable destination beyond page one", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: `archived-${index}`,
    name: `Archived ${index}`,
    parent_id: "completed-forum",
    thread_metadata: { archive_timestamp: `2026-07-15T00:${String(index).padStart(2, "0")}:00.000Z` },
  }));
  const target = {
    id: "delayed-stable-destination",
    name: "Card title",
    parent_id: "completed-forum",
    thread_metadata: { archive_timestamp: "2026-07-14T00:00:00.000Z" },
  };
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    requireStableIdentity: true,
    apply: false,
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        return response({ payload: { id: "source-thread", content: "Original card" } });
      }
      if (url.endsWith("/channels/source-thread")) {
        return response({ payload: { id: "source-thread", name: "Card title", parent_id: "source-forum", guild_id: "guild" } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: firstPage, has_more: true } });
      }
      if (url.includes("/channels/completed-forum/threads/archived/public?limit=100&before=")) {
        return response({ payload: { threads: [target], has_more: false } });
      }
      if (url.endsWith("/channels/delayed-stable-destination/messages/delayed-stable-destination")) {
        return response({ payload: { id: target.id, content: "ATLAS-CARD-ID: `CARD-42`" } });
      }
      if (url.includes("/messages/")) return response({ payload: { content: "unrelated body" } });
      throw new Error(`unexpected request ${url}`);
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.preview.existingCompletedThreadId, target.id);
  assert.equal(result.preview.action, "reuse_completed_card");
});

test("completed-transfer pagination fails closed on missing cursors and bounded history limits", async () => {
  const archived = await _internals.listForumThreads({
    forumChannelId: "completed-forum",
    guildId: "guild",
    token: "token",
    fetchImpl: async (url) => {
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: true } });
      }
      throw new Error(`unexpected request ${url}`);
    },
  });
  assert.equal(archived.ok, false);
  assert(archived.reasonCodes.includes("completed_archived_threads_pagination_cursor_missing"));

  let pages = 0;
  const history = await _internals.readAllThreadMessages({
    threadId: "completed-thread",
    token: "token",
    fetchImpl: async () => {
      pages += 1;
      return response({ payload: Array.from({ length: 100 }, (_, index) => ({ id: `p${pages}-${index}` })) });
    },
  });
  assert.equal(history.ok, false);
  assert.equal(history.truncated, true);
  assert.equal(pages, 10);
  assert(history.reasonCodes.includes("completed_card_journal_history_pagination_limit"));
});

test("planned source preimage drift blocks before every mutation", async () => {
  const calls = [];
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    sourceContentPreimage: "Planned original card",
    sourceTitlePreimage: "Card title",
    requireStableIdentity: true,
    repairExactPostimage: true,
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        return response({ payload: { id: "source-thread", content: "Unexpected changed card" } });
      }
      if (url.endsWith("/channels/source-thread")) {
        return response({ payload: {
          id: "source-thread",
          name: "Card title",
          parent_id: "source-forum",
          guild_id: "guild",
          thread_metadata: { archived: false, locked: false },
        } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: false } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("source_card_planned_preimage_mismatch"));
  assert(calls.every((call) => call.method === "GET"));
});

test("planned source title rename after preflight blocks before every mutation", async () => {
  const calls = [];
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    sourceContentPreimage: "Original card",
    sourceTitlePreimage: "Card title",
    requireStableIdentity: true,
    repairExactPostimage: true,
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        return response({ payload: { id: "source-thread", content: "Original card" } });
      }
      if (url.endsWith("/channels/source-thread")) {
        return response({ payload: {
          id: "source-thread",
          name: "Renamed after preflight",
          parent_id: "source-forum",
          guild_id: "guild",
          thread_metadata: { archived: false },
        } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("source_card_planned_title_mismatch"));
  assert.equal(result.writeCount, 0);
  assert(calls.every((call) => call.method === "GET"));
});

test("pristine source requires explicit open state while omitted unlocked remains admissible", async () => {
  const blockedCalls = [];
  const blocked = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    sourceContentPreimage: "Original card",
    sourceTitlePreimage: "Card title",
    requireStableIdentity: true,
    repairExactPostimage: true,
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      blockedCalls.push({ url, method: init.method });
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        return response({ payload: { id: "source-thread", content: "Original card" } });
      }
      if (url.endsWith("/channels/source-thread")) {
        return response({ payload: {
          id: "source-thread",
          name: "Card title",
          parent_id: "source-forum",
          guild_id: "guild",
          thread_metadata: {},
        } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: false } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(blocked.ok, false);
  assert(blocked.reasonCodes.includes("source_card_planned_preimage_mismatch"));
  assert.equal(blocked.writeCount, 0);
  assert(blockedCalls.every((call) => call.method === "GET"));

  const admitted = makeExistingTransferHarness({
    eventId: "completed:CARD-42:omitted-unlocked-pristine",
    sourceMode: "preimage",
    omitUnlockedSourceLock: true,
  });
  const result = await admitted.run();
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.writeCount, 2);
  assert.equal(admitted.state.sourceContent, admitted.expectedSource);
  assert.equal(admitted.state.sourceArchived, true);
  assert.equal(admitted.state.sourceLocked, true);
});

test("exact archived destination replay remains archived and performs zero writes", async () => {
  const harness = makeExistingTransferHarness({
    eventId: "completed:CARD-42:exact-archived-replay",
    destinationArchived: true,
    destinationLocked: true,
  });
  const result = await harness.run();
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.writeCount, 0);
  assert.equal(harness.state.destinationArchived, true);
  assert.equal(harness.state.destinationLocked, true);
  assert.equal(result.completed.archiveState.reopened, false);
  assert.equal(result.completed.readback.archiveStateExact, true);
  assert(harness.calls.every((call) => call.method === "GET"));
});

test("archived destination repair reopens only when needed and restores archive state", async () => {
  const harness = makeExistingTransferHarness({
    eventId: "completed:CARD-42:archived-repair",
    destinationArchived: true,
    destinationLocked: true,
    destinationBody: "corrupt",
  });
  const result = await harness.run();
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.writeCount, 3);
  assert.equal(harness.state.destinationContent, harness.expectedDestination);
  assert.equal(harness.state.destinationArchived, true);
  assert.equal(harness.state.destinationLocked, true);
  assert.equal(result.completed.archiveState.reopened, true);
  assert.equal(result.completed.archiveState.restored, true);
  assert.equal(result.completed.readback.archiveStateExact, true);
  const destinationWrites = harness.calls.filter((call) =>
    call.method !== "GET" && call.url.includes("/channels/completed-thread")
  );
  assert.deepEqual(destinationWrites.map((call) => call.body), [
    { archived: false, locked: false },
    { content: harness.expectedDestination, allowed_mentions: { parse: [] } },
    { archived: true, locked: true },
  ]);
});

test("journal create failure blocks every later destination and source mutation", async () => {
  const harness = makeExistingTransferHarness({
    eventId: "completed:CARD-42:journal-create-failure",
    destinationTags: ["wrong-tag"],
    reactionPresent: false,
    journalMode: "missing",
    failJournalCreate: true,
  });
  const result = await harness.run();
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("completed_card_journal_create_failed"));
  assert.equal(result.writeCount, 0, "journal failure must precede and block the required reaction");
  assert.equal(harness.state.reactionPresent, false);
  assert.deepEqual(harness.state.destinationTags, ["wrong-tag"]);
  const failureIndex = harness.calls.findLastIndex((call) =>
    call.method === "POST" && call.url.endsWith("/channels/completed-thread/messages")
  );
  assert(failureIndex >= 0);
  assert(harness.calls.slice(failureIndex + 1).every((call) => call.method === "GET"));
  assert(!harness.calls.some((call) => call.method === "PUT" && call.url.includes("/reactions/")));
  assert(!harness.calls.some((call) => call.method === "PATCH" && call.body?.applied_tags));
  assert(!harness.calls.some((call) => call.method !== "GET" && call.url.includes("/channels/source-thread")));
});

test("journal update failure preserves prior write count and blocks every later mutation", async () => {
  const harness = makeExistingTransferHarness({
    eventId: "completed:CARD-42:journal-update-failure",
    destinationBody: "corrupt",
    destinationTags: ["wrong-tag"],
    reactionPresent: false,
    journalMode: "corrupt",
    failJournalUpdate: true,
  });
  const result = await harness.run();
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("completed_card_journal_update_failed"));
  assert.equal(result.writeCount, 1, "only the completed body repair before journal failure is counted");
  assert.equal(harness.state.destinationContent, harness.expectedDestination);
  assert.equal(harness.state.reactionPresent, false);
  assert.deepEqual(harness.state.destinationTags, ["wrong-tag"]);
  const failureIndex = harness.calls.findLastIndex((call) =>
    call.method === "PATCH" && call.url.endsWith("/channels/completed-thread/messages/journal")
  );
  assert(failureIndex >= 0);
  assert(harness.calls.slice(failureIndex + 1).every((call) => call.method === "GET"));
  assert(!harness.calls.some((call) => call.method === "PUT" && call.url.includes("/reactions/")));
  assert(!harness.calls.some((call) => call.method === "PATCH" && call.body?.applied_tags));
  assert(!harness.calls.some((call) => call.method !== "GET" && call.url.includes("/channels/source-thread")));
});

test("successful journal reconciliation precedes the deferred success reaction", async () => {
  const harness = makeExistingTransferHarness({
    eventId: "completed:CARD-42:journal-before-reaction",
    reactionPresent: false,
    journalMode: "missing",
  });
  const result = await harness.run();
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.writeCount, 2);
  assert.equal(harness.state.journalContent, harness.expectedJournal);
  assert.equal(harness.state.reactionPresent, true);
  const journalWriteIndex = harness.calls.findIndex((call) =>
    call.method === "POST" && call.url.endsWith("/channels/completed-thread/messages")
  );
  const reactionWriteIndex = harness.calls.findIndex((call) =>
    call.method === "PUT" && call.url.includes("/reactions/")
  );
  assert(journalWriteIndex >= 0);
  assert(reactionWriteIndex > journalWriteIndex);
});

test("transient destination restore failure retries the bounded re-close", async () => {
  const harness = makeExistingTransferHarness({
    eventId: "completed:CARD-42:restore-retry",
    destinationArchived: true,
    destinationLocked: true,
    destinationBody: "corrupt",
    failDestinationRestoreOnce: true,
    sourceMode: "preimage",
  });
  const result = await harness.run();
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert(!result.reasonCodes.includes("completed_card_restore_state_failed"));
  assert.equal(result.writeCount, 5, "reopen, body repair, successful re-close, source link, and source archive are counted");
  assert.equal(harness.state.destinationArchived, true);
  assert.equal(harness.state.destinationLocked, true);
  assert.equal(harness.state.sourceContent, harness.expectedSource);
  assert.equal(harness.state.sourceArchived, true);
  assert.equal(harness.state.sourceLocked, true);
  assert.equal(result.completed.archiveState.restored, true);
  assert.equal(result.completed.archiveState.restoreHttpStatus, 200);
  const restoreAttempts = harness.calls.filter((call) =>
    call.method === "PATCH"
      && call.url.endsWith("/channels/completed-thread")
      && call.body?.archived === true
      && call.body?.locked === true
  );
  assert.equal(restoreAttempts.length, 4, "three transport attempts fail before the second logical re-close succeeds");
});

test("failed destination re-close stays blocked and an unproven open replay fails closed", async () => {
  const harness = makeExistingTransferHarness({
    eventId: "completed:CARD-42:restore-terminal-failure",
    destinationArchived: true,
    destinationLocked: true,
    journalMode: "missing",
    failJournalCreate: true,
    failDestinationRestoreAlways: true,
  });
  const failed = await harness.run();
  assert.equal(failed.ok, false);
  assert(failed.reasonCodes.includes("completed_card_journal_create_failed"));
  assert(failed.reasonCodes.includes("completed_card_restore_state_failed"));
  assert.equal(failed.writeCount, 1, "only the successful reopen is counted");
  assert.equal(failed.completed.archiveState.restored, false);
  assert.deepEqual(failed.completed.archiveState.expected, { archived: true, locked: true });
  assert.equal(harness.state.destinationArchived, false);
  assert.equal(harness.state.destinationLocked, false);

  const replayStart = harness.calls.length;
  const replay = await harness.run({ destinationStatePreimage: null });
  assert.equal(replay.ok, false);
  assert(replay.reasonCodes.includes("completed_card_destination_archive_preimage_unknown"));
  assert.equal(replay.writeCount, 0);
  assert(harness.calls.slice(replayStart).every((call) => call.method === "GET"));
  assert.equal(harness.state.destinationArchived, false);
  assert.equal(harness.state.destinationLocked, false);
});

test("unreadable destination starter blocks creation with an exact zero-write receipt", async () => {
  const calls = [];
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    requireStableIdentity: true,
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        return response({ payload: { id: "source-thread", content: "Original card" } });
      }
      if (url.endsWith("/channels/source-thread")) {
        return response({ payload: { id: "source-thread", name: "Card title", parent_id: "source-forum", guild_id: "guild" } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) {
        return response({ payload: { threads: [{ id: "unreadable-destination", name: "Unknown", parent_id: "completed-forum" }] } });
      }
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: false } });
      }
      if (url.endsWith("/channels/unreadable-destination/messages/unreadable-destination")) {
        return response({ ok: false, status: 403, payload: { message: "Missing Permissions" } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("completed_card_starter_read_failed"));
  assert.equal(result.writeCount, 0);
  assert(calls.every((call) => call.method === "GET"));
  assert(!calls.some((call) => call.url.endsWith("/channels/completed-forum/threads")));
});

test("destination reopen followed by body-repair failure preserves the successful write count", async () => {
  let destinationArchived = true;
  let destinationLocked = true;
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    eventId: "completed:CARD-42:reopen-failure",
    occurredAt: "2026-07-16T10:00:00.000Z",
    sourceContentPreimage: "Original card",
    sourceTitlePreimage: "Card title",
    repairExactPostimage: true,
    requireStableIdentity: true,
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        return response({ payload: { id: "source-thread", content: "Original card" } });
      }
      if (url.endsWith("/channels/source-thread")) {
        return response({ payload: {
          id: "source-thread",
          name: "Card title",
          parent_id: "source-forum",
          guild_id: "guild",
          thread_metadata: { archived: false, locked: false },
        } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [{
          id: "completed-thread",
          name: "Card title",
          parent_id: "completed-forum",
          thread_metadata: { archived: true, locked: true, archive_timestamp: "2026-07-16T09:00:00.000Z" },
        }], has_more: false } });
      }
      if (url.endsWith("/channels/completed-thread/messages/completed-thread")) {
        if (init.method === "PATCH") return response({ ok: false, status: 500, payload: { message: "Injected failure" } });
        return response({ payload: { id: "completed-thread", content: "ATLAS-CARD-ID: `CARD-42`\ncorrupted" } });
      }
      if (url.endsWith("/channels/completed-thread/messages?limit=100")) {
        return response({ payload: [] });
      }
      if (url.endsWith("/channels/completed-thread")) {
        if (init.method === "PATCH") {
          const body = JSON.parse(init.body);
          destinationArchived = body.archived;
          destinationLocked = body.locked;
        }
        return response({ payload: {
          id: "completed-thread",
          name: "Card title",
          parent_id: "completed-forum",
          applied_tags: [],
          thread_metadata: { archived: destinationArchived, locked: destinationLocked },
        } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("completed_card_exact_body_repair_failed"));
  assert.equal(result.writeCount, 2);
  assert.equal(destinationArchived, true);
  assert.equal(destinationLocked, true);
});

test("delayed resume reuses an exact journal event beyond page one without duplication", async () => {
  const eventId = "completed:CARD-42:delayed-resume";
  const occurredAt = "2026-07-16T12:00:00.000Z";
  const sourceUrl = "https://discord.com/channels/guild/source-thread";
  const destinationUrl = "https://discord.com/channels/guild/completed-thread";
  const originalSource = "Original card";
  const expectedDestination = _internals.buildCompletedMessage({
    cardId: "CARD-42",
    sourceForumChannelId: "source-forum",
    title: "Card title",
    eventId,
    occurredAt,
    sourceContent: originalSource,
    sourceUrl,
    destinationUrl: null,
    evidence: baseOptions.evidence,
  });
  const completionEvent = _internals.buildCompletedEvent({
    cardId: "CARD-42",
    sourceForumChannelId: "source-forum",
    title: "Card title",
    eventId,
    occurredAt,
    sourceUrl,
    destinationUrl,
    evidence: baseOptions.evidence,
  });
  const expectedJournal = journal.buildJournalMessage(completionEvent);
  const fillers = Array.from({ length: 100 }, (_, index) => ({ id: `filler-${index}`, content: "unrelated" }));
  let sourceContent = originalSource;
  let sourceArchived = false;
  let sourceLocked = false;
  let journalPosts = 0;
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    eventId,
    occurredAt,
    completedTagIds: ["feature-tag", "completed-tag"],
    requireStableIdentity: true,
    sourceContentPreimage: originalSource,
    sourceTitlePreimage: "Card title",
    destinationStatePreimage: { archived: false, locked: false },
    repairExactPostimage: true,
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        if (init.method === "PATCH") sourceContent = JSON.parse(init.body).content;
        return response({ payload: { id: "source-thread", content: sourceContent } });
      }
      if (url.endsWith("/channels/source-thread")) {
        if (init.method === "PATCH") {
          const body = JSON.parse(init.body);
          sourceArchived = body.archived;
          sourceLocked = body.locked;
        }
        return response({ payload: {
          id: "source-thread",
          name: "Card title",
          parent_id: "source-forum",
          guild_id: "guild",
          thread_metadata: {
            archived: sourceArchived,
            ...(sourceLocked ? { locked: true } : {}),
          },
        } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [{
        id: "completed-thread",
        name: "Card title",
        parent_id: "completed-forum",
        applied_tags: ["completed-tag", "feature-tag"],
      }] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: false } });
      }
      if (url.endsWith("/channels/completed-thread/messages/completed-thread")) {
        return response({ payload: {
          id: "completed-thread",
          content: expectedDestination,
          reactions: [{ emoji: { name: "success", id: "1507384062166302851" }, me: true, count: 1 }],
        } });
      }
      if (url.endsWith("/channels/completed-thread/messages?limit=100")) return response({ payload: fillers });
      if (url.includes("/channels/completed-thread/messages?limit=100&before=")) {
        return response({ payload: [{ id: "journal-old", content: expectedJournal }] });
      }
      if (url.endsWith("/channels/completed-thread/messages/journal-old")) {
        return response({ payload: { id: "journal-old", content: expectedJournal } });
      }
      if (url.endsWith("/channels/completed-thread/messages") && init.method === "POST") {
        journalPosts += 1;
        return response({ status: 201, payload: { id: "duplicate-journal" } });
      }
      if (url.endsWith("/channels/completed-thread")) {
        return response({ payload: { id: "completed-thread", name: "Card title", parent_id: "completed-forum", applied_tags: ["completed-tag", "feature-tag"] } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.completed.journal.action, "reused");
  assert.equal(journalPosts, 0);
  assert.equal(result.completed.readback.journalExact, true);
  assert.equal(result.source.readback.postimageExact, true);
});

test("corrupted destination replay is repaired to the exact deterministic postimage", async () => {
  const eventId = "completed:CARD-42:corruption-recovery";
  const occurredAt = "2026-07-16T13:00:00.000Z";
  const sourceUrl = "https://discord.com/channels/guild/source-thread";
  const destinationUrl = "https://discord.com/channels/guild/completed-thread";
  const originalSource = "Original card";
  const expectedDestination = _internals.buildCompletedMessage({
    cardId: "CARD-42",
    sourceForumChannelId: "source-forum",
    title: "Card title",
    eventId,
    occurredAt,
    sourceContent: originalSource,
    sourceUrl,
    destinationUrl: null,
    evidence: baseOptions.evidence,
  });
  const expectedSource = _internals.buildSourceMessage({ sourceContent: originalSource, destinationUrl, cardId: "CARD-42" });
  const expectedJournal = journal.buildJournalMessage(_internals.buildCompletedEvent({
    cardId: "CARD-42",
    sourceForumChannelId: "source-forum",
    title: "Card title",
    eventId,
    occurredAt,
    sourceUrl,
    destinationUrl,
    evidence: baseOptions.evidence,
  }));
  let destinationContent = expectedDestination.replace("- owner: `Unassigned`", "- owner: `corrupted-owner`");
  let destinationCreates = 0;
  let journalCreates = 0;
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    eventId,
    occurredAt,
    completedTagIds: ["feature-tag", "completed-tag"],
    requireStableIdentity: true,
    sourceContentPreimage: originalSource,
    sourceTitlePreimage: "Card title",
    destinationStatePreimage: { archived: false, locked: false },
    repairExactPostimage: true,
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        return response({ payload: { id: "source-thread", content: expectedSource } });
      }
      if (url.endsWith("/channels/source-thread")) {
        return response({ payload: {
          id: "source-thread",
          name: "Card title",
          parent_id: "source-forum",
          guild_id: "guild",
          thread_metadata: { archived: true, locked: true },
        } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [{
        id: "completed-thread",
        name: "Card title",
        parent_id: "completed-forum",
        applied_tags: ["feature-tag", "completed-tag"],
      }] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: false } });
      }
      if (url.endsWith("/channels/completed-forum/threads") && init.method === "POST") {
        destinationCreates += 1;
        return response({ status: 201, payload: { id: "duplicate-destination" } });
      }
      if (url.endsWith("/channels/completed-thread/messages/completed-thread")) {
        if (init.method === "PATCH") destinationContent = JSON.parse(init.body).content;
        return response({ payload: {
          id: "completed-thread",
          content: destinationContent,
          reactions: [{ emoji: { name: "success", id: "1507384062166302851" }, me: true, count: 1 }],
        } });
      }
      if (url.endsWith("/channels/completed-thread/messages?limit=100")) {
        return response({ payload: [{ id: "journal", content: expectedJournal }] });
      }
      if (url.endsWith("/channels/completed-thread/messages/journal")) {
        return response({ payload: { id: "journal", content: expectedJournal } });
      }
      if (url.endsWith("/channels/completed-thread/messages") && init.method === "POST") {
        journalCreates += 1;
        return response({ status: 201, payload: { id: "duplicate-journal" } });
      }
      if (url.endsWith("/channels/completed-thread")) {
        return response({ payload: { id: "completed-thread", name: "Card title", parent_id: "completed-forum", applied_tags: ["feature-tag", "completed-tag"] } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(destinationContent, expectedDestination);
  assert.equal(result.completed.readback.bodyExact, true);
  assert.equal(result.completed.readback.journalExact, true);
  assert.equal(result.source.readback.postimageExact, true);
  assert.equal(destinationCreates, 0);
  assert.equal(journalCreates, 0);
});

test("source-link partial failure resumes with archive only and then replays without mutation", async () => {
  const eventId = "completed:CARD-42:source-link-resume";
  const occurredAt = "2026-07-16T14:00:00.000Z";
  const sourceUrl = "https://discord.com/channels/guild/source-thread";
  const destinationUrl = "https://discord.com/channels/guild/completed-thread";
  const originalSource = "Original card";
  const expectedDestination = _internals.buildCompletedMessage({
    cardId: "CARD-42",
    sourceForumChannelId: "source-forum",
    title: "Card title",
    eventId,
    occurredAt,
    sourceContent: originalSource,
    sourceUrl,
    destinationUrl: null,
    evidence: baseOptions.evidence,
  });
  const expectedSource = _internals.buildSourceMessage({ sourceContent: originalSource, destinationUrl, cardId: "CARD-42" });
  const expectedJournal = journal.buildJournalMessage(_internals.buildCompletedEvent({
    cardId: "CARD-42",
    sourceForumChannelId: "source-forum",
    title: "Card title",
    eventId,
    occurredAt,
    sourceUrl,
    destinationUrl,
    evidence: baseOptions.evidence,
  }));
  let sourceContent = originalSource;
  let sourceArchived = false;
  let sourceLocked = false;
  let failArchive = true;
  let sourceLinkWrites = 0;
  let successfulArchiveWrites = 0;
  let destinationCreates = 0;
  let journalCreates = 0;
  const run = () => _internals.buildCompletedBoardTransfer({
    ...baseOptions,
    eventId,
    occurredAt,
    completedTagIds: ["feature-tag", "completed-tag"],
    requireStableIdentity: true,
    sourceContentPreimage: originalSource,
    sourceTitlePreimage: "Card title",
    repairExactPostimage: true,
    apply: true,
    allowApply: true,
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/source-thread/messages/source-thread")) {
        if (init.method === "PATCH") {
          sourceLinkWrites += 1;
          sourceContent = JSON.parse(init.body).content;
        }
        return response({ payload: { id: "source-thread", content: sourceContent } });
      }
      if (url.endsWith("/channels/source-thread")) {
        if (init.method === "PATCH") {
          if (failArchive) return response({ ok: false, status: 500, payload: { message: "Injected archive failure" } });
          const body = JSON.parse(init.body);
          sourceArchived = body.archived;
          sourceLocked = body.locked;
          successfulArchiveWrites += 1;
        }
        return response({ payload: {
          id: "source-thread",
          name: "Card title",
          parent_id: "source-forum",
          guild_id: "guild",
          thread_metadata: { archived: sourceArchived, locked: sourceLocked },
        } });
      }
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [{
        id: "completed-thread",
        name: "Card title",
        parent_id: "completed-forum",
        applied_tags: ["completed-tag", "feature-tag"],
      }] } });
      if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: false } });
      }
      if (url.endsWith("/channels/completed-forum/threads") && init.method === "POST") {
        destinationCreates += 1;
        return response({ status: 201, payload: { id: "duplicate-destination" } });
      }
      if (url.endsWith("/channels/completed-thread/messages/completed-thread")) {
        return response({ payload: {
          id: "completed-thread",
          content: expectedDestination,
          reactions: [{ emoji: { name: "success", id: "1507384062166302851" }, me: true, count: 1 }],
        } });
      }
      if (url.endsWith("/channels/completed-thread/messages?limit=100")) {
        return response({ payload: [{ id: "journal", content: expectedJournal }] });
      }
      if (url.endsWith("/channels/completed-thread/messages/journal")) {
        return response({ payload: { id: "journal", content: expectedJournal } });
      }
      if (url.endsWith("/channels/completed-thread/messages") && init.method === "POST") {
        journalCreates += 1;
        return response({ status: 201, payload: { id: "duplicate-journal" } });
      }
      if (url.endsWith("/channels/completed-thread")) {
        return response({ payload: {
          id: "completed-thread",
          name: "Card title",
          parent_id: "completed-forum",
          applied_tags: ["feature-tag", "completed-tag"],
        } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });

  const partial = await run();
  assert.equal(partial.ok, false);
  assert(partial.reasonCodes.includes("source_card_archive_failed"));
  assert.equal(partial.writeCount, 1);
  assert.equal(sourceContent, expectedSource);
  assert.equal(sourceArchived, false);
  assert.equal(sourceLocked, false);

  failArchive = false;
  const resumed = await run();
  assert.equal(resumed.ok, true, JSON.stringify(resumed, null, 2));
  assert.equal(resumed.writeCount, 1);
  assert.equal(resumed.source.readback.postimageExact, true);
  assert.equal(sourceLinkWrites, 1, "resume must not rewrite the exact reciprocal source link");
  assert.equal(successfulArchiveWrites, 1);

  const replay = await run();
  assert.equal(replay.ok, true, JSON.stringify(replay, null, 2));
  assert.equal(replay.writeCount, 0);
  assert.equal(sourceLinkWrites, 1);
  assert.equal(successfulArchiveWrites, 1);
  assert.equal(destinationCreates, 0);
  assert.equal(journalCreates, 0);
  assert.equal(partial.writeCount + resumed.writeCount + replay.writeCount, 2);
});

test("standalone replay is no-write and exact-mode journal repair is counted", async () => {
  const runExisting = async ({ exactMode, corruptJournal }) => {
    const eventId = exactMode ? "completed:CARD-42:exact-journal" : "completed:CARD-42";
    const occurredAt = "2026-07-16T11:00:00.000Z";
    const sourceUrl = "https://discord.com/channels/guild/source-thread";
    const destinationUrl = "https://discord.com/channels/guild/completed-thread";
    const originalSource = "Original card";
    const destinationContent = _internals.buildCompletedMessage({
      cardId: "CARD-42",
      sourceForumChannelId: "source-forum",
      title: "Card title",
      eventId,
      occurredAt,
      sourceContent: originalSource,
      sourceUrl,
      destinationUrl: null,
      evidence: baseOptions.evidence,
    });
    const sourceContent = _internals.buildSourceMessage({ sourceContent: originalSource, destinationUrl, cardId: "CARD-42" });
    const expectedJournal = journal.buildJournalMessage(_internals.buildCompletedEvent({
      cardId: "CARD-42",
      sourceForumChannelId: "source-forum",
      title: "Card title",
      eventId,
      occurredAt,
      sourceUrl,
      destinationUrl,
      evidence: baseOptions.evidence,
    }));
    let journalContent = corruptJournal
      ? `${journal.eventMarker(eventId)}\ncorrupted journal body`
      : expectedJournal;
    let writeCount = 0;
    const result = await _internals.buildCompletedBoardTransfer({
      ...baseOptions,
      ...(exactMode ? {
        eventId,
        occurredAt,
        sourceContentPreimage: originalSource,
        sourceTitlePreimage: "Card title",
        destinationStatePreimage: { archived: false, locked: false },
        repairExactPostimage: true,
      } : {}),
      requireStableIdentity: true,
      apply: true,
      allowApply: true,
      fetchImpl: async (url, init) => {
        if (init.method !== "GET") writeCount += 1;
        if (url.endsWith("/channels/source-thread/messages/source-thread")) {
          return response({ payload: { id: "source-thread", content: sourceContent } });
        }
        if (url.endsWith("/channels/source-thread")) {
          return response({ payload: {
            id: "source-thread",
            name: "Card title",
            parent_id: "source-forum",
            guild_id: "guild",
            thread_metadata: { archived: true, locked: true },
          } });
        }
        if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [{
          id: "completed-thread",
          name: "Card title",
          parent_id: "completed-forum",
          applied_tags: [],
        }] } });
        if (url.endsWith("/channels/completed-forum/threads/archived/public?limit=100")) {
          return response({ payload: { threads: [], has_more: false } });
        }
        if (url.endsWith("/channels/completed-thread/messages/completed-thread")) {
          return response({ payload: {
            id: "completed-thread",
            content: destinationContent,
            reactions: [{ emoji: { name: "success", id: "1507384062166302851" }, me: true, count: 1 }],
          } });
        }
        if (url.endsWith("/channels/completed-thread/messages?limit=100")) {
          return response({ payload: [{ id: "journal", content: journalContent }] });
        }
        if (url.endsWith("/channels/completed-thread/messages/journal")) {
          if (init.method === "PATCH") journalContent = JSON.parse(init.body).content;
          return response({ payload: { id: "journal", content: journalContent } });
        }
        if (url.endsWith("/channels/completed-thread")) {
          return response({ payload: { id: "completed-thread", name: "Card title", parent_id: "completed-forum", applied_tags: [] } });
        }
        throw new Error(`unexpected request ${init.method} ${url}`);
      },
    });
    return { result, writeCount, expectedJournal, journalContent };
  };

  const standalone = await runExisting({ exactMode: false, corruptJournal: false });
  assert.equal(standalone.result.ok, true, JSON.stringify(standalone.result, null, 2));
  assert.equal(standalone.result.writeCount, 0);
  assert.equal(standalone.writeCount, 0);
  assert.equal(standalone.result.completed.journal.action, "reused");

  const exactRepair = await runExisting({ exactMode: true, corruptJournal: true });
  assert.equal(exactRepair.result.ok, true, JSON.stringify(exactRepair.result, null, 2));
  assert.equal(exactRepair.result.completed.journal.action, "updated");
  assert.equal(exactRepair.result.writeCount, 1);
  assert.equal(exactRepair.writeCount, 1);
  assert.equal(exactRepair.journalContent, exactRepair.expectedJournal);
});
