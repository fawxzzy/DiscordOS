const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-admission-history-alert-delivery-readback");

test("provider queue interaction admission history alert delivery readback preserves metadata-only boundaries", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.readback.signatureProofVisible, true);
  assert.equal(result.readback.noProviderBoundaryConfirmed, true);
});

test("provider queue interaction admission history alert delivery readback rejects provider boundary drift", () => {
  const reasonCodes = _internals.validateProviderAdmissionHistoryAlertDeliveryReadback({
    canaryResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: true,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    readback: {
      deliveryAdmissionStatus: "no_alert_to_deliver",
      alertRequired: false,
      signatureProofVisible: true,
      providerTrackMetadataVisible: true,
      noProviderBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_admission_history_alert_delivery_readback_provider_boundary_failed"));
});
