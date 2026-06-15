const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-history-rollup");

test("host control trend alert delivery history rollup summarizes bounded no-send records", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryHistoryRollup();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.rollup.rollupStatus, "rollup_ready");
  assert.equal(result.rollup.recordCount, 1);
  assert.equal(result.rollup.noSendBoundaryConfirmed, true);
});

test("host control trend alert delivery history rollup rejects unsafe summaries", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryHistoryRollup({
    historyResult: {
      reasonCodes: [],
      sendsMessages: false,
      controlsPlayback: false,
      callsMusicProviders: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    rollup: {
      rollupStatus: "rollup_ready",
      sourceHistoryStatus: "bounded_ready",
      recordCount: 1,
      maxRecords: 10,
      repeatedPatternSummaryVisible: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: false,
      noPlaybackBoundaryConfirmed: true,
      noProviderBoundaryConfirmed: true,
      sendsMessagesInRollup: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_history_rollup_boundary_failed"));
});
