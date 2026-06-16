const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-feedback-board-cleanup");

function response({ ok = true, status = 200, payload = null } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

test("music sesh feedback board cleanup parses guarded apply args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--forum-channel-id",
    "1508139160853286942",
    "--keep-thread-id",
    "1508141153835421798",
    "--keep-title-contains",
    "Music Sesh Phase 8",
    "--allow-cleanup",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.forumChannelId, "1508139160853286942");
  assert.equal(parsed.keepThreadId, "1508141153835421798");
  assert.equal(parsed.keepTitleContains, "Music Sesh Phase 8");
  assert.equal(parsed.allowCleanup, true);
  assert.equal(parsed.apply, true);
});

test("music sesh feedback board cleanup dry-runs without archive calls", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshFeedbackBoardCleanup({
    env: {
      DISCORDOS_BOT_TOKEN: "token",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/channels/1508139160853286942")) {
        return response({ payload: { guild_id: "guild-1" } });
      }
      if (url.endsWith("/guilds/guild-1/threads/active")) {
        return response({
          payload: {
            threads: [
              {
                id: "keep-1",
                name: "Music Sesh Phase 8",
                parent_id: "1508139160853286942",
                thread_metadata: { archived: false, locked: false },
              },
              {
                id: "remove-1",
                name: "Bad generated card",
                parent_id: "1508139160853286942",
                thread_metadata: { archived: false, locked: false },
              },
            ],
          },
        });
      }
      return response({ payload: { threads: [] } });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "dry_run");
  assert.equal(result.cleanupCandidateCount, 1);
  assert.equal(result.archivedCount, 0);
  assert.equal(calls.some((call) => call.method === "PATCH"), false);
});

test("music sesh feedback board cleanup blocks partial live guard", async () => {
  const result = await _internals.buildMusicSeshFeedbackBoardCleanup({
    allowCleanup: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
    },
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/1508139160853286942")) {
        return response({ payload: { guild_id: "guild-1" } });
      }
      if (url.endsWith("/guilds/guild-1/threads/active")) {
        return response({
          payload: {
            threads: [
              {
                id: "1508141153835421798",
                name: "Music Sesh Phase 8",
                parent_id: "1508139160853286942",
                thread_metadata: { archived: false, locked: false },
              },
            ],
          },
        });
      }
      return response({ payload: { threads: [] } });
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("feedback_board_cleanup_double_guard_missing"));
  assert(result.reasonCodes.includes("feedback_board_cleanup_not_admitted"));
});

test("music sesh feedback board cleanup archives only non-phase-8 active threads", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshFeedbackBoardCleanup({
    allowCleanup: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      DISCORDOS_MUSIC_SESH_BOARD_CLEANUP: "enabled",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (url.endsWith("/channels/1508139160853286942")) {
        return response({ payload: { guild_id: "guild-1" } });
      }
      if (url.endsWith("/guilds/guild-1/threads/active")) {
        return response({
          payload: {
            threads: [
              {
                id: "1508141153835421798",
                name: "Music Sesh Phase 8",
                parent_id: "1508139160853286942",
                thread_metadata: { archived: false, locked: false },
              },
              {
                id: "remove-1",
                name: "Bad generated card",
                parent_id: "1508139160853286942",
                thread_metadata: { archived: false, locked: false },
              },
            ],
          },
        });
      }
      if (url.endsWith("/channels/remove-1")) {
        return response({ payload: { id: "remove-1" } });
      }
      return response({ payload: { threads: [] } });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "cleanup_applied");
  assert.equal(result.cleanupCandidateCount, 1);
  assert.equal(result.archivedCount, 1);
  const archiveCall = calls.find((call) => call.method === "PATCH");
  assert(archiveCall);
  assert(archiveCall.url.endsWith("/channels/remove-1"));
  assert.deepEqual(JSON.parse(archiveCall.body), { archived: true, locked: true });
});
