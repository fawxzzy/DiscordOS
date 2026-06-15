const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-delivery-canary");

test("host control trend alert delivery canary idles when no alert is required", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertDeliveryCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.canary.deliveryAdmissionStatus, "not_required");
  assert.equal(result.canary.alertWouldSend, false);
});

test("host control trend alert delivery canary validates routed attention", () => {
  const canary = _internals.buildTrendAlertDeliveryCanary({
    trend: { alertLevel: "watch" },
    routing: {
      attentionRequired: true,
      routeStatus: "routed",
      routeId: "product-workflow-monitor-critical-alert",
      target: "alerts",
    },
  });

  assert.equal(canary.alertWouldSend, true);
  assert.equal(canary.deliveryAdmissionStatus, "admitted_no_send");
  assert.equal(canary.sendsMessagesInCanary, false);
});
