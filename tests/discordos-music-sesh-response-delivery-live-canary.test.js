const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-live-canary");

test("response delivery live canary parses live testing args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--content",
    "computa music status",
    "--live",
    "--allow-delivery",
    "--apply",
    "--testing-channel-id",
    "1515961745414557896",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
  assert.equal(parsed.allowDelivery, true);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.testingChannelId, "1515961745414557896");
});

test("response delivery live canary previews without sending", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryLiveCanary({
    content: "computa music status",
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.testingOnly, true);
  assert.equal(result.deliveryGuard.allowedMentionsDisabled, true);
});

test("response delivery live canary sends only when double guarded", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshResponseDeliveryLiveCanary({
    content: "computa music status",
    live: true,
    apply: true,
    allowDelivery: true,
    testingChannelId: "1515961745414557896",
    env: {
      DISCORDOS_MUSIC_SESH_RESPONSE_LIVE_CANARY: "enabled",
      DISCORDOS_MUSIC_SESH_RESPONSE_DELIVERY: "enabled",
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (init.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "message-1",
            channel_id: "1515961745414557896",
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: "Music Sesh status: no active session is unknown; 0 queued; 0 votes. No latest queue item yet.",
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, true);
  assert.equal(result.callsDiscordApi, true);
  assert.equal(result.delivery.readbackOk, true);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].init.body).allowed_mentions.parse.length, 0);
});
