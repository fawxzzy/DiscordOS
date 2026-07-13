const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-completed-transfer");

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
  let sourceContent = "Original card details";
  let reactionPresent = false;
  let sourceArchived = false;
  let sourceLocked = false;
  const result = await _internals.buildCompletedBoardTransfer({
    ...baseOptions,
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
        completedContent = JSON.parse(init.body).message.content;
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
      if (url.includes("/channels/completed-thread/messages/completed-thread/reactions/") && init.method === "PUT") {
        reactionPresent = true;
        return response({ status: 204 });
      }
      if (url.endsWith("/channels/completed-thread")) {
        return response({ payload: { id: "completed-thread", parent_id: "completed-forum" } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "transferred");
  assert.equal(result.completed.threadId, "completed-thread");
  assert.equal(result.completed.reaction.presentAfter, true);
  assert.equal(result.source.readback.archived, true);
  assert.equal(result.source.readback.locked, true);
  assert(sourceContent.includes("https://discord.com/channels/guild/completed-thread"));
  assert(completedContent.includes("ATLAS-CARD-ID: `CARD-42`"));
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
