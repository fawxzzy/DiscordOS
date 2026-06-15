const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-non-testing-canary");

test("music sesh response delivery non-testing canary admits explicit no-send candidate", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryNonTestingCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.plan.admitted, true);
  assert.equal(result.plan.class, "music_sesh_explicit_non_testing");
  assert.equal(result.plan.requiresReadback, true);
});

test("music sesh response delivery non-testing canary blocks without explicit admission", () => {
  const reasonCodes = _internals.validateNonTestingCanary({
    gate: {
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
    plan: {
      candidate: true,
      admitted: false,
      allowedMentionsDisabled: true,
      noUnsafeMentions: true,
    },
  });

  assert(reasonCodes.includes("music_sesh_response_non_testing_not_explicitly_admitted"));
});
