const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-observability");

test("music sesh rate-limit observability summarizes allow decision without content", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitObservability();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.observability.decision, "allow");
  assert.equal(result.observability.userContentExposed, false);
  assert.equal(result.observability.operatorStatus, "ready");
});

test("music sesh rate-limit observability marks throttle as attention", () => {
  const observability = _internals.buildRateLimitObservability({
    enforcement: {
      targetChannelId: "1516089950787862689",
      decision: "throttle",
      admitted: false,
      remainingResponses: 0,
      maxResponses: 3,
      windowSeconds: 60,
      mentionSafetyPreserved: true,
    },
  });

  assert.equal(observability.operatorStatus, "attention_required");
  assert.equal(observability.userContentExposed, false);
});
