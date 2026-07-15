const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-encoding-cleanup");

function response({ ok = true, status = 200, payload = null } = {}) {
  return { ok, status, json: async () => payload };
}

const corruptedTitle = "Feature: History \u00e2\u20ac\u201d Progress";
const cleanTitle = "Feature: History - Progress";
const historicalCorruptedTitle = "Feature: Earlier \u00e2\u20ac\u201d Name";
const doubleCorruptedTitle = "Feature: Earlier \u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac Name";

test("Discord type-4 rename history is immutable even when the current title is clean", () => {
  const eligible = _internals.classifyMessage({
    message: { id: "rename", type: 4, content: corruptedTitle, author: { id: "bot", bot: true } },
    thread: { id: "thread", name: cleanTitle },
    botUserId: "bot",
  });
  assert.equal(eligible.eligible, false);
  assert.equal(eligible.immutable, true);
  assert.deepEqual(eligible.retentionReasonCodes, ["encoding_cleanup_discord_system_message_immutable"]);

  const historical = _internals.classifyMessage({
    message: { id: "historical", type: 4, content: historicalCorruptedTitle, author: { id: "bot", bot: true } },
    thread: { id: "thread", name: cleanTitle },
    botUserId: "bot",
  });
  assert.equal(historical.eligible, false);
  assert.equal(historical.immutable, true);

  const doubleCorrupted = _internals.classifyMessage({
    message: { id: "double", type: 4, content: doubleCorruptedTitle, author: { id: "bot", bot: true } },
    thread: { id: "thread", name: cleanTitle },
    botUserId: "bot",
  });
  assert.equal(doubleCorrupted.eligible, false);
  assert.equal(doubleCorrupted.immutable, true);

  const userMessage = _internals.classifyMessage({
    message: { id: "note", type: 0, content: corruptedTitle, author: { id: "user", bot: false } },
    thread: { id: "thread", name: cleanTitle },
    botUserId: "bot",
  });
  assert.equal(userMessage.eligible, false);
  assert(userMessage.reasonCodes.includes("encoding_cleanup_non_rename_message_protected"));
  assert(userMessage.reasonCodes.includes("encoding_cleanup_non_bot_message_protected"));
});

test("ordinary starters and non-system history remain protected", () => {
  const starter = _internals.classifyMessage({
    message: { id: "thread", type: 0, content: corruptedTitle, author: { id: "bot", bot: true } },
    thread: { id: "thread", name: cleanTitle },
    botUserId: "bot",
  });
  assert.equal(starter.eligible, false);
  assert(starter.reasonCodes.includes("encoding_cleanup_starter_message_protected"));

  const dirtyThread = _internals.classifyMessage({
    message: { id: "rename", type: 0, content: historicalCorruptedTitle, author: { id: "bot", bot: true } },
    thread: { id: "thread", name: corruptedTitle },
    botUserId: "bot",
  });
  assert.equal(dirtyThread.eligible, false);
  assert(dirtyThread.reasonCodes.includes("encoding_cleanup_current_title_not_clean"));
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

test("dry run retains a malformed immutable rename without deleting it", async () => {
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
  assert.equal(result.status, "immutable_system_history_retained");
  assert.equal(result.candidateCount, 0);
  assert.equal(result.immutableCount, 1);
  assert.equal(result.rows[0].action, "retain_immutable_system_history");
  assert(calls.every((call) => call.method === "GET"));
});

test("guarded cleanup never attempts to delete an immutable system rename", async () => {
  const calls = [];
  const result = await _internals.buildBoardEncodingCleanup({
    payload: { boards: [{ id: "fitness", forumChannelId: "forum" }] },
    apply: true,
    allowApply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_BOARD_ENCODING_CLEANUP: "enabled",
    },
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
  assert.equal(result.status, "immutable_system_history_retained");
  assert.equal(result.candidateCount, 0);
  assert.equal(result.immutableCount, 1);
  assert.equal(result.deletedCount, 0);
  assert(calls.every((call) => call.method === "GET"));
});

test("a clean rerun is idempotent", async () => {
  const result = await _internals.buildBoardEncodingCleanup({
    payload: { boards: [{ id: "fitness", forumChannelId: "forum" }] },
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url) => {
      if (url.endsWith("/users/@me")) return response({ payload: { id: "bot", bot: true } });
      if (url.endsWith("/channels/forum")) return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) {
        return response({ payload: { threads: [{ id: "thread", name: cleanTitle, parent_id: "forum", thread_metadata: { archived: false } }] } });
      }
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/thread/messages?limit=100")) return response({ payload: [] });
      throw new Error(`unexpected ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "clean");
  assert.equal(result.candidateCount, 0);
  assert.equal(result.immutableCount, 0);
});
