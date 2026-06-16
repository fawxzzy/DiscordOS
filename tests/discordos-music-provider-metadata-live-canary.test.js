const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-metadata-live-canary");
const { _internals: apiInternals } = require("../api/music-provider-metadata");

test("provider metadata live canary parses guarded live args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--live",
    "--allow-provider-admission",
    "--allow-live-canary",
    "--query",
    "test song",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
  assert.equal(parsed.allowProviderAdmission, true);
  assert.equal(parsed.allowLiveCanary, true);
  assert.equal(parsed.query, "test song");
});

test("provider metadata live canary is ready without live fetch by default", async () => {
  const result = await _internals.buildMusicProviderMetadataLiveCanary({
    providerAction: "search",
    query: "Contract Track",
    allowProviderAdmission: true,
    env: {
      DISCORDOS_MUSIC_PROVIDER_ADAPTER: "enabled",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.liveAttempted, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.status, "ready_for_provider_metadata_live_canary");
});

test("provider metadata live canary validates guarded sample results", async () => {
  const result = await _internals.buildMusicProviderMetadataLiveCanary({
    live: true,
    providerAction: "search",
    query: "Contract Track",
    allowProviderAdmission: true,
    allowLiveCanary: true,
    env: {
      DISCORDOS_MUSIC_PROVIDER_ADAPTER: "enabled",
      DISCORDOS_MUSIC_PROVIDER_METADATA_CANARY: "enabled",
      DISCORDOS_MUSIC_PROVIDER_METADATA_SAMPLE: JSON.stringify({
        results: [
          {
            providerTrackId: "track-1",
            title: "Track One",
            artistName: "Artist",
            durationMs: 123000,
            sourceUrl: "https://example.com/track-1",
          },
        ],
      }),
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.liveAttempted, true);
  assert.equal(result.callsMusicProviders, true);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.liveResult.normalizedResults[0].providerTrackId, "track-1");
});

test("provider metadata live canary resolves the default production endpoint when no url override is configured", async () => {
  const calls = [];
  const result = await _internals.buildMusicProviderMetadataLiveCanary({
    live: true,
    providerAction: "search",
    query: "Contract Track",
    allowProviderAdmission: true,
    allowLiveCanary: true,
    env: {
      DISCORDOS_MUSIC_PROVIDER_ADAPTER: "enabled",
      DISCORDOS_MUSIC_PROVIDER_METADATA_CANARY: "enabled",
    },
    fetchImpl: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          results: [
            {
              providerTrackId: "track-1",
              title: "Track One",
              artistName: "Artist",
              durationMs: 123000,
              sourceUrl: "https://example.com/track-1",
            },
          ],
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0], `${_internals.DEFAULT_CANARY_BASE_URL}${_internals.DEFAULT_CANARY_PATH}`);
  assert.equal(result.liveResult.canaryUrl, calls[0]);
});

test("provider metadata live canary blocks playback action", async () => {
  const result = await _internals.buildMusicProviderMetadataLiveCanary({
    live: true,
    providerAction: "play",
    query: "Contract Track",
    allowProviderAdmission: true,
    allowLiveCanary: true,
    env: {
      DISCORDOS_MUSIC_PROVIDER_ADAPTER: "enabled",
      DISCORDOS_MUSIC_PROVIDER_METADATA_CANARY: "enabled",
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("metadata_contract_only_admits_search"));
});

test("music provider metadata api returns fallback preview results for read-only search", () => {
  const response = apiInternals.buildMusicProviderMetadataResponse({
    method: "POST",
    body: {
      action: "search",
      query: "Music Sesh Live Canary",
      limit: 2,
    },
    env: {
      DISCORDOS_MUSIC_PROVIDER_ADAPTER: "enabled",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.readOnly, true);
  assert.equal(response.payload.controlsPlayback, false);
  assert.equal(response.payload.callsMusicProviders, false);
  assert.equal(response.payload.source, "fallback_preview");
  assert.equal(response.payload.results.length, 2);
  assert.equal(response.payload.results[0].providerTrackId, "music-sesh-live-canary-track-1");
});

test("music provider metadata api rejects non-search actions", () => {
  const response = apiInternals.buildMusicProviderMetadataResponse({
    method: "POST",
    body: {
      action: "play",
      query: "Music Sesh Live Canary",
    },
    env: {
      DISCORDOS_MUSIC_PROVIDER_ADAPTER: "enabled",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.ok, false);
  assert(response.payload.reasonCodes.includes("metadata_contract_only_admits_search"));
});
