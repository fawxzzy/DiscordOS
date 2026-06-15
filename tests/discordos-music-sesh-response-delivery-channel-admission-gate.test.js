const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-channel-admission-gate");

test("response delivery channel admission gate admits testing channel only", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryChannelAdmissionGate({
    testingChannelId: "1515943795999510579",
    channelId: "1515943795999510579",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.admission.admitted, true);
  assert.equal(result.admission.class, "testing");
  assert.equal(result.slashCommandsAdmitted, false);
});

test("response delivery channel admission gate blocks music sesh channel expansion", () => {
  const admission = _internals.classifyResponseChannel({
    channelId: "1508139160853286942",
    musicSeshTarget: {
      channelId: "1508139160853286942",
    },
    testingChannelId: "1515943795999510579",
  });

  assert.equal(admission.admitted, false);
  assert.equal(admission.class, "music_sesh_candidate");
  assert(admission.reasonCodes.includes("response_delivery_music_sesh_channel_requires_explicit_expansion"));
});
