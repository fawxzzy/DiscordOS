const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-live-apply-reconciliation");

test("host control live apply reconciliation is ready in preview mode", async () => {
  const result = await _internals.buildMusicSeshHostControlLiveApplyReconciliation();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.reconciliation.dashboardReflectsReadback, true);
});

test("host control live apply reconciliation requires readback for storage execution", () => {
  const reasonCodes = _internals.validateHostControlApplyReconciliation({
    dashboardResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
      executesStorageWrite: true,
      liveAttempted: false,
    },
    reconciliation: {
      dashboardReflectsReadback: true,
    },
  });

  assert(reasonCodes.includes("host_control_live_apply_reconciliation_readback_not_attempted"));
});
