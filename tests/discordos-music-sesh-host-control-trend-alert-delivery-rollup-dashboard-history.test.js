const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history");

test("host control trend alert delivery rollup dashboard history tracks bounded dashboard states", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryRollupDashboardHistory();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.history.historyStatus, "bounded_ready");
  assert.equal(result.history.recordCount, 1);
  assert.equal(result.history.records[0].rollupStatus, "rollup_ready");
  assert.equal(result.history.records[0].noSendBoundaryConfirmed, true);
});

test("host control trend alert delivery rollup dashboard history rejects invalid records", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryRollupDashboardHistory({
    dashboardResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      controlsPlayback: false,
      callsMusicProviders: false,
      executesStorageWrite: false,
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
          rollupStatus: "rollup_ready",
          routesVisible: true,
          alertLevelsVisible: false,
          deliveryDecisionVisible: true,
          noSendBoundaryConfirmed: true,
          noPlaybackBoundaryConfirmed: true,
          noProviderBoundaryConfirmed: true,
        },
      ],
      sendsMessagesInHistory: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_rollup_dashboard_history_record_invalid"));
});
