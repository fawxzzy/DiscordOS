const {
  _internals: canaryInternals,
} = require("./discordos-music-provider-queue-interaction-admission-history-alert-delivery-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildProviderAdmissionHistoryAlertDeliveryReadback(canaryResult) {
  const canary = canaryResult.canary;
  return {
    deliveryAdmissionStatus: canary.deliveryAdmissionStatus,
    alertRequired: canary.alertRequired === true,
    alertStatus: canary.alertStatus,
    signatureProofVisible: canary.signatureProofVisible === true,
    providerTrackMetadataVisible: canary.providerTrackMetadataVisible === true,
    noProviderBoundaryConfirmed: canary.noProviderBoundaryConfirmed === true,
    noPlaybackBoundaryConfirmed: canary.noPlaybackBoundaryConfirmed === true,
    deliveryDecisionVisible: canary.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: canary.sendsMessagesInCanary === false && canaryResult.sendsMessages === false,
    noDiscordApiBoundaryConfirmed: canary.callsDiscordApi === false && canaryResult.callsDiscordApi === false,
    noStorageWriteBoundaryConfirmed: canary.executesStorageWrite === false && canaryResult.executesStorageWrite === false,
    slashCommandsAdmitted: false,
  };
}

function validateProviderAdmissionHistoryAlertDeliveryReadback({ canaryResult, readback }) {
  const reasonCodes = [...canaryResult.reasonCodes];
  if (!readback.deliveryDecisionVisible) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_readback_visibility_missing");
  }
  if (!readback.signatureProofVisible || !readback.providerTrackMetadataVisible) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_readback_metadata_missing");
  }
  if (!readback.noProviderBoundaryConfirmed || !readback.noPlaybackBoundaryConfirmed || canaryResult.callsMusicProviders || canaryResult.controlsPlayback) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_readback_provider_boundary_failed");
  }
  if (!readback.noSendBoundaryConfirmed || !readback.noDiscordApiBoundaryConfirmed || canaryResult.sendsMessages || canaryResult.callsDiscordApi) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_readback_send_boundary_failed");
  }
  if (!readback.noStorageWriteBoundaryConfirmed || canaryResult.executesStorageWrite) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_readback_storage_write_attempted");
  }
  if (readback.alertRequired && readback.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_readback_admission_missing");
  }
  if (canaryResult.slashCommandsAdmitted || readback.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_readback_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryReadback(input = {}) {
  const canaryResult = await canaryInternals.buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryCanary(input);
  const readback = buildProviderAdmissionHistoryAlertDeliveryReadback(canaryResult);
  const reasonCodes = validateProviderAdmissionHistoryAlertDeliveryReadback({ canaryResult, readback });
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
    status: reasonCodes.length === 0 ? "music_provider_queue_interaction_admission_history_alert_delivery_readback_ready" : "blocked",
    sourceStatus: canaryResult.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_interaction_admission_history_alert_delivery_readback_ready"
        : "discordos.music_provider.queue_interaction_admission_history_alert_delivery_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_interaction_admission_history_alert_delivery_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: readback.alertRequired,
        admission: readback.deliveryAdmissionStatus,
        signatureProofVisible: readback.signatureProofVisible,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Interaction Admission History Alert Delivery Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- admission: \`${result.readback.deliveryAdmissionStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryReadback(options);
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
    buildProviderAdmissionHistoryAlertDeliveryReadback,
    validateProviderAdmissionHistoryAlertDeliveryReadback,
    buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryReadback,
    renderMarkdown,
  },
};
