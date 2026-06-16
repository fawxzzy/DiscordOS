const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback");

test("rate-limit deep delivery readback preserves privacy boundaries", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.readback.userContentHidden, true);
  assert.equal(result.readback.mentionSafetyPreserved, true);
});

test("rate-limit deep delivery readback rejects privacy drift", () => {
  const reasonCodes = _internals.validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback({
    canaryResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    readback: {
      deliveryAdmissionStatus: "no_alert_to_deliver",
      alertRequired: false,
      alertStatus: "not_required",
      historyStatus: "bounded_ready",
      repeatedPatternVisible: true,
      userContentHidden: false,
      mentionSafetyPreserved: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback_privacy_failed"));
});
