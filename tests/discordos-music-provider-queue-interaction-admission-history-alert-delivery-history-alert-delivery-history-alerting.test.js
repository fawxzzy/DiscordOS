const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alerting");

test("provider admission alert delivery nested history alerting preserves metadata boundaries", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.alerting.historyStatus, "bounded_ready");
  assert.equal(result.alerting.signatureProofVisible, true);
  assert.equal(result.alerting.providerTrackMetadataVisible, true);
});

test("provider admission alert delivery nested history alerting rejects signature drift", () => {
  const reasonCodes = _internals.validateProviderAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting({
    historyResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    alerting: {
      historyStatus: "bounded_ready",
      repeatedPatternVisible: true,
      recordCount: 1,
      alertRequired: false,
      alertStatus: "not_required",
      signatureProofVisible: false,
      providerTrackMetadataVisible: true,
      noProviderBoundaryConfirmed: true,
      noPlaybackBoundaryConfirmed: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      sendsMessagesInAlerting: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alerting_visibility_missing"));
});
