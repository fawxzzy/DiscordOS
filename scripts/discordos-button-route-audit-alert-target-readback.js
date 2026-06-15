const {
  _internals: canaryInternals,
} = require("./discordos-button-route-audit-alert-delivery-canary");

function parseArgs(args) {
  return canaryInternals.parseArgs(args);
}

function buildAlertTargetReadback(canary) {
  return {
    routeId: canary.notificationRoute?.routeId || null,
    target: canary.notificationRoute?.target || null,
    targetEnv: canary.notificationRoute?.targetEnv || null,
    targetConfigured: canary.deliveryTarget?.configured === true,
    targetType: canary.deliveryTarget?.type || "none",
    alertWouldSend: canary.alertWouldSend === true,
    signalCount: Array.isArray(canary.alertSignals) ? canary.alertSignals.length : 0,
    rawActorSafe: true,
  };
}

function validateAlertTargetReadback({ canary, readback }) {
  const reasonCodes = [...canary.reasonCodes];
  if (canary.sendsMessages || canary.callsDiscordApi || canary.callsMusicProviders || canary.controlsPlayback) {
    reasonCodes.push("button_route_audit_alert_target_readback_side_effect_boundary_failed");
  }
  if (canary.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_alert_target_readback_slash_command_admitted");
  }
  if (!readback.routeId) reasonCodes.push("button_route_audit_alert_target_route_missing");
  if (!readback.targetConfigured) reasonCodes.push("button_route_audit_alert_target_not_configured");
  if (!readback.alertWouldSend) reasonCodes.push("button_route_audit_alert_target_not_exercised");
  if (!readback.rawActorSafe) reasonCodes.push("button_route_audit_alert_target_raw_actor_not_safe");
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAlertTargetReadback(input = {}) {
  const canary = await canaryInternals.buildButtonRouteAuditAlertDeliveryCanary(input);
  const readback = buildAlertTargetReadback(canary);
  const reasonCodes = validateAlertTargetReadback({ canary, readback });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "button_route_audit_alert_target_readback_ready" : "blocked",
    canaryStatus: canary.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_alert_target_readback_ready"
        : "discordos.button_route.audit_alert_target_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_alert_target_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        routeId: readback.routeId || "none",
        targetType: readback.targetType,
        signalCount: readback.signalCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Alert Target Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- route: \`${result.readback.routeId || "none"}\``,
    `- target type: \`${result.readback.targetType}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAlertTargetReadback(options);
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
    buildAlertTargetReadback,
    validateAlertTargetReadback,
    buildButtonRouteAuditAlertTargetReadback,
    renderMarkdown,
  },
};
