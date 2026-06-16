const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-feature-card-forum-post");

function response({ ok = true, status = 200, payload = null } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

test("music sesh feature card forum post parses guarded apply args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--forum-channel-id",
    "1508139160853286942",
    "--card-id",
    "music-card",
    "--title",
    "Music Card",
    "--body",
    "Body",
    "--allow-post",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.forumChannelId, "1508139160853286942");
  assert.equal(parsed.cardId, "music-card");
  assert.equal(parsed.title, "Music Card");
  assert.equal(parsed.allowPost, true);
  assert.equal(parsed.apply, true);
});

test("music sesh feature card forum post dry-runs without Discord calls", async () => {
  let fetchCount = 0;
  const result = await _internals.buildMusicSeshFeatureCardForumPost({
    cardId: "music-card",
    title: "Music Card",
    body: "Body",
    env: {},
    fetchImpl: async () => {
      fetchCount += 1;
      return response();
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.status, "dry_run");
  assert.equal(result.forumChannelId, "1508139160853286942");
  assert.equal(fetchCount, 0);
});

test("music sesh feature card forum post blocks partial live guard", async () => {
  const result = await _internals.buildMusicSeshFeatureCardForumPost({
    cardId: "music-card",
    title: "Music Card",
    body: "Body",
    allowPost: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("feature_card_post_double_guard_missing"));
  assert(result.reasonCodes.includes("feature_card_post_not_admitted"));
});

test("music sesh feature card forum post creates thread and reads starter", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshFeatureCardForumPost({
    cardId: "music-card",
    title: "Music Card",
    body: "Body",
    allowPost: true,
    apply: true,
    env: {
      DISCORDOS_MUSIC_SESH_FEATURE_CARD_POST: "enabled",
      DISCORDOS_BOT_TOKEN: "token",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (init.method === "POST") {
        return response({
          status: 201,
          payload: {
            id: "1516000000000000000",
            message: {
              id: "1516000000000000000",
              timestamp: "2026-06-15T00:00:00.000000+00:00",
            },
          },
        });
      }
      return response({
        status: 200,
        payload: {
          content: "**Feature Request**\n\n**Title**\nMusic Card",
        },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, true);
  assert.equal(result.postResult.threadId, "1516000000000000000");
  assert.equal(result.readback.titleMatches, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, "POST");
  assert(calls[0].url.endsWith("/channels/1508139160853286942/threads"));
  const payload = JSON.parse(calls[0].body);
  assert.equal(payload.message.embeds, undefined);
  assert(payload.message.content.includes("**Feature Request**"));
  assert(payload.message.content.includes("Area: Fawx Den / Music Sesh"));
  assert(payload.message.content.includes("Report ID: `music-card`"));
  assert(payload.message.content.includes("**Acceptance Criteria**"));
  assert.equal(payload.message.allowed_mentions.parse.length, 0);
  assert.equal(calls[1].method, "GET");
});
