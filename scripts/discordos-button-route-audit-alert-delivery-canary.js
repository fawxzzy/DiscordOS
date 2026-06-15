const {
  _internals: alertingInternals,
} = require("./discordos-button-route-audit-alerting");
const {
  _internals: runtimeAlertDeliveryInternals,
} = require("./runtime-health-alert-delivery");

function parseArgs(args) {
  return alertingInternals.parseArgs(args);
}

function buildSyntheticAlertDashboardPayload() {
  return {
    audits: [
      {
        custom_id: "music_sesh:queue",
        response_type: "unexpected",
        actor_fingerprint: "audit-canary-actor",
        storage_write_attempted: true,
      },
    ],
  };
}

function buildSyntheticEnv(env = {}) {
  return {
    ...env,
    DISCORDOS_SUPABASE_URL: env.DISCORDOS_SUPABASE_URL || "https://discordos-canary.supabase.co",
    DISCORDOS_SUPABASE_SERVICE_ROLE_KEY:
      env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY || "synthetic-service-role-key",
    DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID:
      env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID || "1515943795999510579",
    DISCORDOS_BOT_TOKEN: env.DISCORDOS_BOT_TOKEN || "synthetic-bot-token",
  };
}

async function buildButtonRouteAuditAlertDeliveryCanary({
  env = process.env,
  fetchImpl = fetch,
  alertingBuilder = alertingInternals.buildButtonRouteAuditAlerting,
  ...input
} = {}) {
  const resolvedEnv = buildSyntheticEnv(env);
  const alerting = await alertingBuilder({
    ...input,
    live: true,
    env: resolvedEnv,
    fetchImpl: async (...args) => {
      if (fetchImpl !== fetch) return fetchImpl(...args);
      return {
        ok: true,
        status: 200,
        json: async () => buildSyntheticAlertDashboardPayload(),
      };
    },
  });
  const target = runtimeAlertDeliveryInternals.getAlertDeliveryTarget(resolvedEnv);
  const reasonCodes = [...new Set([
    ...alerting.reasonCodes,
    ...(alerting.alertRequired ? [] : ["button_route_audit_alert_not_exercised"]),
    ...(alerting.notificationRoute?.routeId ? [] : ["button_route_audit_alert_route_missing"]),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "button_route_audit_alert_delivery_canary_ready" : "blocked",
    alertWouldSend: alerting.alertRequired && alerting.notificationRoute.routeId !== null,
    deliveryTarget: {
      configured: target.configured,
      type: target.type,
    },
    notificationRoute: alerting.notificationRoute,
    alertSignals: alerting.alertSignals,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_alert_delivery_canary_ready"
        : "discordos.button_route.audit_alert_delivery_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_alert_delivery_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertWouldSend: result.alertWouldSend,
        routeId: result.notificationRoute.routeId || "none",
        targetType: result.deliveryTarget.type,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Alert Delivery Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- alert would send: \`${result.alertWouldSend ? "true" : "false"}\``,
    `- route: \`${result.notificationRoute.routeId || "none"}\``,
    `- target type: \`${result.deliveryTarget.type}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAlertDeliveryCanary(options);
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
    buildSyntheticAlertDashboardPayload,
    buildSyntheticEnv,
    buildButtonRouteAuditAlertDeliveryCanary,
    renderMarkdown,
  },
};
