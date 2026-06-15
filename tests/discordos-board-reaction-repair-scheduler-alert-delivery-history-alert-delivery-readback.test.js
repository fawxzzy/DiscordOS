const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-readback");

test("board reaction scheduler history alert delivery readback confirms guarded no-send admission", async () => {
  const result = await _internals.buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.readback.customReactionGuardsPreserved, true);
  assert.equal(result.readback.noSendBoundaryConfirmed, true);
});

test("board reaction scheduler history alert delivery readback rejects guard loss", () => {
  const reasonCodes = _internals.validateSchedulerHistoryAlertDeliveryReadback({
    canaryResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    readback: {
      deliveryAdmissionStatus: "no_alert_to_deliver",
      alertRequired: false,
      customReactionGuardsPreserved: false,
      readbackRequired: true,
      skippedAlignedNoise: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("board_reaction_scheduler_history_alert_delivery_readback_guard_boundary_failed"));
});
