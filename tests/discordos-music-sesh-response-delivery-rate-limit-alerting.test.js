const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-alerting");

test("music sesh response delivery rate-limit alerting idles without sending", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitAlerting();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.alerting.alertRequired, false);
  assert.equal(result.alerting.alertStatus, "not_required");
  assert.equal(result.alerting.userContentExposed, false);
});

test("music sesh response delivery rate-limit alerting routes throttle as no-send attention", () => {
  const alerting = _internals.buildRateLimitAlerting({
    sendsMessages: false,
    observability: {
      decision: "throttle",
      operatorStatus: "attention_required",
      targetChannelId: "1516089950787862689",
      remainingResponses: 0,
      maxResponses: 3,
      windowSeconds: 60,
      mentionSafetyPreserved: true,
    },
  });

  assert.equal(alerting.alertRequired, true);
  assert.equal(alerting.alertStatus, "would_route_no_send");
  assert.equal(alerting.sendsMessagesInAlerting, false);
});
