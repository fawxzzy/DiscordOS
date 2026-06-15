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
    notificationPolicyOk: nextWork.operatorStatus.notificationPolicyOk,
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

function buildHealthTiles(nextWork) {
  const operator = nextWork.operatorStatus;
  return [
    {
      id: "runtime",
      label: "Runtime",
      status: operator.runtimeOk ? "pass" : "fail",
    },
    {
      id: "publication",
      label: "Publication",
      status: operator.publicationOk ? "pass" : "fail",
    },
    {
      id: "publication_audit",
      label: "Publication audit",
      status: operator.publicationAuditOk ? "pass" : "fail",
    },
    {
      id: "atlas_health",
      label: "ATLAS health",
      status: operator.atlasHealthOk ? "pass" : "fail",
    },
    {
      id: "notification_policy",
      label: "Notification policy",
      status: operator.notificationPolicyOk ? "pass" : "fail",
    },
  ];
}

function groupRecommendationsByCategory(recommendations) {
  const groupsByCategory = new Map();

  for (const recommendation of Array.isArray(recommendations) ? recommendations : []) {
    const category = recommendation.category || "uncategorized";
    const group = groupsByCategory.get(category) || {
      category,
      count: 0,
      topRecommendationId: null,
      topScore: null,
      commands: [],
    };

    group.count += 1;
    if (group.topScore === null || recommendation.score > group.topScore) {
      group.topScore = recommendation.score;
      group.topRecommendationId = recommendation.id;
    }
    if (recommendation.command) {
      group.commands.push({
        id: recommendation.id,
        command: recommendation.command,
      });
    }
    groupsByCategory.set(category, group);
  }

  return [...groupsByCategory.values()].sort((left, right) => {
    if ((right.topScore ?? 0) !== (left.topScore ?? 0)) {
      return (right.topScore ?? 0) - (left.topScore ?? 0);
    }
    return left.category.localeCompare(right.category);
  });
}

function buildDashboardConsole(nextWork) {
  const healthTiles = buildHealthTiles(nextWork);
  const failingTileCount = healthTiles.filter((tile) => tile.status !== "pass").length;
  const groupedRecommendations = groupRecommendationsByCategory(nextWork.recommendations);

  return {
    statusLine: failingTileCount === 0
      ? "ready"
      : "action_required",
    healthTiles,
    failingTileCount,
    recommendationGroups: groupedRecommendations,
    primaryCommand: nextWork.topRecommendation?.command || null,
  };
}

function buildProductRuntimeTiles() {
  return [
    {
      id: "board_task_runtime",
      label: "Board task runtime",
      status: "available",
      command: "npm run ops:discordos:board-task-runtime",
    },
    {
      id: "board_shadow_persistence",
      label: "Board shadow persistence",
      status: "available",
      command: "npm run ops:discordos:board-card-shadow-persistence",
    },
    {
      id: "moderation_audit_shadow_persistence",
      label: "Moderation audit shadow persistence",
      status: "available",
      command: "npm run ops:discordos:moderation-audit-shadow-persistence",
    },
    {
      id: "board_feature_activation_pilot",
      label: "Board activation pilot",
      status: "available",
      command: "npm run ops:discordos:board-feature-activation-pilot",
    },
    {
      id: "board_active_admission_canary",
      label: "Board active canary",
      status: "available",
      command: "npm run ops:discordos:board-active-admission-canary",
    },
    {
      id: "board_active_write_adapter_guard",
      label: "Board write adapter guard",
      status: "available",
      command: "npm run ops:discordos:board-active-write-adapter-guard",
    },
    {
      id: "board_lifecycle_sync",
      label: "Board lifecycle sync",
      status: "available",
      command: "npm run ops:discordos:board-lifecycle-sync",
    },
    {
      id: "moderation_audit_write_adapter_guard",
      label: "Moderation audit write adapter guard",
      status: "available",
      command: "npm run ops:discordos:moderation-audit-write-adapter-guard",
    },
    {
      id: "moderation_audit_review_search",
      label: "Moderation audit review search",
      status: "available",
      command: "npm run ops:discordos:moderation-audit-review-search",
    },
    {
      id: "supabase_apply_readback_proof",
      label: "Supabase apply readback proof",
      status: "available",
      command: "npm run ops:discordos:supabase-apply-readback-proof",
    },
    {
      id: "product_workflow_live_readback",
      label: "Product workflow live readback",
      status: "available",
      command: "npm run ops:discordos:product-workflow-live-readback",
    },
    {
      id: "product_workflow_dashboard",
      label: "Product workflow dashboard",
      status: "available",
      command: "npm run ops:discordos:product-workflow-dashboard",
    },
    {
      id: "music_sesh_runtime",
      label: "Music Sesh runtime",
      status: "available",
      command: "npm run ops:discordos:music-sesh-runtime",
    },
    {
      id: "slash_command_adapter",
      label: "Slash command adapter",
      status: "available",
      command: "npm run ops:discordos:slash-command-adapter",
    },
    {
      id: "board_lifecycle_event_ingest",
      label: "Board event ingest",
      status: "available",
      command: "npm run ops:discordos:board-lifecycle-event-ingest",
    },
    {
      id: "moderation_review_slash_command",
      label: "Moderation review slash command",
      status: "available",
      command: "npm run ops:discordos:moderation-review-slash-command",
    },
    {
      id: "product_workflow_monitor",
      label: "Product workflow monitor",
      status: "available",
      command: "npm run ops:discordos:product-workflow-monitor",
    },
    {
      id: "operator_activation_runbook",
      label: "Operator activation runbook",
      status: "available",
      command: "npm run ops:discordos:operator-activation-runbook",
    },
    {
      id: "music_sesh_storage_contract",
      label: "Music Sesh storage contract",
      status: "available",
      command: "npm run ops:discordos:music-sesh-storage-contract",
    },
    {
      id: "slash_command_registration_preflight",
      label: "Slash command registration preflight",
      status: "available",
      command: "npm run ops:discordos:slash-command-registration-preflight",
    },
    {
      id: "discord_interaction_signature_preflight",
      label: "Discord interaction signature preflight",
      status: "available",
      command: "npm run ops:discordos:discord-interaction-signature-preflight",
    },
    {
      id: "moderation_audit_dashboard",
      label: "Moderation audit dashboard",
      status: "available",
      command: "npm run ops:discordos:moderation-audit-dashboard",
    },
    {
      id: "product_workflow_alert_drill",
      label: "Product workflow alert drill",
      status: "available",
      command: "npm run ops:discordos:product-workflow-alert-drill",
    },
    {
      id: "music_sesh_feature_activation_ratchet",
      label: "Music Sesh activation ratchet",
      status: "available",
      command: "npm run ops:discordos:music-sesh-feature-activation-ratchet",
    },
    {
      id: "music_sesh_feedback_board",
      label: "Music Sesh feedback board",
      status: "available",
      command: "npm run ops:discordos:music-sesh-feedback-board",
    },
  ];
}

function buildProductRuntimePanel() {
  const tiles = buildProductRuntimeTiles();

  return {
    surfaceCount: tiles.length,
    availableCount: tiles.filter((tile) => tile.status === "available").length,
    tiles,
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
    console: buildDashboardConsole(nextWork),
    productRuntime: buildProductRuntimePanel(),
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
    `- notification policy: \`${result.operator.notificationPolicyOk ? "pass" : "fail"}\``,
    "",
    "## Next Work",
    "",
    `- recommendations: \`${result.nextWork.recommendationCount}\``,
    `- top recommendation: \`${result.nextWork.topRecommendationId}\``,
    `- reason codes: \`${result.nextWork.reasonCodes.join(",") || "none"}\``,
    `- command: \`${result.commandHint?.command || "none"}\``,
    "",
    "## Console",
    "",
    `- status line: \`${result.console.statusLine}\``,
    `- failing tiles: \`${result.console.failingTileCount}\``,
    `- primary command: \`${result.console.primaryCommand || "none"}\``,
    `- recommendation groups: \`${result.console.recommendationGroups.length}\``,
  ];

  for (const tile of result.console.healthTiles) {
    lines.push(`- tile ${tile.id}: \`${tile.status}\``);
  }

  for (const group of result.console.recommendationGroups) {
    lines.push(`- group ${group.category}: \`${group.count}\` top \`${group.topRecommendationId || "none"}\``);
  }

  lines.push(
    "",
    "## Product Runtime",
    "",
    `- surfaces: \`${result.productRuntime.surfaceCount}\``,
    `- available: \`${result.productRuntime.availableCount}\``
  );

  for (const tile of result.productRuntime.tiles) {
    lines.push(`- surface ${tile.id}: \`${tile.status}\` command \`${tile.command}\``);
  }

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
    buildHealthTiles,
    groupRecommendationsByCategory,
    buildDashboardConsole,
    buildProductRuntimeTiles,
    buildProductRuntimePanel,
    classifyDashboardEvent,
    buildDiscordOSOperatorDashboard,
    renderMarkdown,
  },
};
