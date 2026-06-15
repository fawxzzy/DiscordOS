const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-history-trend-alerts");

test("host control history trend alerts summarize clear history safely", async () => {
  const result = await _internals.buildMusicSeshHostControlHistoryTrendAlerts();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.trend.alertLevel, "clear");
  assert.equal(result.trend.recordCount, 1);
});

test("host control history trend alerts detect repeated conflict trend", () => {
  const trend = _internals.buildTrendAlertSummary({
    history: [
      { modeledConflictCount: 1, readbackAttemptCount: 1, alignedReadbackCount: 1 },
      { modeledConflictCount: 2, readbackAttemptCount: 1, alignedReadbackCount: 1 },
    ],
  });

  assert.equal(trend.repeatedConflict, true);
  assert.equal(trend.attentionRequired, true);
  assert.equal(trend.alertLevel, "watch");
});
