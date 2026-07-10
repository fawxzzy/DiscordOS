const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-mazer-legacy-feedback-forum-cleanup");

function response({ ok = true, status = 200, payload = null } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

async function writeBoard() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-mazer-legacy-board-"));
  const boardPath = path.join(dir, "board.json");
  await fs.writeFile(boardPath, JSON.stringify({
    version: 1,
    board: {
      id: "mazer",
      label: "mazer",
      legacyForumChannelId: "legacy-forum-1",
    },
    cards: [],
  }, null, 2), "utf8");
  return boardPath;
}

test("mazer legacy feedback forum cleanup parses guarded delete args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--forum-channel-id",
    "legacy-forum-1",
    "--action",
    "delete",
    "--allow-cleanup",
    "--apply",
    "--confirm-delete-legacy-mazer-feedback",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.forumChannelId, "legacy-forum-1");
  assert.equal(parsed.action, "delete");
  assert.equal(parsed.allowCleanup, true);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.confirmDelete, true);
});

test("mazer legacy feedback forum cleanup readback calls Discord without mutation", async () => {
  const boardPath = await writeBoard();
  const calls = [];
  const result = await _internals.buildMazerLegacyFeedbackForumCleanup({
    boardPath,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/channels/legacy-forum-1")) {
        return response({
          payload: {
            id: "legacy-forum-1",
            name: "mazer-feedback",
            type: 15,
            guild_id: "guild-1",
            parent_id: "project-feedback-category",
          },
        });
      }
      return response({ ok: false, status: 404, payload: {} });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "readback");
  assert.equal(result.callsDiscordApi, true);
  assert.equal(result.channelRead.channel.name, "mazer-feedback");
  assert.equal(result.mutation.attempted, false);
  assert.equal(calls.some((call) => call.method === "PATCH" || call.method === "DELETE"), false);
});

test("mazer legacy feedback forum cleanup blocks partial live guard", async () => {
  const boardPath = await writeBoard();
  const result = await _internals.buildMazerLegacyFeedbackForumCleanup({
    boardPath,
    action: "archive",
    allowCleanup: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
    },
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/legacy-forum-1")) {
        return response({
          payload: {
            id: "legacy-forum-1",
            name: "mazer-feedback",
            type: 15,
            guild_id: "guild-1",
          },
        });
      }
      return response({ ok: false, status: 404, payload: {} });
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("mazer_legacy_feedback_cleanup_double_guard_missing"));
  assert(result.reasonCodes.includes("mazer_legacy_feedback_cleanup_not_admitted"));
  assert.equal(result.mutation.attempted, false);
});

test("mazer legacy feedback forum cleanup archives by guarded rename", async () => {
  const boardPath = await writeBoard();
  const calls = [];
  const result = await _internals.buildMazerLegacyFeedbackForumCleanup({
    boardPath,
    action: "archive",
    allowCleanup: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_MAZER_LEGACY_FEEDBACK_CLEANUP: "enabled",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (url.endsWith("/channels/legacy-forum-1") && init.method === "GET") {
        return response({
          payload: {
            id: "legacy-forum-1",
            name: "mazer-feedback",
            type: 15,
            guild_id: "guild-1",
          },
        });
      }
      if (url.endsWith("/channels/legacy-forum-1") && init.method === "PATCH") {
        assert.equal(JSON.parse(init.body).name, "archived-mazer-feedback");
        return response({
          payload: {
            id: "legacy-forum-1",
            name: "archived-mazer-feedback",
            type: 15,
            guild_id: "guild-1",
          },
        });
      }
      return response({ ok: false, status: 404, payload: {} });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "cleanup_applied");
  assert.equal(result.mutation.attempted, true);
  assert.equal(result.mutation.ok, true);
  assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
});

test("mazer legacy feedback forum cleanup requires delete confirmation", async () => {
  const boardPath = await writeBoard();
  const result = await _internals.buildMazerLegacyFeedbackForumCleanup({
    boardPath,
    action: "delete",
    allowCleanup: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_MAZER_LEGACY_FEEDBACK_CLEANUP: "enabled",
    },
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/legacy-forum-1")) {
        return response({
          payload: {
            id: "legacy-forum-1",
            name: "mazer-feedback",
            type: 15,
            guild_id: "guild-1",
          },
        });
      }
      return response({ ok: false, status: 404, payload: {} });
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("legacy_forum_delete_confirmation_missing"));
  assert.equal(result.mutation.attempted, false);
});

test("mazer legacy feedback forum cleanup rejects non-mazer target names", async () => {
  const boardPath = await writeBoard();
  const result = await _internals.buildMazerLegacyFeedbackForumCleanup({
    boardPath,
    action: "archive",
    allowCleanup: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_MAZER_LEGACY_FEEDBACK_CLEANUP: "enabled",
    },
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/legacy-forum-1")) {
        return response({
          payload: {
            id: "legacy-forum-1",
            name: "general-feedback",
            type: 15,
            guild_id: "guild-1",
          },
        });
      }
      return response({ ok: false, status: 404, payload: {} });
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("legacy_forum_channel_not_mazer_feedback_named"));
  assert.equal(result.mutation.attempted, false);
});
