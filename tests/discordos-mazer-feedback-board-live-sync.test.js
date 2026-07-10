const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-mazer-feedback-board-live-sync");

function response({ ok = true, status = 200, payload = null } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

async function writeBoard() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-mazer-board-"));
  const boardPath = path.join(dir, "board.json");
  await fs.writeFile(boardPath, JSON.stringify({
    version: 1,
    board: {
      id: "mazer",
      label: "mazer",
      source: "discordos-feedback-board",
      placement: {
        channelFamily: "project-feedback",
        forumChannelId: "project-feedback-forum-1",
        sortKey: "project:mazer",
        displayName: "mazer",
      },
      sendsMessages: false,
    },
    cards: [
      {
        id: "mazer-card-1",
        title: "mazer: card one",
        state: "open",
        priority: "high",
        category: "mazer",
        markerName: "Marker One",
        completionPercent: 20,
        summary: "Card one is a planned Mazer work lane.",
        whyItMatters: "It keeps the board useful while Mazer work is active.",
        currentStatus: "The card is ready for live sync proof.",
        workBreakdown: ["Render a full card body.", "Apply the not-done reaction."],
        nextActions: ["Run the guarded live sync."],
        acceptanceCriteria: ["The card is formatted with a clear outcome."],
        proofPlan: ["Run the live-sync verifier."],
        reference: "repos/mazer/docs/research/MAZER_AUTH_AI_VISUAL_COMPLETION_MARKER.md",
        nextCommand: "npm run ops:discordos:mazer-feedback-board:json -- --card-id mazer-card-1",
        reactionStatus: "failure",
        reactionEmojiName: "failure",
        reactionEmojiId: "1507384094424694785",
      },
    ],
  }, null, 2), "utf8");
  return boardPath;
}

test("mazer feedback board live sync parses guarded apply args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--allow-sync",
    "--apply",
    "--forum-channel-id",
    "forum-1",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.allowSync, true);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.forumChannelId, "forum-1");
});

test("mazer feedback board live sync blocks partial guard", async () => {
  const result = await _internals.buildMazerFeedbackBoardLiveSync({
    allowSync: true,
    apply: true,
    env: {},
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("mazer_feedback_board_sync_double_guard_missing"));
  assert(result.reasonCodes.includes("mazer_feedback_board_sync_not_admitted"));
});

test("mazer feedback board live sync uses project feedback category and creates mazer forum card thread", async () => {
  const boardPath = await writeBoard();
  const calls = [];
  const result = await _internals.buildMazerFeedbackBoardLiveSync({
    boardPath,
    allowSync: true,
    apply: true,
    receiptFile: null,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_MAZER_FEEDBACK_BOARD_SYNC: "enabled",
      DISCORDOS_PROJECT_FEEDBACK_FORUM_CHANNEL_ID: "project-feedback-forum-1",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (url.endsWith("/channels/project-feedback-forum-1")) {
        return response({ payload: { id: "project-feedback-forum-1", name: "feedback", type: 15, guild_id: "guild-1", parent_id: "category-1" } });
      }
      if (url.endsWith("/guilds/guild-1/channels") && (!init.method || init.method === "GET")) {
        return response({
          payload: [
            { id: "category-1", name: "Project Feedback Boards", type: 4 },
            { id: "project-feedback-forum-1", name: "feedback", type: 15, parent_id: "category-1" },
          ],
        });
      }
      if (url.endsWith("/guilds/guild-1/channels") && init.method === "POST") {
        const body = JSON.parse(init.body);
        assert.equal(body.name, "mazer");
        assert.equal(body.type, 15);
        assert.equal(body.parent_id, "category-1");
        return response({ payload: { id: "mazer-forum-1", name: "mazer", type: 15, guild_id: "guild-1", parent_id: "category-1" } });
      }
      if (url.endsWith("/guilds/guild-1/threads/active")) {
        return response({ payload: { threads: [] } });
      }
      if (url.endsWith("/channels/mazer-forum-1/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [] } });
      }
      if (url.endsWith("/channels/mazer-forum-1/threads")) {
        const body = JSON.parse(init.body);
        assert.equal(body.name, "mazer: card one");
        assert(body.message.content.includes("# mazer"));
        assert(body.message.content.includes("card id: `mazer-card-1`"));
        assert(body.message.content.includes("**Why This Matters**"));
        assert(body.message.content.includes("**Current State**"));
        assert(body.message.content.includes("**Work Breakdown**"));
        assert(body.message.content.includes("**Next Actions**"));
        assert(body.message.content.includes("**Acceptance Criteria**"));
        assert(body.message.content.includes("**Proof Plan**"));
        return response({
          payload: {
            id: "thread-1",
            parent_id: "mazer-forum-1",
            message: { id: "message-1" },
          },
        });
      }
      if (url.endsWith("/channels/thread-1/messages/message-1") && init.method === "GET") {
        const reactionApplied = calls.some((call) => call.url.includes("/reactions/failure%3A1507384094424694785/@me"));
        return response({
          payload: {
            id: "message-1",
            reactions: reactionApplied
              ? [{ emoji: { name: "failure", id: "1507384094424694785" }, count: 1, me: true }]
              : [],
          },
        });
      }
      if (url.endsWith("/channels/thread-1/messages/message-1/reactions/failure%3A1507384094424694785/@me")) {
        assert.equal(init.method, "PUT");
        return response({ status: 204, payload: null });
      }
      return response({ ok: false, status: 404, payload: {} });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "live_board_synced");
  assert.equal(result.forumTarget.forumChannelId, "mazer-forum-1");
  assert.equal(result.forumTarget.created, true);
  assert.equal(result.syncedCardCount, 1);
  assert.equal(result.createdThreadCount, 1);
  assert.equal(result.boardWrite.written, true);
  assert(calls.some((call) => call.url.endsWith("/channels/mazer-forum-1/threads")));
  assert(calls.some((call) => call.url.includes("/reactions/failure%3A1507384094424694785/@me")));
});

test("mazer feedback board live sync reuses existing card thread", async () => {
  const boardPath = await writeBoard();
  const calls = [];
  const result = await _internals.buildMazerFeedbackBoardLiveSync({
    boardPath,
    allowSync: true,
    apply: true,
    receiptFile: null,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_MAZER_FEEDBACK_BOARD_SYNC: "enabled",
      DISCORDOS_MAZER_FORUM_CHANNEL_ID: "forum-1",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (url.endsWith("/channels/forum-1")) {
        return response({ payload: { id: "forum-1", name: "mazer", type: 15, guild_id: "guild-1" } });
      }
      if (url.endsWith("/guilds/guild-1/threads/active")) {
        return response({
          payload: {
            threads: [
              {
                id: "thread-1",
              name: "mazer: card one",
              parent_id: "forum-1",
              thread_metadata: { archived: false },
            },
            ],
          },
        });
      }
      if (url.endsWith("/channels/forum-1/threads/archived/public?limit=100")) {
        return response({ payload: { threads: [] } });
      }
      if (url.endsWith("/channels/forum-1/threads")) {
        assert.fail("existing card should not create another thread");
      }
      if (url.endsWith("/channels/thread-1/messages/thread-1")) {
        if (init.method === "PATCH") {
          const body = JSON.parse(init.body);
          assert(body.content.includes("# mazer"));
          assert(body.content.includes("**Work Breakdown**"));
          assert(body.content.includes("**Next Actions**"));
          return response({ payload: { id: "thread-1" } });
        }
        const reactionApplied = calls.some((call) => call.url.includes("/reactions/failure%3A1507384094424694785/@me"));
        return response({
          payload: {
            id: "thread-1",
            reactions: reactionApplied
              ? [{ emoji: { name: "failure", id: "1507384094424694785" }, count: 1, me: true }]
              : [],
          },
        });
      }
      if (url.endsWith("/channels/thread-1/messages/thread-1/reactions/failure%3A1507384094424694785/@me")) {
        assert.equal(init.method, "PUT");
        return response({ status: 204, payload: null });
      }
      return response({ ok: false, status: 404, payload: {} });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.existingThreadCount, 1);
  assert.equal(result.createdThreadCount, 0);
  assert.equal(result.cardSyncResults[0].reactionStatus, 204);
});

test("mazer feedback board live sync renders bounded markdown", async () => {
  const result = await _internals.buildMazerFeedbackBoardLiveSync({
    env: {},
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Mazer Feedback Board Live Sync"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("sync admission: `sync_guard_not_requested`"));
  assert(!rendered.includes("Bot "));
});

test("mazer feedback board live sync keeps Discord card messages under content limit", async () => {
  const { _internals: boardInternals } = require("../scripts/discordos-mazer-feedback-board");
  const result = await boardInternals.buildMazerFeedbackBoard();

  for (const card of result.cards) {
    const payload = _internals.buildCardThreadPayload(card);
    assert(payload.message.content.length < 2000, `${card.id} exceeded Discord content limit`);
    assert(payload.message.content.includes("**Why This Matters**"));
    assert(payload.message.content.includes("**Work Breakdown**"));
    assert(payload.message.content.includes("_Full reference path, command, and expanded checklist live in the source board config._"));
  }
});

test("mazer feedback board live sync omits completion markers from backlog cards", () => {
  const payload = _internals.buildCardThreadPayload({
    id: "mazer-backlog-card",
    title: "mazer: backlog card",
    state: "backlog",
    priority: "medium",
    category: "mazer",
    summary: "Backlog-only future Mazer work.",
    whyItMatters: "It keeps future scope visible without implying active work.",
    currentStatus: "Backlog only.",
    workBreakdown: ["Record the future scope."],
    nextActions: ["Wait for explicit prioritization."],
    acceptanceCriteria: ["The card stays backlog-only."],
    proofPlan: ["Run the board verifier."],
    relatedCardIds: ["mazer-related-card"],
    reference: "repos/mazer/docs/research/MAZER_AUTH_AI_VISUAL_COMPLETION_MARKER.md",
    nextCommand: "npm run ops:discordos:mazer-feedback-board:json -- --card-id mazer-backlog-card",
    reactionStatus: "failure",
    reactionEmojiName: "failure",
    reactionEmojiId: "1507384094424694785",
  });

  assert(payload.message.content.includes("- classification: `backlog`"));
  assert(!payload.message.content.includes("completion marker"));
  assert(!payload.message.content.includes("\n- marker: `"));
  assert(payload.message.content.includes("**Dependencies / Related Cards**"));
  assert(payload.message.content.includes("mazer-related-card"));
});
