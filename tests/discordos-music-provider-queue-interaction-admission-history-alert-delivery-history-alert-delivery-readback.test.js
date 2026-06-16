const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-readback");

test("provider admission history alert delivery readback preserves metadata-only boundaries", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryHistoryAlertDeliveryReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.historyStatus, "bounded_ready");
  assert.equal(result.readback.signatureProofVisible, true);
  assert.equal(result.readback.providerTrackMetadataVisible, true);
});

test("provider admission history alert delivery readback rejects metadata drift", () => {
  const reasonCodes = _internals.validateProviderAdmissionHistoryAlertDeliveryHistoryAlertDeliveryReadback({
    canaryResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    readback: {
      deliveryDecisionVisible: true,
      historyStatus: "bounded_ready",
      signatureProofVisible: false,
      providerTrackMetadataVisible: false,
      noProviderBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      alertRequired: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_readback_metadata_missing"));
});
