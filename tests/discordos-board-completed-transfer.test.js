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
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [{
        id: "completed-thread",
        name: "Card title",
        parent_id: "completed-forum",
        applied_tags: ["feature-tag", "completed-tag"],
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
        return response({ payload: { id: "completed-thread", name: "Card title", parent_id: "completed-forum", applied_tags: ["feature-tag", "completed-tag"] } });
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
