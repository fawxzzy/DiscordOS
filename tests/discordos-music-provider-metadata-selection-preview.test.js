const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-metadata-selection-preview");

test("provider metadata selection preview maps normalized result", () => {
  const preview = _internals.buildQueuePreviewFromProviderResult({
    providerTrackId: "track-1",
    title: "Song",
    artistName: "Artist",
    durationMs: 120000,
    sourceUrl: "https://example.test/song",
  });

  assert.equal(preview.userFacingLabel, "Song - Artist");
  assert.equal(preview.selectableByButton, true);
  assert.equal(preview.controlsPlayback, false);
  assert.equal(preview.slashCommandsAdmitted, false);
});

test("provider metadata selection preview builds fallback preview without playback", async () => {
  const result = await _internals.buildMusicProviderMetadataSelectionPreview({
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.queuePreviewCount, 1);
});

test("provider metadata selection preview uses guarded sample results", async () => {
  const result = await _internals.buildMusicProviderMetadataSelectionPreview({
    live: true,
    allowProviderAdmission: true,
    allowLiveCanary: true,
    env: {
      DISCORDOS_MUSIC_PROVIDER_ADAPTER: "enabled",
      DISCORDOS_MUSIC_PROVIDER_METADATA_CANARY: "enabled",
      DISCORDOS_MUSIC_PROVIDER_METADATA_SAMPLE: JSON.stringify({
        results: [{ id: "provider-1", title: "Sample Track", artist: "Sample Artist" }],
      }),
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.liveAttempted, true);
  assert.equal(result.queuePreviews[0].providerTrackId, "provider-1");
  assert.equal(result.queuePreviews[0].userFacingLabel, "Sample Track - Sample Artist");
});
