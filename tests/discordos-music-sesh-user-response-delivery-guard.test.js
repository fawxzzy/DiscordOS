const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-user-response-delivery-guard");

const VALID_INPUT = {
  content: "computa music status",
  sessionId: "music-sesh-response-delivery",
  guildId: "1504668396338413670",
  channelId: "1508139160853286942",
  actorDiscordUserId: "1515220075366580224",
};

test("music sesh user response delivery guard parses guarded args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--content",
    "computa music status",
    "--allow-delivery",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.content, "computa music status");
  assert.equal(parsed.allowDelivery, true);
});

test("music sesh user response delivery guard previews no-mention status responses", async () => {
  const result = await _internals.buildMusicSeshUserResponseDeliveryGuard({
    ...VALID_INPUT,
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.deliveryDecision.status, "preview_only");
  assert.equal(result.payloadValidation.allowedMentionsDisabled, true);
  assert.equal(result.payloadValidation.noUnsafeMentions, true);
  assert.match(result.userResponse.content, /Music Sesh status:/);
});

test("music sesh user response delivery guard admits only double-guarded delivery", async () => {
  const blocked = await _internals.buildMusicSeshUserResponseDeliveryGuard({
    ...VALID_INPUT,
    allowDelivery: true,
    env: {},
  });
  const admitted = await _internals.buildMusicSeshUserResponseDeliveryGuard({
    ...VALID_INPUT,
    allowDelivery: true,
    env: {
      DISCORDOS_MUSIC_SESH_RESPONSE_DELIVERY: "enabled",
    },
  });

  assert.equal(blocked.ok, false);
  assert(blocked.reasonCodes.includes("music_sesh_response_delivery_double_guard_missing"));
  assert.equal(admitted.ok, true);
  assert.equal(admitted.deliveryAdmission.admitted, true);
  assert.equal(admitted.deliveryDecision.status, "deliverable");
  assert.equal(admitted.sendsMessages, false);
});

test("music sesh user response delivery guard rejects unsafe response payloads", () => {
  const validation = _internals.validateDeliveryPayload({
    channelId: "not-a-snowflake",
    response: {
      content: "hello @everyone",
      allowedMentionsDisabled: false,
    },
  });

  assert.equal(validation.ok, false);
  assert(validation.reasonCodes.includes("delivery_response_unsafe_mentions"));
  assert(validation.reasonCodes.includes("delivery_mentions_not_disabled"));
  assert(validation.reasonCodes.includes("delivery_channel_id_invalid"));
});
