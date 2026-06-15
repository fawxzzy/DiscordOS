const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-admission-readback");

test("provider queue interaction admission readback confirms signed metadata-only admission", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionAdmissionReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.admissionStateVisible, true);
  assert.equal(result.readback.providerTrackMetadataVisible, true);
  assert.equal(result.readback.signatureProofVisible, true);
  assert.equal(result.readback.liveExecutionAttempted, false);
});

test("provider queue interaction admission readback rejects missing identity", () => {
  const reasonCodes = _internals.validateProviderQueueAdmissionReadback({
    gateResult: { reasonCodes: [], slashCommandsAdmitted: false },
    readback: {
      admissionStateVisible: true,
      customIdVisible: true,
      providerTrackMetadataVisible: false,
      signatureProofVisible: true,
      queuesMetadataOnly: true,
      liveExecutionAttempted: false,
      noProviderBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_admission_readback_identity_missing"));
});
