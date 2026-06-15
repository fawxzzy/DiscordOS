const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-admission-history-alerting");

test("provider queue interaction admission history alerting classifies no-send attention state", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionAdmissionHistoryAlerting();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.alerting.alertStatus, "not_required");
  assert.equal(result.alerting.signatureProofVisible, true);
});

test("provider queue interaction admission history alerting rejects missing signature proof", () => {
  const reasonCodes = _internals.validateProviderQueueAdmissionHistoryAlerting({
    historyResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    alerting: {
      historyStatus: "bounded_ready",
      repeatedPatternVisible: true,
      signatureProofVisible: false,
      providerTrackMetadataVisible: true,
      noProviderBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      sendsMessagesInAlerting: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      alertRequired: false,
      alertStatus: "not_required",
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_admission_history_alerting_metadata_missing"));
});
