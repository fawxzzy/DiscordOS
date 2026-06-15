const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-history");

test("host control trend alert delivery history tracks bounded no-send records", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryHistory();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.history.historyStatus, "bounded_ready");
  assert.equal(result.history.recordCount, 1);
  assert.equal(result.history.records[0].noSendBoundaryConfirmed, true);
});

test("host control trend alert delivery history rejects unsafe records", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryHistory({
    dashboardResult: {
      reasonCodes: [],
      sendsMessages: false,
      controlsPlayback: false,
      callsMusicProviders: false,
      slashCommandsAdmitted: false,
    },
    history: {
      historyStatus: "bounded_ready",
      recordCount: 1,
      maxRecords: 10,
      records: [
        {
          deliveryDecisionVisible: true,
          routeIdentityVisible: true,
          noSendBoundaryConfirmed: false,
          noPlaybackBoundaryConfirmed: true,
          noProviderBoundaryConfirmed: true,
        },
      ],
      repeatsTracked: true,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_history_record_invalid"));
});
