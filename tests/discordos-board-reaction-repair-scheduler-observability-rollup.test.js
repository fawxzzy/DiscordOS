const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-scheduler-observability-rollup");

test("board reaction repair scheduler observability rollup summarizes guarded idle state", async () => {
  const result = await _internals.buildBoardReactionRepairSchedulerObservabilityRollup();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.rollup.operatorStatus, "ready");
  assert.equal(result.rollup.skippedAlignedCardCount, 1);
  assert.equal(result.rollup.customReactionGuardCount, 1);
});

test("board reaction repair scheduler observability rollup requires guard/readback", () => {
  const reasonCodes = _internals.validateSchedulerObservabilityRollup({
    guardedResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
    rollup: {
      readbackRequiredCount: 0,
      customReactionGuardCount: 1,
      operatorStatus: "ready",
    },
  });

  assert(reasonCodes.includes("board_reaction_scheduler_observability_guard_missing"));
});
