const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alerting");

test("rate-limit alert delivery history alerting classifies private history without sending", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlerting();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.alerting.historyStatus, "bounded_ready");
  assert.equal(result.alerting.repeatedPatternVisible, true);
  assert.equal(result.alerting.userContentHidden, true);
  assert.equal(result.alerting.mentionSafetyPreserved, true);
});

test("rate-limit alert delivery history alerting rejects privacy drift", () => {
  const reasonCodes = _internals.validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlerting({
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
      deliveryDecisionVisible: true,
      userContentHidden: false,
      mentionSafetyPreserved: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      sendsMessagesInAlerting: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      alertRequired: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alerting_visibility_failed"));
});
