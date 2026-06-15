const {
  _internals: monitorInternals,
} = require("./discordos-product-workflow-monitor");
const {
  _internals: notificationRouterInternals,
} = require("./discordos-notification-router");

function parseArgs(args) {
  return monitorInternals.parseArgs(args);
}

async function buildProductWorkflowAlertDrill({
  env = process.env,
  fetchImpl = fetch,
  notificationRouter = notificationRouterInternals,
  ...input
} = {}) {
  const monitor = await monitorInternals.buildProductWorkflowMonitor({ env, fetchImpl, ...input });
  const alertWouldSend = monitor.anomalies.length > 0;
  const route = alertWouldSend
    ? await notificationRouter.buildNotificationRouteDecision({
      source: "product-workflow",
      type: "discordos.product_workflow.monitor_attention",
      severity: "critical",
    })
    : null;
  const reasonCodes = [...new Set([
    ...(alertWouldSend && route && !route.ok ? route.reasonCodes : []),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    alertWouldSend,
    status: reasonCodes.length === 0 ? "alert_drill_ready" : "blocked",
    monitorStatus: monitor.status,
    anomalies: monitor.anomalies,
    notificationRoute: route
      ? {
          ok: route.ok,
          routeId: route.route?.id || null,
          target: route.route?.target || null,
          targetEnv: route.route?.targetEnv || null,
        }
      : null,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.product_workflow.alert_drill_ready"
        : "discordos.product_workflow.alert_drill_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.product_workflow.alert_drill",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertWouldSend: result.alertWouldSend,
        anomalyCount: result.anomalies.length,
        routeId: result.notificationRoute?.routeId || "none",
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Product Workflow Alert Drill",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- alert would send: \`${result.alertWouldSend ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- monitor status: \`${result.monitorStatus}\``,
    `- notification route: \`${result.notificationRoute?.routeId || "none"}\``,
    `- anomalies: \`${result.anomalies.join(",") || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildProductWorkflowAlertDrill(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) {
      process.exitCode = 1;
    }
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
    buildProductWorkflowAlertDrill,
    renderMarkdown,
  },
};
