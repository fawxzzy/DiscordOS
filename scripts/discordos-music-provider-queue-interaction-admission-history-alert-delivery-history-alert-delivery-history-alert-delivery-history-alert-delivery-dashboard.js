const {
  _internals: readbackInternals,
} = require("./discordos-music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function buildProviderAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard(readbackResult) {
  const readback = readbackResult.readback;
  return {
    statusLine: "ready",
    deliveryAdmissionStatus: readback.deliveryAdmissionStatus,
    alertRequired: readback.alertRequired === true,
    alertStatus: readback.alertStatus,
    signatureProofVisible: readback.signatureProofVisible === true,
    providerTrackMetadataVisible: readback.providerTrackMetadataVisible === true,
    noProviderBoundaryConfirmed: readback.noProviderBoundaryConfirmed === true,
    noPlaybackBoundaryConfirmed: readback.noPlaybackBoundaryConfirmed === true,
    deliveryDecisionVisible: readback.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: readback.noSendBoundaryConfirmed === true,
    noDiscordApiBoundaryConfirmed: readback.noDiscordApiBoundaryConfirmed === true,
    noStorageWriteBoundaryConfirmed: readback.noStorageWriteBoundaryConfirmed === true,
    sendsMessagesInDashboard: false,
    callsDiscordApi: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateProviderAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard({ readbackResult, dashboard }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (dashboard.statusLine !== "ready") {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_dashboard_status_invalid");
  }
  if (!dashboard.deliveryDecisionVisible) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_dashboard_visibility_missing");
  }
  if (!dashboard.signatureProofVisible || !dashboard.providerTrackMetadataVisible) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_dashboard_metadata_missing");
  }
  if (!dashboard.noProviderBoundaryConfirmed || !dashboard.noPlaybackBoundaryConfirmed || readbackResult.callsMusicProviders || readbackResult.controlsPlayback) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_dashboard_provider_boundary_failed");
  }
  if (!dashboard.noSendBoundaryConfirmed || !dashboard.noDiscordApiBoundaryConfirmed || dashboard.sendsMessagesInDashboard || dashboard.callsDiscordApi || readbackResult.sendsMessages || readbackResult.callsDiscordApi) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_dashboard_send_boundary_failed");
  }
  if (!dashboard.noStorageWriteBoundaryConfirmed || dashboard.executesStorageWrite || readbackResult.executesStorageWrite) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_dashboard_storage_write_attempted");
  }
  if (dashboard.alertRequired && dashboard.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_dashboard_admission_missing");
  }
  if (readbackResult.slashCommandsAdmitted || dashboard.slashCommandsAdmitted) {
    reasonCodes.push("provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_dashboard_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard(input = {}) {
  const readbackResult = await readbackInternals.buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryReadback(input);
  const dashboard = buildProviderAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard(readbackResult);
  const reasonCodes = validateProviderAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard({ readbackResult, dashboard });
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
    status: reasonCodes.length === 0 ? "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard_ready" : "blocked",
    sourceStatus: readbackResult.status,
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard_ready"
        : "discordos.music_provider.queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: dashboard.alertRequired,
        admission: dashboard.deliveryAdmissionStatus,
        signatureProofVisible: dashboard.signatureProofVisible,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Queue Interaction Admission History Alert Delivery History Alert Delivery History Alert Delivery History Alert Delivery Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- status line: \`${result.dashboard.statusLine}\``,
    `- admission: \`${result.dashboard.deliveryAdmissionStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard(options);
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
    buildProviderAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard,
    validateProviderAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard,
    buildMusicProviderQueueInteractionAdmissionHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard,
    renderMarkdown,
  },
};
