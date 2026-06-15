const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-dashboard");

test("host control trend alert delivery dashboard summarizes readback safely", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.operatorScanReady, true);
  assert.equal(result.dashboard.noSendBoundaryConfirmed, true);
});

test("host control trend alert delivery dashboard rejects missing visibility", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryDashboard({
    readbackResult: { reasonCodes: [], slashCommandsAdmitted: false },
    dashboard: {
      deliveryDecisionVisible: false,
      routeIdentityVisible: true,
      operatorScanReady: true,
      noSendBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      noProviderBoundaryConfirmed: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_dashboard_visibility_missing"));
});
