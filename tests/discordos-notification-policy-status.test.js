const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-notification-policy-status");
const { _internals: routerInternals } = require("../scripts/discordos-notification-router");

const baseRoutes = [
  {
    id: "runtime-health-critical-alert",
    source: "runtime-health",
    type: "discordos.runtime_health.alert_triggered",
    minSeverity: "critical",
    target: "alerts",
    targetEnv: "DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID",
    fallbackTargetEnv: "DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL",
    enabled: true,
  },
  {
    id: "atlas-health-critical-alert",
    source: "atlas-health",
    type: "atlas.health_watch.critical",
    minSeverity: "critical",
    target: "alerts",
    targetEnv: "DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID",
    fallbackTargetEnv: "DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID",
    enabled: true,
  },
  {
    id: "updates-publication-info",
    source: "updates",
    type: "discordos.updates.publication",
    minSeverity: "info",
    target: "updates",
    targetEnv: "DISCORDOS_UPDATES_CHANNEL_ID",
    enabled: true,
  },
  {
    id: "forum-card-lifecycle-info",
    source: "forum-card",
    type: "discordos.forum_card.lifecycle",
    minSeverity: "info",
    target: "updates",
    targetEnv: "DISCORDOS_UPDATES_CHANNEL_ID",
    enabled: true,
  },
].map(routerInternals.normalizeRoute);

function config(routes = baseRoutes) {
  return {
    version: 1,
    routes,
  };
}

function fsFromConfig(payload = config()) {
  return {
    readFile: async () => `${JSON.stringify(payload)}\n`,
  };
}

test("notification policy status args default to committed route config", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    configPath: _internals.DEFAULT_CONFIG_PATH,
  });
});

test("notification policy status parses json and config path", () => {
  const parsed = _internals.parseArgs(["--json", "--config", "config/custom-routes.json"]);

  assert.equal(parsed.json, true);
  assert(parsed.configPath.endsWith("config\\custom-routes.json") || parsed.configPath.endsWith("config/custom-routes.json"));
});

test("notification policy status classifies ready routes and attached producers", async () => {
  const result = await _internals.buildNotificationPolicyStatus({
    fsImpl: fsFromConfig(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.routeCount, 4);
  assert.equal(result.enabledRouteCount, 4);
  assert.equal(result.alertsRouteCount, 2);
  assert.equal(result.updatesRouteCount, 2);
  assert.equal(result.attachedProducerCount, 4);
  assert.equal(result.readyAttachedProducerCount, 4);
  assert.equal(result.reservedProducerCount, 1);
  assert.equal(result.event.type, "discordos.notification.policy_ready");
});

test("notification policy status blocks duplicate route identities", () => {
  const result = _internals.classifyNotificationPolicyStatus(config([
    ...baseRoutes,
    routerInternals.normalizeRoute({
      id: "runtime-health-critical-alert-copy",
      source: "runtime-health",
      type: "discordos.runtime_health.alert_triggered",
      minSeverity: "critical",
      target: "alerts",
      targetEnv: "DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID",
      enabled: true,
    }),
  ]));

  assert.equal(result.ok, false);
  assert.deepEqual(result.duplicateRouteKeys, ["runtime-health:discordos.runtime_health.alert_triggered"]);
  assert(result.reasonCodes.includes("notification_route_keys_not_unique"));
});

test("notification policy status blocks unsafe alert route severity and env names", () => {
  const result = _internals.classifyNotificationPolicyStatus(config([
    routerInternals.normalizeRoute({
      id: "runtime-health-warning-alert",
      source: "runtime-health",
      type: "discordos.runtime_health.alert_triggered",
      minSeverity: "warning",
      target: "alerts",
      targetEnv: "DISCORD_BOT_TOKEN",
      enabled: true,
    }),
  ]));

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("alert_route_min_severity_not_critical"));
  assert(result.reasonCodes.includes("route_target_env_name_not_safe"));
});

test("notification policy status renders markdown without secret target values", async () => {
  const result = await _internals.buildNotificationPolicyStatus({
    fsImpl: fsFromConfig(),
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Notification Policy Status"));
  assert(rendered.includes("attached producers: `4/4`"));
  assert(rendered.includes("runtime-health-critical-alert"));
  assert(rendered.includes("discord-update-post"));
  assert(!rendered.includes("bot-secret"));
  assert(!rendered.includes("https://discord.com/api/webhooks"));
});
