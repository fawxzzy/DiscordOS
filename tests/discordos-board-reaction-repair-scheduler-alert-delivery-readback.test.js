const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-scheduler-alert-delivery-readback");

test("board reaction repair scheduler alert delivery readback confirms guarded no-send decision", async () => {
  const result = await _internals.buildBoardReactionRepairSchedulerAlertDeliveryReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.deliveryDecisionVisible, true);
  assert.equal(result.readback.customReactionGuardsPreserved, true);
  assert.equal(result.readback.readbackRequired, true);
  assert.equal(result.readback.noSendBoundaryConfirmed, true);
});

test("board reaction repair scheduler alert delivery readback rejects missing guards", () => {
  const reasonCodes = _internals.validateSchedulerAlertDeliveryReadback({
    canaryResult: { reasonCodes: [], slashCommandsAdmitted: false },
    readback: {
      deliveryDecisionVisible: true,
      routeIdentityVisible: true,
      customReactionGuardsPreserved: false,
      readbackRequired: true,
      noSendBoundaryConfirmed: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("board_reaction_scheduler_alert_delivery_readback_guard_missing"));
});
