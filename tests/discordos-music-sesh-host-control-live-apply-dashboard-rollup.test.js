const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-live-apply-dashboard-rollup");

test("host control live apply dashboard rollup summarizes preview safely", async () => {
  const result = await _internals.buildMusicSeshHostControlLiveApplyDashboardRollup();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.rollup.operatorStatus, "ready");
  assert.equal(result.rollup.applyAttemptCount, 0);
});

test("host control live apply dashboard rollup requires readback after apply", () => {
  const reasonCodes = _internals.validateHostControlLiveApplyRollup({
    reconciliationResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
    rollup: {
      applyAttemptCount: 1,
      readbackAttemptCount: 0,
      operatorStatus: "ready",
    },
  });

  assert(reasonCodes.includes("host_control_live_apply_rollup_readback_missing"));
});
