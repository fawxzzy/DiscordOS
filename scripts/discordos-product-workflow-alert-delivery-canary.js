const {
  _internals: drillInternals,
} = require("./discordos-product-workflow-alert-drill");

function parseArgs(args) {
  return drillInternals.parseArgs(args);
}

function normalizeCanaryThresholds(input = {}) {
  const minBoardCards = Number(input.minBoardCards || 0);
  const minModerationAudits = Number(input.minModerationAudits || 0);
  if (minBoardCards > 0 || minModerationAudits > 0) {
    return {
      ...input,
      minBoardCards,
      minModerationAudits,
    };
  }

  return {
    ...input,
    minBoardCards: 1,
    minModerationAudits: 1,
  };
}

async function buildProductWorkflowAlertDeliveryCanary(input = {}) {
  const thresholds = normalizeCanaryThresholds(input);
  const drill = await drillInternals.buildProductWorkflowAlertDrill(thresholds);
  const reasonCodes = [...drill.reasonCodes];
  if (!drill.alertWouldSend) {
    reasonCodes.push("canary_alert_not_exercised");
  }

  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    alertWouldSend: drill.alertWouldSend,
    deliveryCanaryStatus: reasonCodes.length === 0 ? "critical_route_ready_no_send" : "blocked",
    thresholds: {
      minBoardCards: thresholds.minBoardCards,
      minModerationAudits: thresholds.minModerationAudits,
    },
    notificationRoute: drill.notificationRoute,
    anomalies: drill.anomalies,
    reasonCodes: [...new Set(reasonCodes)],
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.product_workflow.alert_delivery_canary_ready"
        : "discordos.product_workflow.alert_delivery_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.product_workflow.alert_delivery_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        alertWouldSend: result.alertWouldSend,
        routeId: result.notificationRoute?.routeId || "none",
        anomalyCount: result.anomalies.length,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Product Workflow Alert Delivery Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- alert would send: \`${result.alertWouldSend ? "true" : "false"}\``,
    `- delivery canary: \`${result.deliveryCanaryStatus}\``,
    `- threshold board cards: \`${result.thresholds?.minBoardCards ?? "unknown"}\``,
    `- threshold moderation audits: \`${result.thresholds?.minModerationAudits ?? "unknown"}\``,
    `- notification route: \`${result.notificationRoute?.routeId || "none"}\``,
    `- route target: \`${result.notificationRoute?.target || "none"}\``,
    `- anomalies: \`${result.anomalies.join(",") || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildProductWorkflowAlertDeliveryCanary(options);
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
    normalizeCanaryThresholds,
    buildProductWorkflowAlertDeliveryCanary,
    renderMarkdown,
  },
};
