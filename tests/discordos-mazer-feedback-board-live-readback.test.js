const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-mazer-feedback-board-live-readback");
const { _internals: journal } = require("../scripts/discordos-board-card-journal");

const EPIC_IDS = [
  "core-gameplay",
  "feel-and-polish",
  "progression-systems",
  "maze-systems",
  "player-systems",
  "online-and-social",
  "telemetry-and-analytics",
  "ai-systems",
  "dev-platform-integration",
];

function response({ ok = true, status = 200, payload = null } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

async function writeBoard() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-mazer-readback-"));
  const boardPath = path.join(dir, "board.json");
  await fs.writeFile(boardPath, JSON.stringify({
    version: 1,
    board: {
      id: "mazer",
      label: "mazer",
      source: "discordos-feedback-board",
      planning: {
        version: 1,
        activeCardId: "card-1",
        epics: EPIC_IDS.map((id, index) => ({
          id,
          title: id,
          order: index + 1,
          criticalPath: true,
          primaryCardIds: index === 0 ? ["card-1"] : [],
          supportingCardIds: [],
        })),
        dependencies: [],
        parallelTracks: [],
      },
      placement: {
        channelFamily: "project-feedback",
        forumChannelId: "forum-1",
        sortKey: "project:mazer",
        displayName: "mazer",
      },
      liveForumChannelId: "forum-1",
      sendsMessages: true,
    },
    cards: [
      {
        id: "card-1",
        title: "mazer: card one",
        state: "open",
        priority: "high",
        category: "mazer",
        markerName: "Marker One",
        completionPercent: 10,
        summary: "Summary.",
        whyItMatters: "Why.",
        currentStatus: "Current.",
        workBreakdown: ["Work."],
        nextActions: ["Next."],
        acceptanceCriteria: ["Accept."],
        proofPlan: ["Proof."],
        reference: "repos/mazer/docs/research/MAZER_AUTH_AI_VISUAL_COMPLETION_MARKER.md",
        nextCommand: "npm run ops:discordos:mazer-feedback-board:json -- --card-id card-1",
        liveThreadId: "thread-1",
        liveMessageId: "message-1",
        reactionStatus: "failure",
        reactionEmojiName: "failure",
        reactionEmojiId: "1507384094424694785",
      },
    ],
  }, null, 2), "utf8");
  return boardPath;
}

function canonicalContent({ id = "card-1", state = "in_progress", project = "Mazer" } = {}) {
  return [
    journal.CARD_START,
    `ATLAS-CARD-ID: \`${id}\``,
    `- project: \`${project}\``,
    "- type: `feature`",
    `- state: \`${state}\``,
    "- priority: `high`",
    "- owner: `Mazer`",
    "- progress: `10%`",
    "- autonomous implementation: `not_admitted`",
    "- updated: `2026-07-14T00:00:00.000Z`",
    "",
    "## Summary",
    "Summary.",
    journal.CARD_END,
  ].join("\n");
}

function journalContent({
  eventId = "evt-card-1",
  cardId = "card-1",
  state = "in_progress",
  occurredAt = "2026-07-14T00:00:00.000Z",
  includeIdentity = true,
} = {}) {
  return [
    `ATLAS-JOURNAL-EVENT-ID: \`${eventId}\``,
    ...(includeIdentity ? [`- card: \`${cardId}\``, `- idempotency: \`${eventId}\``] : []),
    "## Work checkpoint",
    "- kind: `progress`",
    `- state: \`${state}\``,
    "- actor: `atlas`",
    `- occurred: \`${occurredAt}\``,
  ].join("\n");
}

test("mazer feedback board live readback parses args", () => {
  const parsed = _internals.parseArgs(["--json", "--board", "board.json", "--content-limit", "1900"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.boardPath, "board.json");
  assert.equal(parsed.contentLimit, 1900);
});

test("mazer feedback board live readback blocks without bot token", async () => {
  const boardPath = await writeBoard();
  const result = await _internals.buildMazerFeedbackBoardLiveReadback({
    boardPath,
    env: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.callsDiscordApi, false);
  assert(result.reasonCodes.includes("bot_token_missing"));
});

test("mazer feedback board live readback validates canonical managed cards", async () => {
  const boardPath = await writeBoard();
  const content = canonicalContent();
  const result = await _internals.buildMazerFeedbackBoardLiveReadback({
    boardPath,
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url, init) => {
      assert.equal(init.method, "GET");
      assert(url.endsWith("/channels/thread-1/messages?limit=100"));
      return response({ payload: [
        { id: "journal-1", timestamp: "2026-07-14T00:00:00.000Z", content: journalContent() },
        { id: "message-1", content },
      ] });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "live_readback_ready");
  assert.equal(result.checkedCardCount, 1);
  assert.equal(result.readyCardCount, 1);
});

test("mazer feedback board live readback skips completed source cards", async () => {
  const boardPath = await writeBoard();
  const board = JSON.parse(await fs.readFile(boardPath, "utf8"));
  board.cards.push({
    ...board.cards[0],
    id: "completed-card",
    title: "mazer: completed card",
    state: "completed",
    completionPercent: 100,
    reactionStatus: "success",
    reactionEmojiName: "success",
    reactionEmojiId: "1507384062166302851",
    liveThreadId: "archived-thread",
    liveMessageId: "archived-message",
  });
  board.board.planning.epics[0].primaryCardIds.push("completed-card");
  await fs.writeFile(boardPath, JSON.stringify(board), "utf8");

  const content = canonicalContent();
  const result = await _internals.buildMazerFeedbackBoardLiveReadback({
    boardPath,
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url) => {
      assert(url.endsWith("/channels/thread-1/messages?limit=100"));
      return response({ payload: [
        { id: "journal-1", timestamp: "2026-07-14T00:00:00.000Z", content: journalContent() },
        { id: "message-1", content },
      ] });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.cardCount, 2);
  assert.equal(result.checkedCardCount, 1);
  assert.equal(result.skippedCompletedSourceCardCount, 1);
});

test("mazer feedback board live readback rejects legacy and mismatched card bodies", async () => {
  const boardPath = await writeBoard();
  const result = await _internals.buildMazerFeedbackBoardLiveReadback({
    boardPath,
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async () => response({ payload: [{ id: "message-1", content: "# mazer\nthin body" }] }),
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("live_message_canonical_body_missing"));

  const mismatch = await _internals.buildMazerFeedbackBoardLiveReadback({
    boardPath,
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async () => response({ payload: [
      { id: "journal-1", timestamp: "2026-07-14T00:00:00.000Z", content: journalContent({ state: "planning" }) },
      { id: "message-1", content: canonicalContent({ id: "wrong", state: "planning" }) },
    ] }),
  });
  assert.equal(mismatch.ok, false);
  assert(mismatch.reasonCodes.includes("live_message_card_id_mismatch"));
});

test("mazer feedback board live readback preserves exact state guards where source state is explicit", () => {
  const row = _internals.inspectThreadMessages({
    card: {
      id: "card-1",
      state: "ready",
      completionPercent: 90,
      liveThreadId: "thread-1",
      liveMessageId: "message-1",
    },
    messages: [
      {
        id: "journal-1",
        content: journalContent({ state: "in_progress" }),
      },
      { id: "message-1", content: "legacy starter" },
    ],
    status: 200,
    ok: true,
    contentLimit: 2000,
    boardVersion: 1,
  });

  assert.equal(row.ok, false);
  assert(row.reasonCodes.includes("live_message_state_mismatch"));
});

test("mazer feedback board live readback accepts the Discord 2000 character limit", () => {
  const row = _internals.inspectMessageContent({
    card: { id: "card-1", state: "open", completionPercent: 10 },
    message: { content: canonicalContent().padEnd(2000, " ") },
    status: 200,
    ok: true,
    contentLimit: 2000,
  });
  assert.equal(row.ok, true);
});

test("mazer feedback board live readback accepts a multi-message journal and correlates identities", async () => {
  const boardPath = await writeBoard();
  const result = await _internals.buildMazerFeedbackBoardLiveReadback({
    boardPath,
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url) => {
      assert(url.endsWith("/channels/thread-1/messages?limit=100"));
      return response({ payload: [
        {
          id: "journal-1",
          timestamp: "2026-07-14T00:00:00.000Z",
          content: journalContent(),
        },
        { id: "message-1", content: "# mazer\nlegacy starter" },
      ] });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.readyCardCount, 1);
  assert.equal(result.correlatedCardCount, 1);
  assert.equal(result.idempotencyCorrelatedCardCount, 1);
  assert.equal(result.observedBoardVersion, 1);
  assert.match(result.readbackReceiptId, /^dbr_[a-f0-9]{32}$/);
  assert.equal(result.rows[0].messageId, "journal-1");
  assert.equal(result.rows[0].observedEventId, "evt-card-1");
  assert.equal(result.rows[0].observedIdempotencyKey, "evt-card-1");
  assert.equal(result.rows[0].correlationMode, "journal_event_with_board_thread_mapping");
});

test("mazer feedback board live readback supports legacy journal events through exact thread mapping", () => {
  const row = _internals.inspectThreadMessages({
    card: {
      id: "card-1",
      state: "open",
      completionPercent: 10,
      liveThreadId: "thread-1",
      liveMessageId: "message-1",
    },
    messages: [
      {
        id: "journal-legacy",
        timestamp: "2026-07-14T00:00:00.000Z",
        content: journalContent({ includeIdentity: false }),
      },
      { id: "message-1", content: "legacy starter" },
    ],
    status: 200,
    ok: true,
    contentLimit: 2000,
    boardVersion: 1,
  });

  assert.equal(row.ok, true);
  assert.equal(row.liveCardId, "card-1");
  assert.equal(row.observedIdempotencyKey, "evt-card-1");
});

test("mazer feedback board live readback requires a journal beside a canonical starter", () => {
  const row = _internals.inspectThreadMessages({
    card: {
      id: "card-1",
      state: "open",
      completionPercent: 10,
      liveThreadId: "thread-1",
      liveMessageId: "message-1",
    },
    messages: [{ id: "message-1", content: canonicalContent() }],
    status: 200,
    ok: true,
    contentLimit: 2000,
    boardVersion: 1,
  });

  assert.equal(row.ok, false);
  assert(row.reasonCodes.includes("live_journal_event_missing"));
});

test("mazer feedback board live readback selects the newest journal event", () => {
  const row = _internals.inspectThreadMessages({
    card: {
      id: "card-1",
      state: "open",
      completionPercent: 10,
      liveThreadId: "thread-1",
      liveMessageId: "message-1",
    },
    messages: [
      { id: "older", timestamp: "2026-07-13T00:00:00.000Z", content: journalContent({ eventId: "evt-older", state: "planning" }) },
      { id: "message-1", content: "legacy starter" },
      { id: "newer", timestamp: "2026-07-14T00:00:00.000Z", content: journalContent({ eventId: "evt-newer", state: "in_progress" }) },
    ],
    status: 200,
    ok: true,
    contentLimit: 2000,
    boardVersion: 1,
  });

  assert.equal(row.ok, true);
  assert.equal(row.messageId, "newer");
  assert.equal(row.observedEventId, "evt-newer");
  assert.equal(row.liveState, "in_progress");
});

test("mazer feedback board receipt identity changes with correlation and diagnostics", () => {
  const base = {
    boardId: "mazer",
    observedBoardVersion: 1,
    rows: [{
      cardId: "card-1",
      threadId: "thread-1",
      starterMessageId: "message-1",
      messageId: "journal-1",
      observedEventId: "evt-1",
      observedIdempotencyKey: "evt-1",
      observedContentDigest: "sha256:one",
      liveState: "planning",
      ok: true,
      reasonCodes: [],
      messageCount: 2,
      journalMessageCount: 1,
      pageCount: 1,
      truncated: false,
    }],
  };
  const first = _internals.readbackReceiptId(base);
  const changedEvent = _internals.readbackReceiptId({
    ...base,
    rows: [{ ...base.rows[0], observedEventId: "evt-2" }],
  });
  const changedDiagnostics = _internals.readbackReceiptId({
    ...base,
    rows: [{ ...base.rows[0], ok: false, reasonCodes: ["blocked"] }],
  });

  assert.notEqual(first, changedEvent);
  assert.notEqual(first, changedDiagnostics);
});

test("mazer feedback board live readback finds a journal on page two", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: `new-${100 - index}`,
    content: "non-journal message",
  }));
  const result = await _internals.readThreadMessages({
    threadId: "thread-1",
    token: "token",
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/thread-1/messages?limit=100")) return response({ payload: firstPage });
      if (url.endsWith("/channels/thread-1/messages?limit=100&before=new-1")) {
        return response({ payload: [{ id: "journal-page-2", content: journalContent() }] });
      }
      throw new Error(`unexpected ${url}`);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.pageCount, 2);
  assert.equal(result.messages.at(-1).id, "journal-page-2");
});

test("mazer feedback board live readback fails closed on truncated journal history", async () => {
  const messages = Array.from({ length: 100 }, (_, index) => ({
    id: `message-${100 - index}`,
    content: "entry",
  }));
  const result = await _internals.readThreadMessages({
    threadId: "thread-1",
    token: "token",
    fetchImpl: async () => response({ payload: messages }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.truncated, true);
  assert.equal(result.pageCount, 10);
  assert(result.reasonCodes.includes("live_thread_message_history_truncated"));
});
