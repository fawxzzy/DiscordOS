const {
  _internals: dashboardInternals,
} = require("./discordos-button-route-audit-dashboard");
const {
  _internals: notificationRouterInternals,
} = require("./discordos-notification-router");

function parseArgs(args) {
  return dashboardInternals.parseArgs(args);
}

function findAuditAlertSignals(dashboard = {}) {
  const signals = [];
  if (dashboard.rawSensitiveFieldsAbsent === false) {
    signals.push("button_route_audit_raw_sensitive_fields_present");
  }
  if (dashboard.auditCount > 0 && dashboard.loadedRowCount === 0) {
    signals.push("button_route_audit_summary_without_rows");
  }
  const unexpectedResponseTypes = (dashboard.responseTypes || [])
    .filter((item) => !["4", "5", 4, 5, "message", "deferred"].includes(item.responseType));
  if (unexpectedResponseTypes.length > 0) {
    signals.push("button_route_audit_unexpected_response_type");
  }
  return signals;
}

async function buildButtonRouteAuditAlerting({
  notificationRouter = notificationRouterInternals,
  ...input
} = {}) {
  const auditDashboard = await dashboardInternals.buildButtonRouteAuditDashboard(input);
  const alertSignals = findAuditAlertSignals(auditDashboard.dashboard);
  let route = null;
  const routeReasonCodes = [];
  if (alertSignals.length > 0) {
    route = await notificationRouter.buildNotificationRouteDecision({
      source: "button-route",
      type: "discordos.button_route.audit_attention",
      severity: "critical",
    });
    if (!route.ok) routeReasonCodes.push(...route.reasonCodes);
  }
  const reasonCodes = [...new Set([...auditDashboard.reasonCodes, ...routeReasonCodes])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "button_route_audit_alerting_ready" : "blocked",
    alertSignals,
    alertRequired: alertSignals.length > 0,
    notificationRoute: route
      ? {
          ok: route.ok,
          routeId: route.route?.id || null,
          target: route.route?.target || null,
          targetEnv: route.route?.targetEnv || null,
          severity: route.intent.severity,
        }
      : {
          ok: true,
          routeId: null,
          target: null,
          targetEnv: null,
          severity: "info",
        },
    dashboard: {
      status: auditDashboard.status,
      auditCount: auditDashboard.dashboard.auditCount,
      storageAttemptCount: auditDashboard.dashboard.storageAttemptCount,
      rawSensitiveFieldsAbsent: auditDashboard.dashboard.rawSensitiveFieldsAbsent,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_alerting_ready"
        : "discordos.button_route.audit_alerting_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_alerting",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertRequired: result.alertRequired,
        signalCount: alertSignals.length,
        routeId: result.notificationRoute.routeId || "none",
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Alerting",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- alert required: \`${result.alertRequired ? "true" : "false"}\``,
    `- route: \`${result.notificationRoute.routeId || "none"}\``,
    `- signals: \`${result.alertSignals.join(",") || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAlerting(options);
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
    findAuditAlertSignals,
    buildButtonRouteAuditAlerting,
    renderMarkdown,
  },
};
