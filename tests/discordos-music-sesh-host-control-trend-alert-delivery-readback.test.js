const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-readback");

test("host control trend alert delivery readback confirms no-send delivery decision", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.deliveryDecisionVisible, true);
  assert.equal(result.readback.noSendBoundaryConfirmed, true);
});

test("host control trend alert delivery readback rejects side effect boundaries", () => {
  const reasonCodes = _internals.validateTrendAlertDeliveryReadback({
    canaryResult: { reasonCodes: [], slashCommandsAdmitted: false },
    readback: {
      deliveryDecisionVisible: true,
      routeIdentityVisible: true,
      noSendBoundaryConfirmed: false,
      noPlaybackBoundaryConfirmed: true,
      noProviderBoundaryConfirmed: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("host_control_trend_alert_delivery_readback_boundary_failed"));
});
