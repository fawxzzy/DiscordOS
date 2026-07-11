const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-mazer-feedback-board-live-readback");

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

test("mazer feedback board live readback validates rich Discord card sections", async () => {
  const boardPath = await writeBoard();
  const content = [
    "# mazer",
    "**Why This Matters**",
    "**Current State**",
    "**Work Breakdown**",
    "**Next Actions**",
    "**Acceptance Criteria**",
    "**Proof Plan**",
  ].join("\n\n");
  const result = await _internals.buildMazerFeedbackBoardLiveReadback({
    boardPath,
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url, init) => {
      assert.equal(init.method, "GET");
      assert(url.endsWith("/channels/thread-1/messages/message-1"));
      return response({ payload: { content } });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "live_readback_ready");
  assert.equal(result.checkedCardCount, 1);
  assert.equal(result.readyCardCount, 1);
});

test("mazer feedback board live readback rejects thin Discord card body", async () => {
  const boardPath = await writeBoard();
  const result = await _internals.buildMazerFeedbackBoardLiveReadback({
    boardPath,
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async () => response({ payload: { content: "# mazer\nthin body" } }),
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("live_message_required_markers_missing"));
});
