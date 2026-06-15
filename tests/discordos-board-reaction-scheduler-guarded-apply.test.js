const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-scheduler-guarded-apply");

test("board reaction scheduler guarded apply idles for aligned cards", async () => {
  const result = await _internals.buildBoardReactionSchedulerGuardedApply();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.plan.driftBacked, false);
  assert.equal(result.plan.skipsAlignedCards, true);
  assert.equal(result.plan.usesCustomReactionGuard, true);
});

test("board reaction scheduler guarded apply applies only when drift backed", () => {
  const plan = _internals.buildGuardedApplyPlan({
    schedulerResult: {
      schedule: {
        driftCount: 1,
        repairPreviewCount: 1,
        admittedCardOnly: true,
        readbackAligned: true,
        cadence: "on_drift_detected",
      },
    },
    apply: true,
  });

  assert.equal(plan.wouldApply, true);
  assert.equal(plan.mode, "guarded_apply_on_drift");
  assert.equal(plan.driftBacked, true);
});
