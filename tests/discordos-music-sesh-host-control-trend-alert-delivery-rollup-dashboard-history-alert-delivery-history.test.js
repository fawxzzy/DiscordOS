const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history");

test("host control rollup dashboard history alert delivery history tracks guarded dashboard records", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistory();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.history.historyStatus, "bounded_ready");
  assert.equal(result.history.recordCount, 1);
  assert.equal(result.history.records[0].routesVisible, true);
  assert.equal(result.history.records[0].noProviderBoundaryConfirmed, true);
});

test("host control rollup dashboard history alert delivery history rejects runtime drift", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryRollupDashboardHistoryAlertDeliveryHistory({
    dashboardResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      controlsPlayback: true,
      callsMusicProviders: true,
      slashCommandsAdmitted: false,
    },
    history: {
      historyStatus: "bounded_ready",
      recordCount: 1,
      maxRecords: 10,
      repeatsTracked: true,
      records: [
        {
          statusLine: "ready",
          routesVisible: true,
          alertLevelsVisible: true,
          deliveryDecisionVisible: true,
          noSendBoundaryConfirmed: true,
          noPlaybackBoundaryConfirmed: true,
          noProviderBoundaryConfirmed: true,
          noDiscordApiBoundaryConfirmed: true,
          noStorageWriteBoundaryConfirmed: true,
        },
      ],
      sendsMessagesInHistory: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_runtime_boundary_failed"));
});
