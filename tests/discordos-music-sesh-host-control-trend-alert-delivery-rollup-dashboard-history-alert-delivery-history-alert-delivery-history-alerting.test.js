const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alerting");

test("host control nested alert delivery history alerting preserves route boundaries", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.alerting.alertRequired, false);
  assert.equal(result.alerting.alertStatus, "not_required");
  assert.equal(result.alerting.routesVisible, true);
});

test("host control nested alert delivery history alerting rejects runtime drift", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting({
    historyResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: true,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    alerting: {
      historyStatus: "bounded_ready",
      repeatedPatternVisible: true,
      recordCount: 1,
      alertRequired: false,
      alertStatus: "not_required",
      routesVisible: true,
      alertLevelsVisible: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      noProviderBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      sendsMessagesInAlerting: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alerting_runtime_boundary_failed"));
});
