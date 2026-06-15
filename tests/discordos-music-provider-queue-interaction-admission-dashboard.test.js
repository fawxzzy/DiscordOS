const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-admission-dashboard");

test("provider queue interaction admission dashboard summarizes metadata-only safety", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionAdmissionDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.operatorScanReady, true);
  assert.equal(result.dashboard.queuesMetadataOnly, true);
  assert.equal(result.dashboard.liveExecutionAttempted, false);
});

test("provider queue interaction admission dashboard rejects provider boundaries", () => {
  const reasonCodes = _internals.validateProviderQueueAdmissionDashboard({
    readbackResult: { reasonCodes: [], slashCommandsAdmitted: false },
    dashboard: {
      customIdVisible: true,
      providerTrackMetadataVisible: true,
      signatureProofVisible: true,
      operatorScanReady: true,
      queuesMetadataOnly: true,
      liveExecutionAttempted: false,
      noProviderBoundaryConfirmed: false,
      noPlaybackBoundaryConfirmed: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_admission_dashboard_boundary_failed"));
});
