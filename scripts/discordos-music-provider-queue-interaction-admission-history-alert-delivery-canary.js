const {
  _internals: alertingInternals,
} = require("./discordos-music-provider-queue-interaction-admission-history-alerting");

function parseArgs(args) {
  return alertingInternals.parseArgs(args);
}

function buildProviderAdmissionHistoryAlertDeliveryCanary(alertingResult) {
  const alerting = alertingResult.alerting;
  return {
    deliveryAdmissionStatus: alerting.alertRequired ? "admitted_no_send" : "no_alert_to_deliver",
    alertRequired: alerting.alertRequired === true,
    alertStatus: alerting.alertStatus,
    signatureProofVisible: alerting.signatureProofVisible === true,
    providerTrackMetadataVisible: alerting.providerTrackMetadataVisible === true,
    noProviderBoundaryConfirmed: alerting.noProviderBoundaryConfirmed === true,
    noPlaybackBoundaryConfirmed: alerting.noPlaybackBoundaryConfirmed === true,
    deliveryDecisionVisible: true,
    sendsMessagesInCanary: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateProviderAdmissionHistoryAlertDeliveryCanary({ alertingResult, canary }) {
  const reasonCodes = [...alertingResult.reasonCodes];
  if (!canary.deliveryDecisionVisible) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_canary_visibility_missing");
  }
  if (!canary.signatureProofVisible || !canary.providerTrackMetadataVisible) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_canary_metadata_missing");
  }
  if (!canary.noProviderBoundaryConfirmed || !canary.noPlaybackBoundaryConfirmed || alertingResult.callsMusicProviders || alertingResult.controlsPlayback) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_canary_boundary_failed");
  }
  if (canary.sendsMessagesInCanary || canary.callsDiscordApi || alertingResult.sendsMessages || alertingResult.callsDiscordApi) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_canary_send_attempted");
  }
  if (canary.executesStorageWrite || alertingResult.executesStorageWrite) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_canary_storage_write_attempted");
  }
  if (canary.alertRequired && canary.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_canary_admission_missing");
  }
  if (alertingResult.slashCommandsAdmitted || canary.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_canary_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryCanary(input = {}) {
  const alertingResult = await alertingInternals.buildMusicProviderQueueInteractionAdmissionHistoryAlerting(input);
  const canary = buildProviderAdmissionHistoryAlertDeliveryCanary(alertingResult);
  const reasonCodes = validateProviderAdmissionHistoryAlertDeliveryCanary({ alertingResult, canary });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_provider_queue_interaction_admission_history_alert_delivery_canary_ready" : "blocked",
    sourceStatus: alertingResult.status,
    canary,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_interaction_admission_history_alert_delivery_canary_ready"
        : "discordos.music_provider.queue_interaction_admission_history_alert_delivery_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_interaction_admission_history_alert_delivery_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: canary.alertRequired,
        admission: canary.deliveryAdmissionStatus,
        signatureProofVisible: canary.signatureProofVisible,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Interaction Admission History Alert Delivery Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.canary.deliveryAdmissionStatus}\``,
    `- alert required: \`${result.canary.alertRequired ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryCanary(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  _internals: {
    parseArgs,
    buildProviderAdmissionHistoryAlertDeliveryCanary,
    validateProviderAdmissionHistoryAlertDeliveryCanary,
    buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryCanary,
    renderMarkdown,
  },
};
