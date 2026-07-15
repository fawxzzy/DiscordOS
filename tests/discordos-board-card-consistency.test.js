const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-card-consistency");
const { _internals: journal } = require("../scripts/discordos-board-card-journal");

function response({ ok = true, status = 200, payload = null } = {}) {
  return { ok, status, json: async () => payload };
}

function canonicalStarter(cardId = "FIT-1") {
  return `${journal.CARD_START}\nATLAS-CARD-ID: \`${cardId}\`\n- state: \`review\`\n- updated: \`2026-07-13T00:00:00Z\`\n${journal.CARD_END}`;
}

test("healthy active card has canonical body and journal history", () => {
  const row = _internals.inspectThread({
    board: { id: "fitness", role: "active" },
    thread: { id: "thread", name: "Card", thread_metadata: { archived: false } },
    starter: {
      content: `${journal.CARD_START}\nATLAS-CARD-ID: \`FIT-1\`\n- state: \`review\`\n- updated: \`2026-07-13T00:00:00Z\`\n${journal.CARD_END}`,
    },
    messages: [{ content: "ATLAS-JOURNAL-EVENT-ID: `evt-1`" }],
  });
  assert.equal(row.ok, true);
});

test("legacy card reports every structural drift class", () => {
  const row = _internals.inspectThread({
    board: { id: "mazer", role: "active" },
    thread: { id: "thread", name: "Legacy", thread_metadata: { archived: true } },
    starter: { content: "- state: `in_progress`\nLegacy notes" },
    messages: [],
  });
  assert(row.reasonCodes.includes("stable_card_id_missing"));
  assert(row.reasonCodes.includes("canonical_card_body_missing"));
  assert(row.reasonCodes.includes("canonical_updated_timestamp_missing"));
  assert(row.reasonCodes.includes("card_journal_history_missing"));
  assert(row.reasonCodes.includes("active_card_archived"));
});

test("completed board requires completed state and source link", () => {
  const row = _internals.inspectThread({
    board: { id: "completed", role: "completed" },
    thread: { id: "thread", name: "Wrong", thread_metadata: { archived: false } },
    starter: {
      content: `${journal.CARD_START}\nATLAS-CARD-ID: \`FIT-1\`\n- state: \`review\`\n- updated: \`2026-07-13\`\n${journal.CARD_END}`,
    },
    messages: [{ content: "ATLAS-JOURNAL-EVENT-ID: `evt-1`" }],
  });
  assert(row.reasonCodes.includes("completed_board_state_mismatch"));
  assert(row.reasonCodes.includes("completed_card_source_link_missing"));
});

test("duplicate identities are reported across boards", () => {
  const duplicates = _internals.findDuplicates([
    { cardId: "FIT-1", boardId: "fitness", threadId: "one" },
    { cardId: "fit-1", boardId: "completed", threadId: "two" },
    { cardId: "MAZER-1", boardId: "mazer", threadId: "three" },
  ]);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].cardId, "fit-1");
});

test("encoding corruption is reported across titles, starters, and history", () => {
  const mojibake = "\u00e2\u20ac\u201d";
  const row = _internals.inspectThread({
    board: { id: "fitness", role: "active" },
    thread: { id: "thread", name: `Feature ${mojibake} title`, thread_metadata: { archived: false } },
    starter: {
      id: "thread",
      content: `${journal.CARD_START}\nATLAS-CARD-ID: \`FIT-1\`\n- state: \`review\`\n- updated: \`2026-07-13\`\nSummary ${mojibake}\n${journal.CARD_END}`,
    },
    messages: [
      { id: "journal-clean", content: "ATLAS-JOURNAL-EVENT-ID: `evt-1`" },
      { id: "journal-corrupt", content: `Historical rename ${mojibake}` },
    ],
  });
  assert(row.reasonCodes.includes("card_title_encoding_corrupt"));
  assert(row.reasonCodes.includes("card_starter_encoding_corrupt"));
  assert(row.reasonCodes.includes("card_history_encoding_corrupt"));
  assert.deepEqual(row.textIntegrity.surfaceCounts, { title: 1, starter: 1, journal: 1 });
  assert.deepEqual(row.textIntegrity.findings.map((finding) => [finding.surface, finding.threadId, finding.messageId]), [
    ["title", "thread", null],
    ["starter", "thread", "thread"],
    ["journal", "thread", "journal-corrupt"],
  ]);
});

test("reciprocal archived source and completed clone are an allowed identity pair", () => {
  const result = _internals.classifyIdentities([
    {
      cardId: "FIT-1",
      boardId: "fitness",
      boardRole: "active",
      threadId: "source",
      archived: true,
      completedThreadIdLink: "completed",
    },
    {
      cardId: "fit-1",
      boardId: "completed",
      boardRole: "completed",
      threadId: "completed",
      sourceThreadIdLink: "source",
    },
  ]);
  assert.equal(result.duplicates.length, 0);
  assert.equal(result.linkedPairs.length, 1);
  assert.equal(result.linkedPairs[0].cardId, "fit-1");
});

test("superseded rows still inspect title, starter, and journal text", () => {
  const mojibake = "\u00e2\u20ac\u201d";
  const row = _internals.inspectThread({
    board: { id: "fitness", role: "active" },
    thread: { id: "old", name: `Archived ${mojibake} record`, thread_metadata: { archived: true } },
    starter: { id: "old", content: `ATLAS-SUPERSEDED-CARD: \`456\`\nReplacement ${mojibake}: https://discord.com/channels/guild/456` },
    messages: [{ id: "old-journal", content: `Historical message ${mojibake} retained` }],
  });
  assert.equal(row.ok, false);
  assert.equal(row.superseded, true);
  assert.equal(row.supersededThreadId, "456");
  assert.deepEqual(row.reasonCodes, [
    "card_title_encoding_corrupt",
    "card_starter_encoding_corrupt",
    "card_history_encoding_corrupt",
  ]);
  assert.deepEqual(row.textIntegrity.surfaceCounts, { title: 1, starter: 1, journal: 1 });
});

test("superseded text findings are included in aggregate counts with exact IDs", async () => {
  const mojibake = "\u00e2\u20ac\u201d";
  const result = await _internals.buildBoardCardConsistency({
    payload: { boards: [{ id: "fitness", forumChannelId: "forum", role: "active" }] },
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/forum")) return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) {
        return response({ payload: { threads: [{
          id: "old",
          name: `Old ${mojibake} title`,
          parent_id: "forum",
          thread_metadata: { archived: true },
        }] } });
      }
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: false } });
      }
      if (url.endsWith("/channels/old")) {
        return response({ payload: { id: "old", name: `Old ${mojibake} title`, thread_metadata: { archived: true } } });
      }
      if (url.endsWith("/channels/old/messages/old")) {
        return response({ payload: { id: "old", content: `ATLAS-SUPERSEDED-CARD: \`456\`\nStarter ${mojibake}` } });
      }
      if (url.endsWith("/channels/old/messages?limit=100")) {
        return response({ payload: [{ id: "old-history", content: `History ${mojibake}` }] });
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  assert.equal(result.status, "drift_detected");
  assert.equal(result.cardCount, 0);
  assert.equal(result.supersededRecordCount, 1);
  assert.deepEqual(result.textIntegrityCounts, {
    byBoard: { fitness: 3 },
    bySurface: { title: 1, starter: 1, journal: 1 },
    byPattern: { windows_1252_utf8: 3 },
  });
  assert.deepEqual(result.textIntegrityFindings.map((finding) => [
    finding.threadId,
    finding.messageId,
    finding.surface,
    finding.superseded,
  ]), [
    ["old", null, "title", true],
    ["old", "old", "starter", true],
    ["old", "old-history", "journal", true],
  ]);
});

test("archived active-board source with a Completed link is a valid retained pair", () => {
  const row = _internals.inspectThread({
    board: { id: "fitness", role: "active" },
    thread: { id: "123", name: "Completed source", thread_metadata: { archived: true } },
    starter: {
      content: `${journal.CARD_START}\nATLAS-CARD-ID: \`FIT-1\`\n- state: \`review\`\n- updated: \`2026-07-13\`\nATLAS-COMPLETED-CARD: https://discord.com/channels/guild/456\n${journal.CARD_END}`,
    },
    messages: [{ content: "ATLAS-JOURNAL-EVENT-ID: `evt-1`" }],
  });
  assert.equal(row.ok, true);
  assert.equal(row.completedThreadIdLink, "456");
  assert(!row.reasonCodes.includes("active_card_archived"));
});

test("Ready card with an incomplete planning contract is drift", () => {
  const row = _internals.inspectThread({
    board: { id: "fitness", role: "active" },
    thread: { id: "123", name: "Incomplete Ready card", thread_metadata: { archived: false } },
    starter: {
      content: `${journal.CARD_START}\nATLAS-CARD-ID: \`FIT-READY-1\`\n- project: \`Fitness\`\n- type: \`feature\`\n- state: \`ready\`\n- priority: \`Unspecified\`\n- owner: \`Unassigned\`\n- progress: \`0%\`\n- updated: \`2026-07-13\`\n\n## Summary\nCaptured idea only\n\n## Blockers\n- None\n${journal.CARD_END}`,
    },
    messages: [{ content: "ATLAS-JOURNAL-EVENT-ID: `evt-ready-1`" }],
  });
  assert.equal(row.ok, false);
  assert.equal(row.autonomy.admitted, false);
  assert(row.reasonCodes.includes("ready_card_autonomy_contract_incomplete"));
});

test("required blocked registry board fails closed while remaining visible", async () => {
  const registry = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "config", "discordos-board-registry.json"), "utf8"));
  registry.boards = registry.boards.filter((board) => new Set(["shared-completed", "atlas-active-admission"]).has(board.id));
  const result = await _internals.buildBoardCardConsistency({
    registry,
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url) => {
      if (url.endsWith("/guilds/1504668396338413670/channels")) {
        return response({ payload: [{ id: "1508359985602625638", name: "completed", type: 15, parent_id: "1508057063874629684" }] });
      }
      if (url.endsWith("/channels/1508359985602625638")) {
        return response({ payload: { id: "1508359985602625638", name: "completed", guild_id: "1504668396338413670" } });
      }
      if (url.endsWith("/guilds/1504668396338413670/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/1508359985602625638/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: false } });
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.registeredBoardCount, 2);
  assert.equal(result.enabledBoardCount, 1);
  assert.equal(result.blockedBoardCount, 1);
  assert.equal(result.blockedBoards[0].id, "atlas-active-admission");
  assert(result.reasonCodes.includes("required_board_blocked:atlas-active-admission"));
});

test("registry discovery reports an uncovered live production forum", async () => {
  const registry = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "config", "discordos-board-registry.json"), "utf8"));
  const result = await _internals.discoverRegistryForums({
    registry,
    token: "token",
    fetchImpl: async (url) => {
      assert(url.endsWith("/guilds/1504668396338413670/channels"));
      return response({ payload: [
        { id: "1505827424766660780", name: "feedback-testing", type: 15, parent_id: "1508057063874629684" },
        { id: "new-forum", name: "new-project", type: 15, parent_id: "1508057063874629684" },
      ] });
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.uncoveredBoards, [{ channelId: "new-forum", channelName: "new-project", parentId: "1508057063874629684" }]);
  assert.equal(result.excludedBoards[0].channelId, "1505827424766660780");
  assert(result.reasonCodes.includes("uncovered_live_board:new-forum"));
});

test("legacy input remains compatible and reports denominator discovery as not evaluated", async () => {
  const result = await _internals.buildBoardCardConsistency({
    payload: { boards: [{ id: "fitness", forumChannelId: "forum", role: "active" }] },
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/forum")) return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [], has_more: false } });
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "consistent");
  assert.equal(result.inventorySource, "legacy_input");
  assert.equal(result.coverageStatus, "not_evaluated");
  assert.equal(result.registeredBoardCount, 1);
});

test("consistency scan reads journal history beyond the first 100 messages", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `message-${100 - index}`, content: "other history" }));
  const result = await _internals.buildBoardCardConsistency({
    payload: { boards: [{ id: "fitness", forumChannelId: "forum", role: "active" }] },
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/forum")) return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) {
        return response({ payload: { threads: [{ id: "thread", name: "Card", parent_id: "forum", thread_metadata: { archived: false } }] } });
      }
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100")) return response({ payload: { threads: [], has_more: false } });
      if (url.endsWith("/channels/thread")) return response({ payload: { id: "thread", name: "Card", thread_metadata: { archived: false } } });
      if (url.endsWith("/channels/thread/messages/thread")) return response({ payload: { id: "thread", content: canonicalStarter() } });
      if (url.endsWith("/channels/thread/messages?limit=100")) return response({ payload: firstPage });
      if (url.endsWith("/channels/thread/messages?limit=100&before=message-1")) {
        return response({ payload: [{
          id: "journal-beyond-100",
          content: "ATLAS-JOURNAL-EVENT-ID: `evt-1`\nHistorical \u00e2\u20ac\u201d text",
        }] });
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "drift_detected");
  assert.equal(result.rows[0].journalPresent, true);
  assert.equal(result.rows[0].journalPageCount, 2);
  assert.equal(result.textIntegrityFindingCount, 1);
  assert.deepEqual(result.textIntegrityCounts, {
    byBoard: { fitness: 1 },
    bySurface: { journal: 1 },
    byPattern: { windows_1252_utf8: 1 },
  });
  assert.equal(result.textIntegrityFindings[0].threadId, "thread");
  assert.equal(result.textIntegrityFindings[0].messageId, "journal-beyond-100");
});

test("consistency scan fails closed when journal history exceeds its page bound", async () => {
  let page = 0;
  const result = await _internals.buildBoardCardConsistency({
    payload: { boards: [{ id: "fitness", forumChannelId: "forum", role: "active" }] },
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/forum")) return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) {
        return response({ payload: { threads: [{ id: "thread", name: "Card", parent_id: "forum", thread_metadata: { archived: false } }] } });
      }
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100")) return response({ payload: { threads: [], has_more: false } });
      if (url.endsWith("/channels/thread")) return response({ payload: { id: "thread", name: "Card", thread_metadata: { archived: false } } });
      if (url.endsWith("/channels/thread/messages/thread")) return response({ payload: { id: "thread", content: canonicalStarter() } });
      if (url.includes("/channels/thread/messages?limit=100")) {
        page += 1;
        return response({ payload: Array.from({ length: 100 }, (_, index) => ({ id: `page-${page}-message-${100 - index}`, content: "other history" })) });
      }
      throw new Error(`unexpected GET ${url}`);
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.rows[0].journalHistoryTruncated, true);
  assert.equal(result.rows[0].journalPageCount, 10);
  assert(result.reasonCodes.includes("card_journal_history_truncated:thread"));
});
