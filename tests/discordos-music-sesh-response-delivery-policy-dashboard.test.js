const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-policy-dashboard");

test("response delivery policy dashboard summarizes preview-only delivery", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryPolicyDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.dashboard.testingOnly, true);
  assert.equal(result.dashboard.allowedMentionsDisabled, true);
  assert.equal(result.dashboard.noUnsafeMentions, true);
  assert.equal(result.slashCommandsAdmitted, false);
});

test("response delivery policy dashboard blocks unsafe mention policy", () => {
  const reasonCodes = _internals.validateDeliveryPolicyDashboard({
    canary: {
      reasonCodes: [],
      controlsPlayback: false,
      callsMusicProviders: false,
      slashCommandsAdmitted: false,
    },
    dashboard: {
      testingOnly: true,
      allowedMentionsDisabled: false,
      noUnsafeMentions: false,
    },
  });

  assert(reasonCodes.includes("response_delivery_policy_mentions_not_disabled"));
  assert(reasonCodes.includes("response_delivery_policy_unsafe_mentions"));
});
