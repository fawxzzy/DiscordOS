const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-canary");

test("board reaction scheduler history alert delivery canary preserves guarded no-send admission", async () => {
  const result = await _internals.buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.canary.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.canary.customReactionGuardsPreserved, true);
  assert.equal(result.canary.readbackRequired, true);
});

test("board reaction scheduler history alert delivery canary rejects guard loss", () => {
  const reasonCodes = _internals.validateSchedulerHistoryAlertDeliveryCanary({
    alertingResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    canary: {
      deliveryAdmissionStatus: "no_alert_to_deliver",
      alertRequired: false,
      customReactionGuardsPreserved: false,
      readbackRequired: true,
      skippedAlignedNoise: true,
      noSendBoundaryConfirmed: true,
      deliveryDecisionVisible: true,
      sendsMessagesInCanary: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("board_reaction_scheduler_history_alert_delivery_canary_guard_boundary_failed"));
});
