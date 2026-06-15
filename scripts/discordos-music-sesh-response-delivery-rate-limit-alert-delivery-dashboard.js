const {
  _internals: readbackInternals,
} = require("./discordos-music-sesh-response-delivery-rate-limit-alert-delivery-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function buildRateLimitAlertDeliveryDashboard(readbackResult) {
  const readback = readbackResult.readback;
  return {
    statusLine: "ready",
    deliveryAdmissionStatus: readback.deliveryAdmissionStatus,
    alertRequired: readback.alertRequired === true,
    alertStatus: readback.alertStatus,
    targetChannelId: readback.targetChannelId,
    deliveryDecisionVisible: readback.deliveryDecisionVisible === true,
    noSendBoundaryConfirmed: readback.noSendBoundaryConfirmed === true,
    noDiscordApiBoundaryConfirmed: readback.noDiscordApiBoundaryConfirmed === true,
    userContentHidden: readback.userContentExposed === false,
    mentionSafetyPreserved: readback.mentionSafetyPreserved === true,
    sendsMessagesInDashboard: false,
    callsDiscordApi: false,
    slashCommandsAdmitted: false,
  };
}

function validateRateLimitAlertDeliveryDashboard({ readbackResult, dashboard }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (dashboard.statusLine !== "ready" || !dashboard.deliveryDecisionVisible) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_dashboard_visibility_missing");
  }
  if (!dashboard.noSendBoundaryConfirmed || !dashboard.noDiscordApiBoundaryConfirmed || dashboard.sendsMessagesInDashboard || dashboard.callsDiscordApi) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_dashboard_send_boundary_failed");
  }
  if (!dashboard.userContentHidden || !dashboard.mentionSafetyPreserved) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_dashboard_privacy_boundary_failed");
  }
  if (dashboard.alertRequired && dashboard.deliveryAdmissionStatus !== "admitted_no_send") {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_dashboard_admission_missing");
  }
  if (readbackResult.slashCommandsAdmitted || dashboard.slashCommandsAdmitted) {
    reasonCodes.push("music_sesh_rate_limit_alert_delivery_dashboard_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildMusicSeshResponseDeliveryRateLimitAlertDeliveryDashboard(input = {}) {
  const readbackResult = await readbackInternals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryReadback(input);
  const dashboard = buildRateLimitAlertDeliveryDashboard(readbackResult);
  const reasonCodes = validateRateLimitAlertDeliveryDashboard({ readbackResult, dashboard });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "music_sesh_response_delivery_rate_limit_alert_delivery_dashboard_ready" : "blocked",
    sourceStatus: readbackResult.status,
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_dashboard_ready"
        : "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.response_delivery_rate_limit_alert_delivery_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: dashboard.alertRequired,
        admission: dashboard.deliveryAdmissionStatus,
        userContentHidden: dashboard.userContentHidden,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Response Delivery Rate-Limit Alert Delivery Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
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
    const result = await buildMusicSeshResponseDeliveryRateLimitAlertDeliveryDashboard(options);
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
    buildRateLimitAlertDeliveryDashboard,
    validateRateLimitAlertDeliveryDashboard,
    buildMusicSeshResponseDeliveryRateLimitAlertDeliveryDashboard,
    renderMarkdown,
  },
};
