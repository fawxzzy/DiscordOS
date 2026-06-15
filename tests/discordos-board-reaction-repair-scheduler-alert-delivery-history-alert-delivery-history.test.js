const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history");

test("board reaction scheduler alert delivery history tracks guarded dashboard states", async () => {
  const result = await _internals.buildBoardReactionRepairSchedulerAlertDeliveryHistoryAlertDeliveryHistory();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.history.historyStatus, "bounded_ready");
  assert.equal(result.history.recordCount, 1);
  assert.equal(result.history.records[0].customReactionGuardsPreserved, true);
  assert.equal(result.history.records[0].noSendBoundaryConfirmed, true);
});

test("board reaction scheduler alert delivery history rejects guard drift", () => {
  const reasonCodes = _internals.validateSchedulerHistoryAlertDeliveryHistory({
    dashboardResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    history: {
      historyStatus: "bounded_ready",
      recordCount: 1,
      maxRecords: 10,
      repeatsTracked: true,
      records: [
        {
          statusLine: "ready",
          deliveryAdmissionStatus: "no_alert_to_deliver",
          alertStatus: "not_required",
          customReactionGuardsPreserved: false,
          readbackRequired: true,
          skippedAlignedNoise: true,
          deliveryDecisionVisible: true,
          noSendBoundaryConfirmed: true,
          noDiscordApiBoundaryConfirmed: true,
          noStorageWriteBoundaryConfirmed: true,
        },
      ],
      sendsMessagesInHistory: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("board_reaction_scheduler_history_alert_delivery_history_record_invalid"));
});
