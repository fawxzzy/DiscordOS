const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-scheduler-alert-delivery-history");

test("board reaction repair scheduler alert delivery history tracks guarded records", async () => {
  const result = await _internals.buildBoardReactionRepairSchedulerAlertDeliveryHistory();

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

test("board reaction repair scheduler alert delivery history rejects missing guards", () => {
  const reasonCodes = _internals.validateSchedulerAlertDeliveryHistory({
    dashboardResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      slashCommandsAdmitted: false,
    },
    history: {
      historyStatus: "bounded_ready",
      recordCount: 1,
      maxRecords: 10,
      records: [
        {
          customReactionGuardsPreserved: false,
          readbackRequired: true,
          skippedAlignedNoise: true,
          noSendBoundaryConfirmed: true,
        },
      ],
      repeatsTracked: true,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("board_reaction_scheduler_alert_delivery_history_record_invalid"));
});
