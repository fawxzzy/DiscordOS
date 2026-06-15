const fs = require("node:fs/promises");
const path = require("node:path");
const { _internals: routerInternals } = require("./discordos-notification-router");

const DEFAULT_CONFIG_PATH = routerInternals.DEFAULT_CONFIG_PATH;
const PRODUCER_SURFACES = [
  {
    id: "runtime-health-alert-delivery",
    source: "runtime-health",
    type: "discordos.runtime_health.alert_triggered",
    severity: "critical",
    expectedTarget: "alerts",
    state: "attached",
    command: "npm run ops:runtime-health:alert-delivery",
  },
  {
    id: "atlas-health-watch",
    source: "atlas-health",
    type: "atlas.health_watch.critical",
    severity: "critical",
    expectedTarget: "alerts",
    state: "attached",
    command: "npm run ops:atlas-health:watch",
  },
  {
    id: "discord-update-post",
    source: "updates",
    type: "discordos.updates.publication",
    severity: "info",
    expectedTarget: "updates",
    state: "attached",
    command: "npm run ops:discord:update-post",
  },
  {
    id: "discord-update-preflight",
    source: "updates",
    type: "discordos.updates.publication",
    severity: "info",
    expectedTarget: "updates",
    state: "attached",
    command: "npm run ops:discord:update-preflight",
  },
  {
    id: "forum-card-lifecycle",
    source: "forum-card",
    type: "discordos.forum_card.lifecycle",
    severity: "info",
    expectedTarget: "updates",
    state: "attached",
    command: "npm run ops:discord:forum-card-lifecycle",
  },
  {
    id: "board-reaction-drift-alerting",
    source: "board-reaction",
    type: "discordos.board_reaction.drift_detected",
    severity: "critical",
    expectedTarget: "alerts",
    state: "attached",
    command: "npm run ops:discordos:board-reaction-drift-alerting",
  },
];

function parseArgs(args) {
  const options = {
    json: false,
    configPath: DEFAULT_CONFIG_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_config_value");
      }
      options.configPath = path.resolve(value.trim());
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function countBy(values, keyFn) {
  return values.reduce((counts, value) => {
    const key = keyFn(value);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
}

function duplicateValues(values, keyFn) {
  return [...countBy(values, keyFn).entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
}

function targetEnvLooksSafe(value) {
  return typeof value === "string"
    && /^[A-Z0-9_]+$/.test(value)
    && value.startsWith("DISCORDOS_")
    && !value.includes("TOKEN")
    && !value.includes("SECRET");
}

function routeKey(route) {
  return `${route.source}:${route.type}`;
}

function classifyRoute(route) {
  const reasonCodes = [];

  if (route.target === "alerts" && route.minSeverity !== "critical") {
    reasonCodes.push("alert_route_min_severity_not_critical");
  }
  if (route.target === "updates" && route.source !== "updates" && route.source !== "forum-card") {
    reasonCodes.push("non_publication_route_targets_updates");
  }
  if (!targetEnvLooksSafe(route.targetEnv)) {
    reasonCodes.push("route_target_env_name_not_safe");
  }
  if (route.fallbackTargetEnv && !targetEnvLooksSafe(route.fallbackTargetEnv)) {
    reasonCodes.push("route_fallback_target_env_name_not_safe");
  }

  return {
    id: route.id,
    source: route.source,
    type: route.type,
    minSeverity: route.minSeverity,
    target: route.target,
    targetEnv: route.targetEnv,
    fallbackTargetEnv: route.fallbackTargetEnv,
    enabled: route.enabled,
    status: route.enabled && reasonCodes.length === 0 ? "ready" : "blocked",
    reasonCodes,
  };
}

function classifyProducerSurface(surface, config) {
  const decision = routerInternals.resolveNotificationRoute({
    intent: {
      source: surface.source,
      type: surface.type,
      severity: surface.severity,
    },
    config,
  });
  const targetMatches = decision.route?.target === surface.expectedTarget;
  const ok = decision.status === "routed" && targetMatches;
  const reasonCodes = [
    ...decision.reasonCodes,
    ...(decision.status === "routed" && !targetMatches ? ["producer_target_mismatch"] : []),
  ];

  return {
    id: surface.id,
    state: surface.state,
    command: surface.command,
    source: surface.source,
    type: surface.type,
    severity: surface.severity,
    expectedTarget: surface.expectedTarget,
    status: ok ? "ready" : "blocked",
    routeId: decision.route?.id || null,
    target: decision.route?.target || null,
    reasonCodes,
  };
}

function classifyNotificationPolicyStatus(config) {
  const routes = config.routes.map(classifyRoute);
  const duplicateRouteIds = duplicateValues(config.routes, (route) => route.id);
  const duplicateRouteKeys = duplicateValues(config.routes, routeKey);
  const routeReasonCodes = routes.flatMap((route) => route.reasonCodes);
  const producerSurfaces = PRODUCER_SURFACES.map((surface) =>
    classifyProducerSurface(surface, config)
  );
  const attachedProducerSurfaces = producerSurfaces.filter((surface) => surface.state === "attached");
  const blockedAttachedProducers = attachedProducerSurfaces.filter((surface) => surface.status !== "ready");
  const reasonCodes = [
    ...(duplicateRouteIds.length ? ["notification_route_ids_not_unique"] : []),
    ...(duplicateRouteKeys.length ? ["notification_route_keys_not_unique"] : []),
    ...routeReasonCodes,
    ...blockedAttachedProducers.flatMap((surface) => surface.reasonCodes),
  ];
  const ok = reasonCodes.length === 0;

  return {
    ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: ok ? "ready" : "blocked",
    routeCount: routes.length,
    enabledRouteCount: routes.filter((route) => route.enabled).length,
    alertsRouteCount: routes.filter((route) => route.target === "alerts").length,
    updatesRouteCount: routes.filter((route) => route.target === "updates").length,
    attachedProducerCount: attachedProducerSurfaces.length,
    reservedProducerCount: producerSurfaces.filter((surface) => surface.state === "reserved").length,
    readyAttachedProducerCount: attachedProducerSurfaces.filter((surface) => surface.status === "ready").length,
    duplicateRouteIds,
    duplicateRouteKeys,
    routes,
    producerSurfaces,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function classifyNotificationPolicyStatusEvent(result) {
  return {
    type: result.ok
      ? "discordos.notification.policy_ready"
      : "discordos.notification.policy_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.notification_policy",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      routeCount: result.routeCount,
      attachedProducerCount: result.attachedProducerCount,
      readyAttachedProducerCount: result.readyAttachedProducerCount,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildNotificationPolicyStatus({
  configPath = DEFAULT_CONFIG_PATH,
  fsImpl = fs,
} = {}) {
  const config = await routerInternals.loadNotificationRouteConfig({ configPath, fsImpl });
  const result = classifyNotificationPolicyStatus(config);
  return {
    ...result,
    event: classifyNotificationPolicyStatusEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Notification Policy Status",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- routes: \`${result.routeCount}\``,
    `- enabled routes: \`${result.enabledRouteCount}\``,
    `- alert routes: \`${result.alertsRouteCount}\``,
    `- update routes: \`${result.updatesRouteCount}\``,
    `- attached producers: \`${result.readyAttachedProducerCount}/${result.attachedProducerCount}\``,
    `- reserved producers: \`${result.reservedProducerCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
    "## Routes",
    "",
  ];

  for (const route of result.routes) {
    lines.push(`- \`${route.id}\` source=\`${route.source}\` type=\`${route.type}\` min=\`${route.minSeverity}\` target=\`${route.target}\` status=\`${route.status}\``);
  }

  lines.push("", "## Producer Surfaces", "");
  for (const surface of result.producerSurfaces) {
    lines.push(`- \`${surface.id}\` state=\`${surface.state}\` route=\`${surface.routeId || "none"}\` target=\`${surface.target || "none"}\` status=\`${surface.status}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildNotificationPolicyStatus(options);
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
    DEFAULT_CONFIG_PATH,
    PRODUCER_SURFACES,
    parseArgs,
    duplicateValues,
    targetEnvLooksSafe,
    routeKey,
    classifyRoute,
    classifyProducerSurface,
    classifyNotificationPolicyStatus,
    classifyNotificationPolicyStatusEvent,
    buildNotificationPolicyStatus,
    renderMarkdown,
  },
};
