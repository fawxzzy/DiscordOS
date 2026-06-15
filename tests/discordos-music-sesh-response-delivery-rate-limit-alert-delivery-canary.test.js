const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-alert-delivery-canary");

test("music sesh rate-limit alert delivery canary idles without sending", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.canary.deliveryAdmissionStatus, "not_required");
  assert.equal(result.canary.userContentExposed, false);
});

test("music sesh rate-limit alert delivery canary admits throttle attention without sending", () => {
  const canary = _internals.buildRateLimitAlertDeliveryCanary({
    sendsMessages: false,
    callsDiscordApi: false,
    alerting: {
      alertRequired: true,
      alertStatus: "would_route_no_send",
      decision: "throttle",
      targetChannelId: "1516089950787862689",
      mentionSafetyPreserved: true,
    },
  });

  assert.equal(canary.deliveryAdmissionStatus, "admitted_no_send");
  assert.equal(canary.sendsMessagesInCanary, false);
  assert.equal(canary.callsDiscordApi, false);
});
