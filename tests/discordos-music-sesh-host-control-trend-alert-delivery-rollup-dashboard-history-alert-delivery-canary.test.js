const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-canary");

test("host control rollup dashboard history alert delivery canary preserves no-send runtime boundaries", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.canary.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.canary.noPlaybackBoundaryConfirmed, true);
  assert.equal(result.canary.noProviderBoundaryConfirmed, true);
});

test("host control rollup dashboard history alert delivery canary rejects playback drift", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryCanary({
    alertingResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      controlsPlayback: true,
      callsMusicProviders: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    canary: {
      deliveryAdmissionStatus: "no_alert_to_deliver",
      alertRequired: false,
      alertStatus: "not_required",
      historyStatus: "bounded_ready",
      routesVisible: true,
      alertLevelsVisible: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      noProviderBoundaryConfirmed: true,
      sendsMessagesInCanary: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_canary_runtime_boundary_failed"));
});
