const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard");

test("rate-limit nested history alert delivery dashboard keeps user content hidden", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.statusLine, "ready");
  assert.equal(result.dashboard.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.dashboard.userContentHidden, true);
});

test("rate-limit nested history alert delivery dashboard rejects privacy drift", () => {
  const reasonCodes = _internals.validateRateLimitAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard({
    readbackResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    dashboard: {
      statusLine: "ready",
      deliveryAdmissionStatus: "no_alert_to_deliver",
      alertRequired: false,
      alertStatus: "not_required",
      historyStatus: "bounded_ready",
      userContentHidden: false,
      mentionSafetyPreserved: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      sendsMessagesInDashboard: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("music_sesh_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard_privacy_failed"));
});
