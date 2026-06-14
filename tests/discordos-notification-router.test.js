const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-notification-router");

const config = {
  version: 1,
  routes: [
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
      id: "disabled-route",
      source: "disabled-source",
      type: "discordos.disabled",
      minSeverity: "info",
      target: "updates",
      targetEnv: "DISCORDOS_UPDATES_CHANNEL_ID",
      enabled: false,
    },
  ].map(_internals.normalizeRoute),
};

function fsFromConfig(payload = config) {
  return {
    readFile: async () => `${JSON.stringify(payload)}\n`,
  };
}

test("notification router args default to critical runtime health alert routing", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    source: "runtime-health",
    type: "discordos.runtime_health.alert_triggered",
    severity: "critical",
    configPath: _internals.DEFAULT_CONFIG_PATH,
  });
});

test("notification router parses source type severity and config path", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--source",
    "atlas-health",
    "--type",
    "atlas.health_watch.critical",
    "--severity",
    "warning",
    "--config",
    "config/custom.json",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.source, "atlas-health");
  assert.equal(parsed.type, "atlas.health_watch.critical");
  assert.equal(parsed.severity, "warning");
  assert(parsed.configPath.endsWith("config\\custom.json") || parsed.configPath.endsWith("config/custom.json"));
});

test("notification router validates severities", () => {
  assert.throws(() => _internals.normalizeSeverity("debug"), /invalid_severity:debug/);
  assert.equal(_internals.normalizeSeverity("Critical"), "critical");
  assert.equal(_internals.severityAllowed("critical", "warning"), true);
  assert.equal(_internals.severityAllowed("warning", "critical"), false);
});

test("notification router routes runtime critical alerts to alerts target", () => {
  const decision = _internals.resolveNotificationRoute({
    intent: {
      source: "runtime-health",
      type: "discordos.runtime_health.alert_triggered",
      severity: "critical",
    },
    config,
  });

  assert.equal(decision.status, "routed");
  assert.equal(decision.route.id, "runtime-health-critical-alert");
  assert.equal(decision.route.target, "alerts");
});

test("notification router blocks warning runtime alerts below critical route minimum", () => {
  const decision = _internals.resolveNotificationRoute({
    intent: {
      source: "runtime-health",
      type: "discordos.runtime_health.alert_triggered",
      severity: "warning",
    },
    config,
  });

  assert.equal(decision.status, "blocked");
  assert.deepEqual(decision.reasonCodes, ["notification_severity_below_route_minimum"]);
});

test("notification router routes update publications to updates target", () => {
  const decision = _internals.resolveNotificationRoute({
    intent: {
      source: "updates",
      type: "discordos.updates.publication",
      severity: "info",
    },
    config,
  });

  assert.equal(decision.status, "routed");
  assert.equal(decision.route.id, "updates-publication-info");
  assert.equal(decision.route.target, "updates");
});

test("notification router reports disabled and missing routes explicitly", () => {
  const disabled = _internals.resolveNotificationRoute({
    intent: {
      source: "disabled-source",
      type: "discordos.disabled",
      severity: "critical",
    },
    config,
  });
  const missing = _internals.resolveNotificationRoute({
    intent: {
      source: "unknown",
      type: "discordos.unknown",
      severity: "critical",
    },
    config,
  });

  assert.deepEqual(disabled.reasonCodes, ["notification_route_disabled"]);
  assert.deepEqual(missing.reasonCodes, ["notification_route_not_found"]);
});

test("notification router builds a no-send safe route decision", async () => {
  const result = await _internals.buildNotificationRouteDecision({
    source: "atlas-health",
    type: "atlas.health_watch.critical",
    severity: "critical",
    fsImpl: fsFromConfig(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.route.id, "atlas-health-critical-alert");
  assert.equal(result.route.targetEnv, "DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID");
  assert.equal(result.event.type, "discordos.notification.route_ready");
});

test("notification router renders markdown without target secret values", async () => {
  const result = await _internals.buildNotificationRouteDecision({
    source: "runtime-health",
    type: "discordos.runtime_health.alert_triggered",
    severity: "critical",
    fsImpl: fsFromConfig(),
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Notification Router"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("target env: `DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID`"));
  assert(!rendered.includes("bot-secret"));
  assert(!rendered.includes("https://discord.com/api/webhooks"));
});
