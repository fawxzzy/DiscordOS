const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "..", "config", "discordos-notification-routes.json");
const SEVERITIES = ["info", "warning", "critical"];
const DEFAULT_SOURCE = "runtime-health";
const DEFAULT_TYPE = "discordos.runtime_health.alert_triggered";
const DEFAULT_SEVERITY = "critical";

function parseArgs(args) {
  const options = {
    json: false,
    source: DEFAULT_SOURCE,
    type: DEFAULT_TYPE,
    severity: DEFAULT_SEVERITY,
    configPath: DEFAULT_CONFIG_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--source") {
      options.source = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--type") {
      options.type = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--severity") {
      options.severity = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--config") {
      options.configPath = path.resolve(requireValue(args, index, arg));
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function requireValue(args, index, arg) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`missing_value:${arg}`);
  }
  return value;
}

function normalizeToken(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`invalid_${fieldName}`);
  }
  return value.trim();
}

function normalizeSeverity(value) {
  const normalized = normalizeToken(value, "severity").toLowerCase();
  if (!SEVERITIES.includes(normalized)) {
    throw new Error(`invalid_severity:${normalized}`);
  }
  return normalized;
}

function normalizeNotificationIntent(intent) {
  return {
    source: normalizeToken(intent.source, "source").toLowerCase(),
    type: normalizeToken(intent.type, "type"),
    severity: normalizeSeverity(intent.severity),
  };
}

function normalizeRoute(route) {
  const normalized = {
    id: normalizeToken(route.id, "route_id"),
    source: normalizeToken(route.source, "route_source").toLowerCase(),
    type: normalizeToken(route.type, "route_type"),
    minSeverity: normalizeSeverity(route.minSeverity || "critical"),
    target: normalizeToken(route.target, "route_target").toLowerCase(),
    targetEnv: normalizeToken(route.targetEnv, "route_target_env"),
    fallbackTargetEnv: route.fallbackTargetEnv ? normalizeToken(route.fallbackTargetEnv, "route_fallback_target_env") : null,
    enabled: route.enabled !== false,
  };

  if (!["alerts", "updates"].includes(normalized.target)) {
    throw new Error(`invalid_route_target:${normalized.target}`);
  }

  return normalized;
}

async function loadNotificationRouteConfig({ configPath = DEFAULT_CONFIG_PATH, fsImpl = fs } = {}) {
  const raw = await fsImpl.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.routes)) {
    throw new Error("invalid_notification_route_config");
  }

  return {
    version: 1,
    routes: parsed.routes.map(normalizeRoute),
  };
}

function severityRank(severity) {
  const rank = SEVERITIES.indexOf(severity);
  if (rank === -1) {
    throw new Error(`invalid_severity:${severity}`);
  }
  return rank;
}

function severityAllowed(intentSeverity, minSeverity) {
  return severityRank(intentSeverity) >= severityRank(minSeverity);
}

function routeMatchesIdentity(route, intent) {
  return route.source === intent.source && (route.type === intent.type || route.type === "*");
}

function resolveNotificationRoute({ intent, config }) {
  const normalizedIntent = normalizeNotificationIntent(intent);
  const identityMatches = config.routes.filter((route) => routeMatchesIdentity(route, normalizedIntent));
  const route = identityMatches.find((candidate) =>
    candidate.enabled && severityAllowed(normalizedIntent.severity, candidate.minSeverity)
  );

  if (route) {
    return {
      status: "routed",
      route,
      reasonCodes: [],
    };
  }

  if (identityMatches.some((candidate) => !candidate.enabled)) {
    return {
      status: "blocked",
      route: null,
      reasonCodes: ["notification_route_disabled"],
    };
  }

  if (identityMatches.length > 0) {
    return {
      status: "blocked",
      route: null,
      reasonCodes: ["notification_severity_below_route_minimum"],
    };
  }

  return {
    status: "blocked",
    route: null,
    reasonCodes: ["notification_route_not_found"],
  };
}

function classifyNotificationRouterEvent(result) {
  return {
    type: result.ok
      ? "discordos.notification.route_ready"
      : "discordos.notification.route_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.notification_router",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      source: result.intent.source,
      notificationType: result.intent.type,
      notificationSeverity: result.intent.severity,
      routeId: result.route?.id || "none",
      target: result.route?.target || "none",
    },
  };
}

async function buildNotificationRouteDecision({
  source = DEFAULT_SOURCE,
  type = DEFAULT_TYPE,
  severity = DEFAULT_SEVERITY,
  configPath = DEFAULT_CONFIG_PATH,
  fsImpl = fs,
} = {}) {
  const config = await loadNotificationRouteConfig({ configPath, fsImpl });
  const intent = normalizeNotificationIntent({ source, type, severity });
  const decision = resolveNotificationRoute({ intent, config });
  const ok = decision.status === "routed";
  const result = {
    ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: ok ? "ready" : "blocked",
    intent,
    route: decision.route
      ? {
          id: decision.route.id,
          target: decision.route.target,
          targetEnv: decision.route.targetEnv,
          fallbackTargetEnv: decision.route.fallbackTargetEnv,
          minSeverity: decision.route.minSeverity,
        }
      : null,
    routeDecision: {
      status: decision.status,
      reasonCodes: decision.reasonCodes,
    },
    reasonCodes: decision.reasonCodes,
  };

  return {
    ...result,
    event: classifyNotificationRouterEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Notification Router",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- source: \`${result.intent.source}\``,
    `- notification type: \`${result.intent.type}\``,
    `- notification severity: \`${result.intent.severity}\``,
    `- route status: \`${result.routeDecision.status}\``,
    `- route id: \`${result.route?.id || "none"}\``,
    `- target: \`${result.route?.target || "none"}\``,
    `- target env: \`${result.route?.targetEnv || "none"}\``,
    `- fallback target env: \`${result.route?.fallbackTargetEnv || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildNotificationRouteDecision(options);
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
    SEVERITIES,
    parseArgs,
    normalizeSeverity,
    normalizeNotificationIntent,
    normalizeRoute,
    loadNotificationRouteConfig,
    severityRank,
    severityAllowed,
    resolveNotificationRoute,
    classifyNotificationRouterEvent,
    buildNotificationRouteDecision,
    renderMarkdown,
  },
};
