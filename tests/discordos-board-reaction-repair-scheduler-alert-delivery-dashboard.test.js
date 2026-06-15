const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-scheduler-alert-delivery-dashboard");

test("board reaction repair scheduler alert delivery dashboard summarizes guarded readback", async () => {
  const result = await _internals.buildBoardReactionRepairSchedulerAlertDeliveryDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.operatorScanReady, true);
  assert.equal(result.dashboard.customReactionGuardsPreserved, true);
  assert.equal(result.dashboard.noSendBoundaryConfirmed, true);
});

test("board reaction repair scheduler alert delivery dashboard rejects missing guards", () => {
  const reasonCodes = _internals.validateSchedulerAlertDeliveryDashboard({
    readbackResult: { reasonCodes: [], slashCommandsAdmitted: false },
    dashboard: {
      operatorScanReady: true,
      customReactionGuardsPreserved: false,
      readbackRequired: true,
      noSendBoundaryConfirmed: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("board_reaction_scheduler_alert_delivery_dashboard_visibility_missing"));
});
