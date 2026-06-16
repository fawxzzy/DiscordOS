const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting");

test("rate-limit nested alert delivery alerting preserves privacy boundaries", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.alerting.alertRequired, false);
  assert.equal(result.alerting.alertStatus, "not_required");
  assert.equal(result.alerting.userContentHidden, true);
});

test("rate-limit nested alert delivery alerting rejects privacy drift", () => {
  const reasonCodes = _internals.validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting({
    historyResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    alerting: {
      historyStatus: "bounded_ready",
      repeatedPatternVisible: true,
      recordCount: 1,
      alertRequired: false,
      alertStatus: "not_required",
      deliveryDecisionVisible: true,
      userContentHidden: false,
      mentionSafetyPreserved: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      sendsMessagesInAlerting: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_visibility_failed"));
});
