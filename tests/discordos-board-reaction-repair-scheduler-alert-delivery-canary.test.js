const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-scheduler-alert-delivery-canary");

test("board reaction repair scheduler alert delivery canary skips aligned noise", async () => {
  const result = await _internals.buildBoardReactionRepairSchedulerAlertDeliveryCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.canary.deliveryAdmissionStatus, "not_required");
  assert.equal(result.canary.customReactionGuardsPreserved, true);
  assert.equal(result.canary.readbackRequired, true);
});

test("board reaction repair scheduler alert delivery canary validates routed attention", () => {
  const canary = _internals.buildSchedulerAlertDeliveryCanary({
    attention: {
      needsAttention: true,
      skippedAlignedNoise: false,
    },
    alertRoute: {
      routeStatus: "routed",
      routeId: "board-reaction-drift-critical-alert",
      target: "alerts",
    },
    rollup: {
      customReactionGuardCount: 1,
      readbackRequiredCount: 1,
    },
  });

  assert.equal(canary.alertWouldSend, true);
  assert.equal(canary.deliveryAdmissionStatus, "admitted_no_send");
  assert.equal(canary.sendsMessagesInCanary, false);
});
