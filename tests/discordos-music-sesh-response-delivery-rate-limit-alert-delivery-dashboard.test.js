const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-alert-delivery-dashboard");

test("rate-limit alert delivery dashboard makes no-send readback scan-ready", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.statusLine, "ready");
  assert.equal(result.dashboard.noSendBoundaryConfirmed, true);
  assert.equal(result.dashboard.userContentHidden, true);
});

test("rate-limit alert delivery dashboard rejects user content exposure", () => {
  const reasonCodes = _internals.validateRateLimitAlertDeliveryDashboard({
    readbackResult: {
      reasonCodes: [],
      slashCommandsAdmitted: false,
    },
    dashboard: {
      statusLine: "ready",
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      sendsMessagesInDashboard: false,
      callsDiscordApi: false,
      userContentHidden: false,
      mentionSafetyPreserved: true,
      alertRequired: false,
      deliveryAdmissionStatus: "no_alert_to_deliver",
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("music_sesh_rate_limit_alert_delivery_dashboard_privacy_boundary_failed"));
});
