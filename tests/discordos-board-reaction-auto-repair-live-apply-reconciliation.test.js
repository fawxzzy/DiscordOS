const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-auto-repair-live-apply-reconciliation");

test("board reaction auto repair live apply reconciliation previews safely", async () => {
  const result = await _internals.buildBoardReactionAutoRepairLiveApplyReconciliation();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.reconciliation.readbackAligned, true);
});

test("board reaction auto repair live apply reconciliation blocks unaligned readback", () => {
  const reasonCodes = _internals.validateLiveApplyReconciliation({
    autoRepair: {
      reasonCodes: [],
      sendsMessages: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
      applyRequested: true,
    },
    reconciliation: {
      liveAttempted: true,
      readbackAligned: false,
    },
  });

  assert(reasonCodes.includes("board_reaction_auto_repair_live_apply_readback_not_aligned"));
});
