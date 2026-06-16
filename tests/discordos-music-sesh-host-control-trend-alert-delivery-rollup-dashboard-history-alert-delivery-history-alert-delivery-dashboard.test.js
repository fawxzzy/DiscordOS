const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-dashboard");

test("host control nested alert delivery dashboard summarizes readback safely", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.statusLine, "ready");
  assert.equal(result.dashboard.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.dashboard.routesVisible, true);
});

test("host control nested alert delivery dashboard rejects send drift", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistoryAlertDeliveryDashboard({
    readbackResult: {
      reasonCodes: [],
      sendsMessages: true,
      callsDiscordApi: false,
      controlsPlayback: false,
      callsMusicProviders: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    dashboard: {
      statusLine: "ready",
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
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      sendsMessagesInDashboard: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_dashboard_send_boundary_failed"));
});
