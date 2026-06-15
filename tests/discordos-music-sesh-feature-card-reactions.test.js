const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-feature-card-reactions");

function response({ ok = true, status = 204, payload = null } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

test("music sesh feature card reactions parses guarded apply args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--thread-id",
    "1515961745414557896",
    "--message-id",
    "1515961745414557896",
    "--status",
    "failure",
    "--allow-apply",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.threadId, "1515961745414557896");
  assert.equal(parsed.messageId, "1515961745414557896");
  assert.equal(parsed.status, "failure");
  assert.equal(parsed.allowApply, true);
  assert.equal(parsed.apply, true);
});

test("music sesh feature card reactions dry-runs without Discord calls", async () => {
  let fetchCount = 0;
  const result = await _internals.buildMusicSeshFeatureCardReactions({
    threadId: "thread-1",
    status: "success",
    env: {},
    fetchImpl: async () => {
      fetchCount += 1;
      return response();
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "dry_run");
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.messageId, "thread-1");
  assert.equal(result.reactionEmoji, "success:1507384062166302851");
  assert.equal(result.reactionEmojiName, "success");
  assert.equal(fetchCount, 0);
});

test("music sesh feature card reactions blocks partial live guard", async () => {
  const result = await _internals.buildMusicSeshFeatureCardReactions({
    threadId: "thread-1",
    allowApply: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("feature_card_reaction_double_guard_missing"));
  assert(result.reasonCodes.includes("feature_card_reaction_apply_not_admitted"));
});

test("music sesh feature card reactions applies success reaction with readback", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshFeatureCardReactions({
    threadId: "thread-1",
    status: "success",
    allowApply: true,
    apply: true,
    env: {
      DISCORDOS_MUSIC_SESH_CARD_REACTIONS: "enabled",
      DISCORDOS_BOT_TOKEN: "token",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (init.method === "GET") {
        return response({
          status: 200,
          payload: {
            reactions: [
              {
                emoji: { name: "success", id: "1507384062166302851" },
                count: 1,
                me: true,
              },
            ],
          },
        });
      }
      return response();
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "reaction_applied");
  assert.equal(result.removeOppositeResult.attempted, true);
  assert.equal(result.addReactionResult.attempted, true);
  assert.equal(result.readback.currentReactionPresent, true);
  assert.equal(calls.length, 5);
  assert.equal(calls[0].method, "DELETE");
  assert(calls[0].url.endsWith("/channels/thread-1/messages/thread-1/reactions/failure%3A1507384094424694785/@me"));
  assert.equal(calls[1].method, "DELETE");
  assert(calls[1].url.endsWith("/channels/thread-1/messages/thread-1/reactions/%E2%9C%85/@me"));
  assert.equal(calls[2].method, "DELETE");
  assert(calls[2].url.endsWith("/channels/thread-1/messages/thread-1/reactions/%E2%9D%8C/@me"));
  assert.equal(calls[3].method, "PUT");
  assert(calls[3].url.endsWith("/channels/thread-1/messages/thread-1/reactions/success%3A1507384062166302851/@me"));
  assert.equal(calls[4].method, "GET");
});

test("music sesh feature card reactions maps failure status", async () => {
  const result = await _internals.buildMusicSeshFeatureCardReactions({
    threadId: "thread-1",
    status: "failure",
    env: {},
  });

  assert.equal(result.reactionEmoji, "failure:1507384094424694785");
  assert.equal(result.oppositeEmoji, "success:1507384062166302851");
  assert.equal(result.legacyReactionEmoji, "\u274c");
  assert.equal(result.legacyOppositeEmoji, "\u2705");
});

test("music sesh feature card reactions reports readback misses", async () => {
  const result = await _internals.buildMusicSeshFeatureCardReactions({
    threadId: "thread-1",
    status: "success",
    allowApply: true,
    apply: true,
    env: {
      DISCORDOS_MUSIC_SESH_CARD_REACTIONS: "enabled",
      DISCORDOS_BOT_TOKEN: "token",
    },
    fetchImpl: async (url, init) => {
      if (init.method === "GET") {
        return response({
          status: 200,
          payload: {
            reactions: [],
          },
        });
      }
      return response();
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("feature_card_reaction_readback_missing"));
});
