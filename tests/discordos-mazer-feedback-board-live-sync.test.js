const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-mazer-feedback-board-live-sync");

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-mazer-board-"));
  const boardPath = path.join(dir, "board.json");
  await fs.writeFile(boardPath, JSON.stringify({
    version: 1,
    board: {
      id: "mazer",
      label: "mazer",
      source: "discordos-feedback-board",
      planning: {
        version: 1,
        activeCardId: "mazer-card-1",
        epics: EPIC_IDS.map((id, index) => ({
          id,
          title: id,
          order: index + 1,
          criticalPath: true,
          primaryCardIds: index === 0 ? ["mazer-card-1"] : [],
          supportingCardIds: [],
        })),
        dependencies: [],
        parallelTracks: [],
      },
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

function incidentCard(index, state = "open") {
  const id = `mazer-incident-card-${String(index).padStart(2, "0")}`;
  const completed = state === "completed";
  return {
    id,
    title: `mazer: incident card ${String(index).padStart(2, "0")}`,
    state,
    priority: "high",
    category: "mazer",
    markerName: `Incident Marker ${index}`,
    completionPercent: completed ? 100 : 20,
    summary: `Incident card ${index} summary.`,
    whyItMatters: `Incident card ${index} objective.`,
    currentStatus: `Incident card ${index} current state.`,
    workBreakdown: [`Implement incident card ${index}.`],
    nextActions: [`Advance incident card ${index}.`],
    acceptanceCriteria: [`Incident card ${index} remains governed.`],
    proofPlan: [`Verify incident card ${index}.`],
    reference: "repos/mazer/docs/research/MAZER_AUTH_AI_VISUAL_COMPLETION_MARKER.md",
    nextCommand: `npm run ops:discordos:mazer-feedback-board:json -- --card-id ${id}`,
    reactionStatus: completed ? "success" : "failure",
    reactionEmojiName: completed ? "success" : "failure",
    reactionEmojiId: completed ? "1507384062166302851" : "1507384094424694785",
    ...(completed ? {
      liveThreadId: `incident-thread-${index}`,
      liveMessageId: `incident-thread-${index}`,
    } : {}),
  };
}

async function writeIncidentBoard({ completedFirstCard = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-mazer-incident-board-"));
  const boardPath = path.join(dir, "board.json");
  const cards = Array.from({ length: 58 }, (_, index) =>
    incidentCard(index + 1, completedFirstCard && index === 0 ? "completed" : "open")
  );
  await fs.writeFile(boardPath, JSON.stringify({
    version: 1,
    board: {
      id: "mazer",
      label: "mazer",
      planning: {
        version: 1,
        activeCardId: cards[0].id,
        epics: EPIC_IDS.map((id, index) => ({
          id,
          title: id,
          order: index + 1,
          criticalPath: true,
          primaryCardIds: index === 0 ? cards.map((card) => card.id) : [],
          supportingCardIds: [],
        })),
        dependencies: [],
        parallelTracks: [],
      },
      placement: {
        channelFamily: "project-feedback",
        forumChannelId: "forum-incident",
        sortKey: "project:mazer",
        displayName: "mazer",
      },
      liveForumChannelId: "forum-incident",
      liveGuildId: "guild-incident",
      sendsMessages: true,
    },
    cards,
  }, null, 2), "utf8");
  return { boardPath, cards };
}

function canonicalBody(card, updatedAt = "2026-07-14T22:00:00.000Z") {
  return [
    "<!-- ATLAS-CARD:START -->",
    `ATLAS-CARD-ID: \`${card.id}\``,
    "- project: `Mazer`",
    "- type: `feature`",
    "- state: `planning`",
    "- priority: `High`",
    "- owner: `Mazer`",
    "- progress: `20%`",
    `- updated: \`${updatedAt}\``,
    "",
    "## Summary",
    card.summary,
    "",
    "## Objective",
    `- ${card.whyItMatters}`,
    "",
    "## Acceptance criteria",
    `- ${card.acceptanceCriteria[0]}`,
    "",
    "## Next actions",
    `- ${card.nextActions[0]}`,
    "<!-- ATLAS-CARD:END -->",
  ].join("\n");
}

function incidentDiscordHarness({ cards, starterBodies }) {
  const calls = [];
  const threads = cards.map((card, index) => ({
    id: `incident-thread-${index + 1}`,
    name: card.title,
    parent_id: "forum-incident",
    thread_metadata: { archived: false },
  }));
  const bodyByThread = new Map(threads.map((thread, index) => [thread.id, starterBodies[index]]));
  const cardByThread = new Map(threads.map((thread, index) => [thread.id, cards[index]]));
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    if (url.endsWith("/channels/forum-incident")) {
      return response({ payload: { id: "forum-incident", name: "mazer", type: 15, guild_id: "guild-incident" } });
    }
    if (url.endsWith("/guilds/guild-incident/threads/active")) {
      return response({ payload: { threads } });
    }
    if (url.endsWith("/channels/forum-incident/threads/archived/public?limit=100")) {
      return response({ payload: { threads: [] } });
    }
    const threadMatch = url.match(/\/channels\/(incident-thread-\d+)$/);
    if (threadMatch && init.method === "GET") {
      return response({ payload: threads.find((thread) => thread.id === threadMatch[1]) });
    }
    const messageMatch = url.match(/\/channels\/(incident-thread-\d+)\/messages\/\1$/);
    if (messageMatch && init.method === "GET") {
      const card = cardByThread.get(messageMatch[1]);
      return response({
        payload: {
          id: messageMatch[1],
          content: bodyByThread.get(messageMatch[1]),
          reactions: [{
            emoji: { name: card.reactionEmojiName, id: card.reactionEmojiId },
            count: 1,
            me: true,
          }],
        },
      });
    }
    if (messageMatch && init.method === "PATCH") {
      bodyByThread.set(messageMatch[1], JSON.parse(init.body).content);
      return response({ payload: { id: messageMatch[1] } });
    }
    return response({ ok: false, status: 404, payload: {} });
  };
  return { calls, threads, bodyByThread, fetchImpl };
}

test("mazer feedback board live sync parses guarded apply args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--allow-sync",
    "--apply",
    "--card-id",
    "mazer-card-1",
    "--forum-channel-id",
    "forum-1",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.allowSync, true);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.cardId, "mazer-card-1");
  assert.equal(parsed.fullBoard, false);
  assert.equal(parsed.forumChannelId, "forum-1");
});

test("mazer feedback board live sync skips completed source cards", () => {
  const cards = _internals.selectSyncableCards([
    { id: "active", state: "open" },
    { id: "completed", state: "completed" },
    { id: "backlog", state: "backlog" },
  ]);

  assert.deepEqual(cards.map((card) => card.id), ["active", "backlog"]);
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
  let createdTitle = "";
  let createdContent = "";
  const result = await _internals.buildMazerFeedbackBoardLiveSync({
    boardPath,
    cardId: "mazer-card-1",
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
        createdTitle = body.name;
        createdContent = body.message.content;
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
            content: createdContent,
            reactions: reactionApplied
              ? [{ emoji: { name: "failure", id: "1507384094424694785" }, count: 1, me: true }]
              : [],
          },
        });
      }
      if (url.endsWith("/channels/thread-1") && init.method === "GET") {
        return response({ payload: { id: "thread-1", name: createdTitle } });
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
  let starterContent = "";
  const result = await _internals.buildMazerFeedbackBoardLiveSync({
    boardPath,
    cardId: "mazer-card-1",
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
          starterContent = body.content;
          assert(body.content.includes("# mazer"));
          assert(body.content.includes("**Work Breakdown**"));
          assert(body.content.includes("**Next Actions**"));
          return response({ payload: { id: "thread-1" } });
        }
        const reactionApplied = calls.some((call) => call.url.includes("/reactions/failure%3A1507384094424694785/@me"));
        return response({
          payload: {
            id: "thread-1",
            content: starterContent,
            reactions: reactionApplied
              ? [{ emoji: { name: "failure", id: "1507384094424694785" }, count: 1, me: true }]
              : [],
          },
        });
      }
      if (url.endsWith("/channels/thread-1") && init.method === "GET") {
        return response({ payload: { id: "thread-1", name: "mazer: card one" } });
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

test("mazer feedback board live sync requires explicit mutation scope", () => {
  const missing = _internals.resolveMutationScope({ apply: true, cardId: null, fullBoard: false });
  const bounded = _internals.resolveMutationScope({ apply: true, cardId: "mazer-card-1", fullBoard: false });
  const fullBoard = _internals.resolveMutationScope({ apply: true, cardId: null, fullBoard: true });

  assert.equal(missing.admitted, false);
  assert.deepEqual(missing.reasonCodes, ["mazer_feedback_board_explicit_mutation_scope_required"]);
  assert.equal(bounded.mode, "bounded_card");
  assert.equal(fullBoard.mode, "full_board");
});

test("mazer feedback board live sync rejects out-of-scope card mutations", () => {
  const result = _internals.evaluateCardMutationScope({
    cardId: "mazer-unadmitted-card",
    admittedCardIds: ["mazer-admitted-card"],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ["card_mutation_out_of_scope_prevented"]);
});

test("bounded 58-card sync updates one target without touching 54 canonical unrelated cards and replays idempotently", async () => {
  const { boardPath, cards } = await writeIncidentBoard();
  const starterBodies = cards.map((card, index) => {
    if (index === 0) return "legacy selected body before bounded update";
    if (index <= 54) return canonicalBody(card);
    return `legacy unrelated body ${index + 1}`;
  });
  const harness = incidentDiscordHarness({ cards, starterBodies });
  const canonicalSnapshots = new Map(
    harness.threads.slice(1, 55).map((thread) => [thread.id, harness.bodyByThread.get(thread.id)])
  );
  const options = {
    boardPath,
    cardId: cards[0].id,
    allowSync: true,
    apply: true,
    receiptFile: null,
    writeBoard: false,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_MAZER_FEEDBACK_BOARD_SYNC: "enabled",
      DISCORDOS_MAZER_FORUM_CHANNEL_ID: "forum-incident",
    },
    fetchImpl: harness.fetchImpl,
  };

  const first = await _internals.buildMazerFeedbackBoardLiveSync(options);
  const firstMutations = harness.calls.filter((call) => ["PATCH", "POST", "PUT", "DELETE"].includes(call.method));

  assert.equal(first.ok, true);
  assert.equal(first.cardCount, 58);
  assert.equal(first.syncTargetCardCount, 1);
  assert.equal(first.preflightCardCount, 1);
  assert.equal(first.mutationActionCount, 1);
  assert.equal(first.updatedCardCount, 1);
  assert.equal(first.cardSyncResults.length, 1);
  assert.equal(first.cardSyncResults[0].cardId, cards[0].id);
  assert.equal(first.cardSyncResults[0].action, "updated");
  assert.equal(firstMutations.length, 1);
  assert(firstMutations[0].url.endsWith("/channels/incident-thread-1/messages/incident-thread-1"));
  for (const [threadId, body] of canonicalSnapshots) {
    assert.equal(harness.bodyByThread.get(threadId), body, threadId);
  }

  harness.calls.length = 0;
  const replay = await _internals.buildMazerFeedbackBoardLiveSync(options);
  const replayMutations = harness.calls.filter((call) => ["PATCH", "POST", "PUT", "DELETE"].includes(call.method));

  assert.equal(replay.ok, true);
  assert.equal(replay.status, "live_board_unchanged");
  assert.equal(replay.mutationActionCount, 0);
  assert.equal(replay.updatedCardCount, 0);
  assert.equal(replay.unchangedCardCount, 1);
  assert.equal(replay.cardSyncResults[0].action, "unchanged");
  assert.equal(replayMutations.length, 0);
  for (const [threadId, body] of canonicalSnapshots) {
    assert.equal(harness.bodyByThread.get(threadId), body, threadId);
  }
});

test("57-target full-board sync fails atomically before downgrading canonical starters", async () => {
  const { boardPath, cards } = await writeIncidentBoard({ completedFirstCard: true });
  const starterBodies = cards.map((card) => canonicalBody(card));
  const harness = incidentDiscordHarness({ cards, starterBodies });
  const snapshots = new Map(harness.bodyByThread);

  const result = await _internals.buildMazerFeedbackBoardLiveSync({
    boardPath,
    fullBoard: true,
    allowSync: true,
    apply: true,
    receiptFile: null,
    writeBoard: false,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_MAZER_FEEDBACK_BOARD_SYNC: "enabled",
      DISCORDOS_MAZER_FORUM_CHANNEL_ID: "forum-incident",
    },
    fetchImpl: harness.fetchImpl,
  });
  const mutations = harness.calls.filter((call) => ["PATCH", "POST", "PUT", "DELETE"].includes(call.method));

  assert.equal(result.ok, false);
  assert.equal(result.cardCount, 58);
  assert.equal(result.syncTargetCardCount, 57);
  assert.equal(result.preflightCardCount, 57);
  assert.equal(result.syncedCardCount, 0);
  assert.equal(result.mutationActionCount, 0);
  assert.equal(result.preventedDowngradeCardCount, 57);
  assert(result.reasonCodes.includes("mazer_canonical_card_body_downgrade_prevented"));
  assert(result.reasonCodes.includes("mazer_card_sync_batch_preflight_blocked"));
  assert.equal(mutations.length, 0);
  assert(!harness.calls.some((call) => call.url.includes("incident-thread-1/messages")));
  for (const [threadId, body] of snapshots) {
    assert.equal(harness.bodyByThread.get(threadId), body, threadId);
  }
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
    assert(payload.message.content.includes(`- primary epic: \`${card.primaryEpicId}\``));
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
