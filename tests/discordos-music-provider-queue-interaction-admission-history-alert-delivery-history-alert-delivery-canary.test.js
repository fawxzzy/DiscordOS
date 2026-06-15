const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-canary");

test("provider admission history alert delivery canary proves no-send metadata-only admission", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryHistoryAlertDeliveryCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.canary.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.canary.signatureProofVisible, true);
  assert.equal(result.canary.noProviderBoundaryConfirmed, true);
});

test("provider admission history alert delivery canary rejects metadata drift", () => {
  const reasonCodes = _internals.validateProviderAdmissionHistoryAlertDeliveryHistoryAlertDeliveryCanary({
    alertingResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    canary: {
      deliveryAdmissionStatus: "no_alert_to_deliver",
      alertRequired: false,
      alertStatus: "not_required",
      historyStatus: "bounded_ready",
      signatureProofVisible: false,
      providerTrackMetadataVisible: true,
      noProviderBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      sendsMessagesInCanary: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_canary_visibility_missing"));
});
