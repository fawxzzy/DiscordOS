const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard");

test("host control deep delivery dashboard summarizes repeated route visibility", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.statusLine, "ready");
  assert.equal(result.dashboard.repeatedPatternVisible, true);
  assert.equal(result.dashboard.routesVisible, true);
});

test("host control deep delivery dashboard rejects runtime drift", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard({
    readbackResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: true,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    dashboard: {
      statusLine: "ready",
      deliveryAdmissionStatus: "no_alert_to_deliver",
      alertRequired: false,
      alertStatus: "not_required",
      historyStatus: "bounded_ready",
      repeatedPatternVisible: true,
      routesVisible: true,
      alertLevelsVisible: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      noProviderBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      sendsMessagesInDashboard: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard_runtime_boundary_failed"));
});
