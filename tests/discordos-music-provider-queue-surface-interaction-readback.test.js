const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-surface-interaction-readback");

test("provider queue surface interaction readback maps button to metadata only", async () => {
  const result = await _internals.buildMusicProviderQueueSurfaceInteractionReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.mapsToQueueMetadata, true);
  assert.equal(result.readback.queuesMetadataOnly, true);
});

test("provider queue surface interaction readback blocks playback control", () => {
  const reasonCodes = _internals.validateInteractionReadback({
    publishResult: {
      reasonCodes: [],
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
    readback: {
      mapsToQueueMetadata: true,
      queuesMetadataOnly: false,
      controlsPlayback: true,
      callsMusicProviders: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_readback_not_metadata_only"));
});
