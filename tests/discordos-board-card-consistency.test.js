const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-card-consistency");
const { _internals: journal } = require("../scripts/discordos-board-card-journal");

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
      content: `${journal.CARD_START}\nATLAS-CARD-ID: \`FIT-1\`\n- state: \`review\`\n- updated: \`2026-07-13\`\nSummary ${mojibake}\n${journal.CARD_END}`,
    },
    messages: [
      { content: "ATLAS-JOURNAL-EVENT-ID: `evt-1`" },
      { content: `Historical rename ${mojibake}` },
    ],
  });
  assert(row.reasonCodes.includes("card_title_encoding_corrupt"));
  assert(row.reasonCodes.includes("card_starter_encoding_corrupt"));
  assert(row.reasonCodes.includes("card_history_encoding_corrupt"));
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

test("explicitly superseded archived thread is retained as history without card drift", () => {
  const row = _internals.inspectThread({
    board: { id: "fitness", role: "active" },
    thread: { id: "old", name: "Archived encoding record", thread_metadata: { archived: true } },
    starter: { content: "ATLAS-SUPERSEDED-CARD: `456`\nReplacement: https://discord.com/channels/guild/456" },
    messages: [{ content: "Historical message \u00e2\u20ac\u201d retained" }],
  });
  assert.equal(row.ok, true);
  assert.equal(row.superseded, true);
  assert.equal(row.supersededThreadId, "456");
  assert.deepEqual(row.reasonCodes, []);
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
