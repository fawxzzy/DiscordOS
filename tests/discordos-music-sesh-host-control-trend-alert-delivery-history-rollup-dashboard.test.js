const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-history-rollup-dashboard");

test("host control trend alert delivery history rollup dashboard makes no-send trends scannable", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryHistoryRollupDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.statusLine, "ready");
  assert.equal(result.dashboard.rollupStatus, "rollup_ready");
  assert.equal(result.dashboard.routeCount, 1);
  assert.equal(result.dashboard.alertLevelCount, 1);
  assert.equal(result.dashboard.noSendBoundaryConfirmed, true);
});

test("host control trend alert delivery history rollup dashboard rejects hidden route trends", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryRollupDashboard({
    rollupResult: {
      reasonCodes: [],
      sendsMessages: false,
      controlsPlayback: false,
      callsMusicProviders: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    dashboard: {
      statusLine: "ready",
      rollupStatus: "rollup_ready",
      routesVisible: false,
      alertLevelsVisible: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      noProviderBoundaryConfirmed: true,
      sendsMessagesInDashboard: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_rollup_dashboard_visibility_missing"));
});
