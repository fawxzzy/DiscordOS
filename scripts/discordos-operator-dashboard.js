const {
  _internals: nextWorkInternals,
} = require("./discordos-next-work-recommender");

function parseArgs(args) {
  return nextWorkInternals.parseArgs(args);
}

function buildOperatorSummary(nextWork) {
  return {
    ok: nextWork.operatorStatus.ok,
    eventType: nextWork.operatorStatus.eventType,
    probeLive: nextWork.operatorStatus.probeLive,
    runtimeOk: nextWork.operatorStatus.runtimeOk,
    publicationOk: nextWork.operatorStatus.publicationOk,
    publicationAuditOk: nextWork.operatorStatus.publicationAuditOk,
    atlasHealthOk: nextWork.operatorStatus.atlasHealthOk,
  };
}

function buildCommandHint(recommendation) {
  if (!recommendation?.command) {
    return null;
  }

  return {
    id: recommendation.id,
    command: recommendation.command,
    reasonCodes: recommendation.reasonCodes,
  };
}

function classifyDashboardEvent(result) {
  return {
    type: result.operator.ok
      ? "discordos.operator.dashboard_ready"
      : "discordos.operator.dashboard_action_required",
    severity: result.operator.ok ? "info" : "warning",
    subject: "discordos.operator.dashboard",
    status: result.operator.ok ? "pass" : "fail",
    dimensions: {
      recommendationCount: result.nextWork.recommendationCount,
      topRecommendation: result.nextWork.topRecommendationId,
      operatorStatus: result.operator.ok ? "pass" : "fail",
    },
  };
}

async function buildDiscordOSOperatorDashboard(options = {}) {
  const nextWork = await nextWorkInternals.buildDiscordOSNextWorkRecommendations(options);
  const topRecommendation = nextWork.topRecommendation || null;
  const result = {
    ok: nextWork.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: nextWork.operatorStatus.ok ? "ready" : "action_required",
    operator: buildOperatorSummary(nextWork),
    nextWork: {
      status: nextWork.status,
      recommendationCount: nextWork.recommendations.length,
      topRecommendationId: topRecommendation?.id || "none",
      reasonCodes: nextWork.reasonCodes,
    },
    commandHint: buildCommandHint(topRecommendation),
    recommendations: nextWork.recommendations,
    receiptState: nextWork.receiptState,
  };

  return {
    ...result,
    event: classifyDashboardEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Operator Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    "",
    "## Operator",
    "",
    `- result: \`${result.operator.ok ? "pass" : "fail"}\``,
    `- probe live: \`${result.operator.probeLive ? "true" : "false"}\``,
    `- runtime: \`${result.operator.runtimeOk ? "pass" : "fail"}\``,
    `- publication: \`${result.operator.publicationOk ? "pass" : "fail"}\``,
    `- publication audit: \`${result.operator.publicationAuditOk ? "pass" : "fail"}\``,
    `- ATLAS health: \`${result.operator.atlasHealthOk ? "pass" : "fail"}\``,
    "",
    "## Next Work",
    "",
    `- recommendations: \`${result.nextWork.recommendationCount}\``,
    `- top recommendation: \`${result.nextWork.topRecommendationId}\``,
    `- reason codes: \`${result.nextWork.reasonCodes.join(",") || "none"}\``,
    `- command: \`${result.commandHint?.command || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordOSOperatorDashboard(options);
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
    buildOperatorSummary,
    buildCommandHint,
    classifyDashboardEvent,
    buildDiscordOSOperatorDashboard,
    renderMarkdown,
  },
};
