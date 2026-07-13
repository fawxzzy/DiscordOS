const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-encoding-cleanup");

function response({ ok = true, status = 200, payload = null } = {}) {
  return { ok, status, json: async () => payload };
}

const corruptedTitle = "Feature: History \u00e2\u20ac\u201d Progress";
const cleanTitle = "Feature: History - Progress";

test("only bot-owned type-4 messages matching the current clean title are eligible", () => {
  const eligible = _internals.classifyMessage({
    message: { id: "rename", type: 4, content: corruptedTitle, author: { id: "bot", bot: true } },
    thread: { id: "thread", name: cleanTitle },
    botUserId: "bot",
  });
  assert.equal(eligible.eligible, true);

  const userMessage = _internals.classifyMessage({
    message: { id: "note", type: 0, content: corruptedTitle, author: { id: "user", bot: false } },
    thread: { id: "thread", name: cleanTitle },
    botUserId: "bot",
  });
  assert.equal(userMessage.eligible, false);
  assert(userMessage.reasonCodes.includes("encoding_cleanup_non_rename_message_protected"));
  assert(userMessage.reasonCodes.includes("encoding_cleanup_non_bot_message_protected"));
});

test("live cleanup requires both mutation guards", async () => {
  const result = await _internals.buildBoardEncodingCleanup({
    payload: { boards: [] },
    apply: true,
    allowApply: false,
    env: { DISCORDOS_BOT_TOKEN: "token" },
  });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("board_encoding_cleanup_not_admitted"));
});

test("dry run identifies a malformed rename without deleting it", async () => {
  const calls = [];
  const result = await _internals.buildBoardEncodingCleanup({
    payload: { boards: [{ id: "fitness", forumChannelId: "forum" }] },
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/users/@me")) return response({ payload: { id: "bot", bot: true } });
      if (url.endsWith("/channels/forum")) return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) {
        return response({ payload: { threads: [{ id: "thread", name: cleanTitle, parent_id: "forum", thread_metadata: { archived: false } }] } });
      }
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/thread/messages?limit=100")) {
        return response({ payload: [{ id: "rename", type: 4, content: corruptedTitle, author: { id: "bot", bot: true } }] });
      }
      throw new Error(`unexpected ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "dry_run");
  assert.equal(result.candidateCount, 1);
  assert(calls.every((call) => call.method === "GET"));
});

test("guarded cleanup deletes an admitted rename and proves 404 readback", async () => {
  const result = await _internals.buildBoardEncodingCleanup({
    payload: { boards: [{ id: "fitness", forumChannelId: "forum" }] },
    apply: true,
    allowApply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_BOARD_ENCODING_CLEANUP: "enabled",
    },
    fetchImpl: async (url, init) => {
      if (url.endsWith("/users/@me")) return response({ payload: { id: "bot", bot: true } });
      if (url.endsWith("/channels/forum")) return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) {
        return response({ payload: { threads: [{ id: "thread", name: cleanTitle, parent_id: "forum", thread_metadata: { archived: false } }] } });
      }
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/thread/messages?limit=100")) {
        return response({ payload: [{ id: "rename", type: 4, content: corruptedTitle, author: { id: "bot", bot: true } }] });
      }
      if (url.endsWith("/channels/thread/messages/rename") && init.method === "DELETE") return response({ status: 204 });
      if (url.endsWith("/channels/thread/messages/rename") && init.method === "GET") return response({ ok: false, status: 404 });
      throw new Error(`unexpected ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "cleaned");
  assert.equal(result.deletedCount, 1);
  assert.equal(result.rows[0].readbackDeleted, true);
});
