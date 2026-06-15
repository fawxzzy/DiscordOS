const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-rollup-history-persistence");

test("host control rollup history persistence retains bounded safe records", async () => {
  const result = await _internals.buildMusicSeshHostControlRollupHistoryPersistence({
    existingRecords: Array.from({ length: 12 }, (_, index) => ({ schemaVersion: 1, capturedAt: `2026-06-14T00:00:${String(index).padStart(2, "0")}.000Z` })),
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.retention.retainedCount, 12);
  assert.equal(result.latest.operatorStatus, "ready");
});

test("host control rollup history persistence rejects unbounded history", () => {
  const reasonCodes = _internals.validateRollupHistoryPersistence({
    rollupResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
    record: { capturedAt: "2026-06-15T00:00:00.000Z" },
    history: Array.from({ length: 13 }, () => ({})),
  });

  assert(reasonCodes.includes("host_control_rollup_history_unbounded"));
});
