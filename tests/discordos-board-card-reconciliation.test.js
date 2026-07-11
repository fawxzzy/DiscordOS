const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-card-reconciliation");

function response({ ok = true, status = 200, payload = null } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

async function writeBoard(cardTitle = "Card One") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-board-reconcile-"));
  const boardPath = path.join(dir, "board.json");
  await fs.writeFile(boardPath, JSON.stringify({
    version: 1,
    board: {
      id: "mazer",
      label: "mazer",
      liveForumChannelId: "forum-1",
      liveGuildId: "guild-1",
      titleContract: {
        style: "prefix",
        prefix: "mazer",
        separator: ": ",
        maxLength: 100,
      },
      requiredReaction: {
        status: "failure",
        name: "failure",
        id: "1507384094424694785",
        target: "forum_starter_message",
      },
    },
    cards: [
      {
        id: "mazer-card-1",
        title: cardTitle,
        state: "open",
        reactionStatus: "failure",
        reactionEmojiName: "failure",
        reactionEmojiId: "1507384094424694785",
      },
    ],
  }, null, 2), "utf8");
  return boardPath;
}

test("board card reconciliation dry-run reports title and reaction repairs", async () => {
  const boardPath = await writeBoard("Card One");
  const result = await _internals.buildBoardCardReconciliation({
    boardPath,
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url) => {
      if (url.endsWith("/guilds/guild-1/threads/active")) {
        return response({
          payload: {
            threads: [
              {
                id: "thread-1",
                name: "Card One",
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
      if (url.endsWith("/channels/thread-1/messages/thread-1")) {
        return response({ payload: { reactions: [] } });
      }
      throw new Error(`unexpected request ${url}`);
    },
  });

  assert.equal(result.status, "dry_run");
  assert.equal(result.inspectedCardCount, 1);
  assert.equal(result.titleRepairRequiredCount, 1);
  assert.equal(result.reactionRepairRequiredCount, 1);
  assert.equal(result.rows[0].expectedTitle, "mazer: Card One");
});

test("board card reconciliation apply repairs title and reaction once", async () => {
  const boardPath = await writeBoard("Card One");
  const calls = [];
  const result = await _internals.buildBoardCardReconciliation({
    boardPath,
    allowApply: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_BOARD_CARD_RECONCILE: "enabled",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (url.endsWith("/guilds/guild-1/threads/active")) {
        return response({
          payload: {
            threads: [
              {
                id: "thread-1",
                name: "Card One",
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
      if (url.endsWith("/channels/thread-1") && init.method === "PATCH") {
        assert.equal(JSON.parse(init.body).name, "mazer: Card One");
        return response({ payload: { id: "thread-1", name: "mazer: Card One" } });
      }
      if (url.endsWith("/channels/thread-1/messages/thread-1")) {
        const reactionApplied = calls.some((call) => call.url.includes("/reactions/failure%3A1507384094424694785/@me"));
        return response({
          payload: {
            reactions: reactionApplied
              ? [{ emoji: { name: "failure", id: "1507384094424694785" }, count: 1, me: true }]
              : [],
          },
        });
      }
      if (url.includes("/reactions/failure%3A1507384094424694785/@me")) {
        return response({ status: 204, payload: null });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });

  assert.equal(result.status, "reconciled");
  assert.equal(result.titleRepairCount, 1);
  assert.equal(result.reactionRepairCount, 1);
  assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
  assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
});

test("board card reconciliation blocks apply without double guard", async () => {
  const boardPath = await writeBoard();
  const result = await _internals.buildBoardCardReconciliation({
    boardPath,
    allowApply: true,
    apply: true,
    env: { DISCORDOS_BOT_TOKEN: "token" },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("board_card_reconcile_double_guard_missing"));
  assert(result.reasonCodes.includes("board_card_reconcile_apply_not_admitted"));
});
