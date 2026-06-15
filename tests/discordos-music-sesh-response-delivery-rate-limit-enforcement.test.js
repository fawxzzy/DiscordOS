const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-enforcement");

test("music sesh response rate-limit enforcement allows under limit", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitEnforcement();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.enforcement.decision, "allow");
  assert.equal(result.enforcement.remainingResponses, 1);
  assert.equal(result.enforcement.mentionSafetyPreserved, true);
});

test("music sesh response rate-limit enforcement throttles at limit", () => {
  const decision = _internals.buildRateLimitEnforcementDecision({
    observedResponseCount: 3,
    policy: {
      targetChannelId: "1516089950787862689",
      maxResponses: 3,
      windowSeconds: 60,
      allowedMentionsDisabled: true,
      noUnsafeMentions: true,
    },
  });

  assert.equal(decision.decision, "throttle");
  assert.equal(decision.admitted, false);
  assert.equal(decision.remainingResponses, 0);
});
