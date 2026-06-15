const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-repair-scheduler-rollup-alerts");

test("board reaction repair scheduler rollup alerts skip aligned-card noise", async () => {
  const result = await _internals.buildBoardReactionRepairSchedulerRollupAlerts();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.attention.needsAttention, false);
  assert.equal(result.attention.skippedAlignedNoise, true);
  assert.equal(result.alertRoute.routeStatus, "not_required");
});

test("board reaction repair scheduler rollup alerts classify repair attempts as attention", () => {
  const attention = _internals.classifyRollupAttention({
    repairAttemptCount: 1,
    skippedAlignedCardCount: 0,
    driftBackedRepairCount: 1,
    readbackRequiredCount: 1,
    customReactionGuardCount: 1,
    operatorStatus: "ready",
  });

  assert.equal(attention.needsAttention, true);
  assert.equal(attention.severity, "critical");
  assert.equal(attention.skippedAlignedNoise, false);
});
