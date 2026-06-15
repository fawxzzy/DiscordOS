const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-admission-history-alert-delivery-dashboard");

test("provider queue interaction admission history alert delivery dashboard stays metadata-only", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.statusLine, "ready");
  assert.equal(result.dashboard.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.dashboard.signatureProofVisible, true);
  assert.equal(result.dashboard.noProviderBoundaryConfirmed, true);
});

test("provider queue interaction admission history alert delivery dashboard rejects signature drift", () => {
  const reasonCodes = _internals.validateProviderAdmissionHistoryAlertDeliveryDashboard({
    readbackResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    dashboard: {
      statusLine: "ready",
      deliveryAdmissionStatus: "no_alert_to_deliver",
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
      sendsMessagesInDashboard: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_admission_history_alert_delivery_dashboard_metadata_missing"));
});
