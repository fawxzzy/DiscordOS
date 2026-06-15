const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-policy");

test("music sesh response delivery rate-limit policy builds safe per-channel read model", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitPolicy();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.policy.scope, "per_channel");
  assert.equal(result.policy.maxResponses, 3);
  assert.equal(result.policy.allowedMentionsDisabled, true);
});

test("music sesh response delivery rate-limit policy rejects unsafe bounds", () => {
  const reasonCodes = _internals.validateRateLimitPolicy({
    liveReadback: {
      reasonCodes: [],
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
    policy: {
      targetChannelId: "channel-1",
      allowedMentionsDisabled: true,
      noUnsafeMentions: true,
      slashCommandsAdmitted: false,
      windowSeconds: 5,
      maxResponses: 0,
    },
  });

  assert(reasonCodes.includes("music_sesh_response_rate_limit_bounds_invalid"));
});
