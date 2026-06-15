const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-drift-scheduler");

test("board reaction repair drift scheduler idles when board is aligned", async () => {
  const result = await _internals.buildBoardReactionRepairDriftScheduler();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.schedule.shouldSchedule, false);
  assert.equal(result.schedule.cadence, "idle_until_drift");
  assert.equal(result.schedule.admittedCardOnly, true);
});

test("board reaction repair drift scheduler schedules on drift", () => {
  const schedule = _internals.buildDriftRepairSchedule({
    reconciliation: {
      driftCount: 1,
      repairPreviewCount: 1,
      appliedCount: 0,
      readbackAligned: true,
    },
  });

  assert.equal(schedule.shouldSchedule, true);
  assert.equal(schedule.cadence, "on_drift_detected");
});
