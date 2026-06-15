const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-metadata-contract");

test("music provider metadata contract parses provider args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--provider-action",
    "search",
    "--query",
    "  test   song  ",
    "--result-limit",
    "10",
    "--allow-provider-admission",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.providerAction, "search");
  assert.equal(parsed.query, "test   song");
  assert.equal(parsed.resultLimit, 10);
  assert.equal(parsed.allowProviderAdmission, true);
});

test("music provider metadata contract admits read-only search without playback", () => {
  const result = _internals.buildMusicProviderMetadataContract({
    providerAction: "search",
    query: "Contract Track",
    allowProviderAdmission: true,
    env: {
      DISCORDOS_MUSIC_PROVIDER_ADAPTER: "enabled",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.contract.readOnly, true);
  assert(result.contract.requiredResultFields.includes("providerTrackId"));
});

test("music provider metadata contract blocks playback actions", () => {
  const result = _internals.buildMusicProviderMetadataContract({
    providerAction: "play",
    query: "Contract Track",
    allowProviderAdmission: true,
    env: {
      DISCORDOS_MUSIC_PROVIDER_ADAPTER: "enabled",
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("metadata_contract_only_admits_search"));
});
