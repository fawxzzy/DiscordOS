const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/atlas-health-status");
const { _internals: watchInternals } = require("../scripts/atlas-health-watch");

function configEnv(targets, schedule = { cron: "0 16 * * *" }) {
  return {
    DISCORDOS_ATLAS_HEALTH_TARGETS_JSON: JSON.stringify({
      version: 1,
      schedule,
      targets,
    }),
  };
}

test("atlas health status args default to no-send status surface", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    configPath: watchInternals.DEFAULT_CONFIG_PATH,
    timeoutMs: watchInternals.DEFAULT_TIMEOUT_MS,
  });
});

test("atlas health status passes when watch is green and alert path is armed", async () => {
  const status = await _internals.buildAtlasHealthStatus({
    env: {
      ...configEnv([
        {
          id: "discordos",
          label: "DiscordOS",
          owner: "DiscordOS",
          url: "https://example.test/api/runtime-health",
          kind: "json-ok",
        },
      ]),
      DISCORDOS_ATLAS_HEALTH_WATCH_ENABLED: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_SEND: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID: "123",
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    now: new Date("2026-06-14T16:00:00.000Z"),
  });

  assert.equal(status.ok, true);
  assert.equal(status.sendsMessages, false);
  assert.equal(status.watch.targetCount, 1);
  assert.equal(status.watch.criticalCount, 0);
  assert.equal(status.watch.cadenceStatus, "checked");
  assert.equal(status.watch.skipped, false);
  assert.deepEqual(status.watch.runDays, []);
  assert.equal(status.watch.timezone, "UTC");
  assert.equal(status.alertReadiness.ready, true);
  assert.deepEqual(status.nextActions, ["continue_atlas_health_monitoring"]);
  assert.equal(status.event.type, "atlas.health_status.ready");
  assert.equal(status.event.dimensions.cadenceStatus, "checked");
  assert.equal(status.event.dimensions.skipped, false);
});

test("atlas health status explains when weekday schedule is not due", async () => {
  const status = await _internals.buildAtlasHealthStatus({
    env: {
      ...configEnv(
        [
          {
            id: "discordos",
            label: "DiscordOS",
            owner: "DiscordOS",
            url: "https://example.test/api/runtime-health",
            kind: "json-ok",
          },
        ],
        {
          cron: "0 16 * * 1-5",
          timezone: "UTC",
        }
      ),
      DISCORDOS_ATLAS_HEALTH_WATCH_ENABLED: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_SEND: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID: "123",
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async () => {
      throw new Error("weekday-scheduled status should not fetch targets on saturday");
    },
    now: new Date("2026-06-13T16:00:00.000Z"),
  });

  assert.equal(status.ok, true);
  assert.equal(status.watch.ok, true);
  assert.equal(status.watch.cadenceStatus, "schedule_not_due");
  assert.equal(status.watch.skipped, true);
  assert.equal(status.watch.skipReason, "atlas_health_schedule_not_due");
  assert.deepEqual(status.watch.runDays, [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ]);
  assert.equal(status.watch.targetCount, 1);
  assert.equal(status.watch.passCount, 0);
  assert.equal(status.watch.failCount, 0);
  assert.equal(status.watch.usageEstimate.targetChecksPerMonth, 21);
  assert.deepEqual(status.nextActions, ["continue_atlas_health_monitoring"]);
  assert.equal(status.event.dimensions.cadenceStatus, "schedule_not_due");
  assert.equal(status.event.dimensions.skipped, true);
});

test("atlas health status reports missing env flags without failing target health", async () => {
  const status = await _internals.buildAtlasHealthStatus({
    env: configEnv([
      {
        id: "foundation",
        label: "Foundation",
        owner: "Foundation",
        url: "https://example.test",
        kind: "http-ok",
      },
    ]),
    fetchImpl: async () => new Response("<html></html>", { status: 200 }),
  });

  assert.equal(status.watch.ok, true);
  assert.equal(status.ok, false);
  assert.deepEqual(status.alertReadiness.reasonCodes, [
    "atlas_health_watch_env_disabled",
    "atlas_health_alert_send_env_disabled",
    "atlas_health_alert_target_missing",
  ]);
  assert.deepEqual(status.nextActions, [
    "enable_discordos_atlas_health_watch_env",
    "enable_discordos_atlas_health_alert_send_env",
    "configure_atlas_health_alert_target",
  ]);
});

test("atlas health status flags critical targets without sending alerts", async () => {
  const requests = [];
  const status = await _internals.buildAtlasHealthStatus({
    env: {
      ...configEnv([
        {
          id: "trove",
          label: "Trove",
          owner: "Trove",
          url: "https://example.test",
          kind: "http-ok",
        },
      ]),
      DISCORDOS_ATLAS_HEALTH_WATCH_ENABLED: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_SEND: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID: "123",
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async (url) => {
      requests.push(String(url));
      return new Response("server error", { status: 500 });
    },
  });

  assert.equal(status.ok, false);
  assert.equal(status.watch.criticalCount, 1);
  assert.deepEqual(status.nextActions, ["inspect_critical_atlas_health_targets"]);
  assert.equal(status.watch.alertDeliveryDryRunStatus, "dry_run");
  assert(!requests.some((url) => url.includes("/channels/123/messages")));
});

test("atlas health status reports active target filters and reduced usage", async () => {
  const status = await _internals.buildAtlasHealthStatus({
    env: {
      ...configEnv([
        {
          id: "discordos",
          label: "DiscordOS",
          owner: "DiscordOS",
          url: "https://example.test/api/runtime-health",
          kind: "json-ok",
        },
        {
          id: "fitness",
          label: "Fitness",
          owner: "Fitness",
          url: "https://fitness.example.test",
          kind: "http-ok",
        },
        {
          id: "trove",
          label: "Trove",
          owner: "Trove",
          url: "https://trove.example.test",
          kind: "http-ok",
        },
      ], {
        cron: "0 16 * * 1-5",
        timezone: "UTC",
      }),
      DISCORDOS_ATLAS_HEALTH_TARGET_ALLOWLIST: "discordos,fitness",
      DISCORDOS_ATLAS_HEALTH_WATCH_ENABLED: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_SEND: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID: "123",
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async (url) => {
      if (String(url).endsWith("/api/runtime-health")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("<html></html>", { status: 200 });
    },
    now: new Date("2026-06-15T16:00:00.000Z"),
  });

  assert.equal(status.ok, true);
  assert.equal(status.watch.targetCount, 2);
  assert.equal(status.watch.targetFilter.active, true);
  assert.equal(status.watch.targetFilter.originalTargetCount, 3);
  assert.deepEqual(status.watch.targetFilter.allowlistIds, ["discordos", "fitness"]);
  assert.equal(status.watch.usageEstimate.runsPerMonth, 21);
  assert.equal(status.watch.usageEstimate.targetChecksPerMonth, 42);
});

test("atlas health status accepts runtime health alert target fallback", () => {
  const readiness = _internals.buildAlertReadiness({
    env: {
      DISCORDOS_ATLAS_HEALTH_WATCH_ENABLED: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_SEND: "enabled",
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "123",
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.targetType, "discord_bot_channel");
  assert.deepEqual(readiness.reasonCodes, []);
});

test("atlas health status renders markdown without target values", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    event: {
      type: "atlas.health_status.ready",
      severity: "info",
    },
    nextActions: ["continue_atlas_health_monitoring"],
    watch: {
      ok: true,
      eventType: "atlas.health_watch.pass",
      cadenceStatus: "checked",
      skipped: false,
      skipReason: null,
      targetCount: 1,
      passCount: 1,
      failCount: 0,
      criticalCount: 0,
      criticalTargets: [],
      targetFilter: {
        active: true,
        originalTargetCount: 3,
        targetCount: 1,
        allowlistIds: ["discordos"],
        excludeIds: [],
        reasonCodes: ["atlas_health_target_filter_active"],
      },
      configuredSchedule: "0 16 * * *",
      runDays: [],
      timezone: "UTC",
      usageEstimate: {
        configuredSchedule: "0 16 * * *",
        runsPerMonth: 30,
        targetChecksPerMonth: 30,
      },
      alertDeliveryDryRunStatus: "skipped_clear",
      alertDeliveryDryRunReasonCodes: ["atlas_health_clear_delivery_not_requested"],
    },
    alertReadiness: {
      ready: true,
      watchEnabled: true,
      alertSendEnabled: true,
      targetConfigured: true,
      targetType: "discord_bot_channel",
      reasonCodes: [],
    },
  });

  assert(rendered.includes("# ATLAS Health Status"));
  assert(rendered.includes("Alert Readiness"));
  assert(rendered.includes("target filter active: `true`"));
  assert(rendered.includes("allowlist targets: `discordos`"));
  assert(!rendered.includes("bot-token"));
  assert(!rendered.includes("https://"));
});
