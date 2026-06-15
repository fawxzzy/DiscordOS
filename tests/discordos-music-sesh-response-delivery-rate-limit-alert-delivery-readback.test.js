const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-alert-delivery-readback");

test("music sesh rate-limit alert delivery readback confirms canary boundaries", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.deliveryDecisionVisible, true);
  assert.equal(result.readback.noSendBoundaryConfirmed, true);
  assert.equal(result.readback.noDiscordApiBoundaryConfirmed, true);
  assert.equal(result.readback.userContentExposed, false);
});

test("music sesh rate-limit alert delivery readback rejects content exposure", () => {
  const reasonCodes = _internals.validateRateLimitAlertDeliveryReadback({
    canaryResult: { reasonCodes: [], slashCommandsAdmitted: false },
    readback: {
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      userContentExposed: true,
      mentionSafetyPreserved: true,
      alertRequired: false,
      deliveryAdmissionStatus: "not_required",
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("music_sesh_rate_limit_alert_delivery_readback_privacy_boundary_failed"));
});
