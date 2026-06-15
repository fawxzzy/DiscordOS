const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-non-testing-response-live-readback");

test("music sesh non-testing response live readback defaults to guarded preview", async () => {
  const result = await _internals.buildMusicSeshNonTestingResponseLiveReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.plan.admitted, true);
  assert.equal(result.plan.allowedMentionsDisabled, true);
});

test("music sesh non-testing response live readback requires double guard to send", async () => {
  const result = await _internals.buildMusicSeshNonTestingResponseLiveReadback({
    live: true,
    confirmNonTesting: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, true);
  assert.equal(result.callsDiscordApi, true);
  assert.equal(result.plan.mode, "guarded_live_non_testing_readback");
  assert.equal(result.controlsPlayback, false);
});
