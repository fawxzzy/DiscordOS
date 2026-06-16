const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary");

test("rate-limit nested alert delivery canary preserves privacy boundaries", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.canary.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.canary.userContentHidden, true);
  assert.equal(result.canary.mentionSafetyPreserved, true);
});

test("rate-limit nested alert delivery canary rejects privacy drift", () => {
  const reasonCodes = _internals.validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryCanary({
    alertingResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    canary: {
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
      sendsMessagesInCanary: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary_privacy_failed"));
});
