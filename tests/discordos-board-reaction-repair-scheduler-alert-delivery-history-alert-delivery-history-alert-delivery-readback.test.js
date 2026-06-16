const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-readback");

test("board scheduler history alert delivery readback preserves custom reaction guards", async () => {
  const result = await _internals.buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.historyStatus, "bounded_ready");
  assert.equal(result.readback.customReactionGuardsPreserved, true);
  assert.equal(result.readback.readbackRequired, true);
  assert.equal(result.readback.skippedAlignedNoise, true);
});

test("board scheduler history alert delivery readback rejects guard drift", () => {
  const reasonCodes = _internals.validateSchedulerHistoryAlertDeliveryHistoryAlertDeliveryReadback({
    canaryResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    readback: {
      deliveryDecisionVisible: true,
      historyStatus: "bounded_ready",
      customReactionGuardsPreserved: false,
      readbackRequired: true,
      skippedAlignedNoise: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      alertRequired: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("board_reaction_scheduler_history_alert_delivery_history_alert_delivery_readback_guard_boundary_failed"));
});
