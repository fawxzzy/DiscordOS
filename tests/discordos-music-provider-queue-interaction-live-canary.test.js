const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-live-canary");

test("provider queue interaction live canary signs metadata-only interaction", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionLiveCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.canary.liveAttempted, false);
  assert.equal(result.canary.queuesMetadataOnly, true);
  assert.match(result.canary.signedInteractionProof, /^[a-f0-9]{24}$/);
});

test("provider queue interaction live canary rejects provider side effects", () => {
  const reasonCodes = _internals.validateLiveCanary({
    readbackResult: { reasonCodes: [], slashCommandsAdmitted: false },
    canary: {
      customId: "music_sesh:provider_select:track",
      providerTrackId: "track",
      signedInteractionProof: "proof",
      queuesMetadataOnly: false,
      callsMusicProviders: true,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_live_canary_side_effect_boundary_failed"));
});
