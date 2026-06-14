const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-alert-delivery");
const { _internals: proofInternals } = require("../scripts/runtime-health-proof");

function healthSnapshot({
  ok = true,
  generatedAt = "2026-06-13T04:00:00.000Z",
  readinessPercent = 100,
  blockedReasons = [],
} = {}) {
  return {
    ok,
    summary: {
      generatedAt,
      posture: ok ? "operational" : "action_required",
      readinessPercent,
      blockedReasons,
    },
    event: {
      type: ok ? "discordos.runtime_health.operational" : "discordos.runtime_health.action_required",
      severity: ok ? "info" : "warning",
    },
  };
}

async function writeJson(dir, fileName, payload) {
  await fs.writeFile(path.join(dir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("alert delivery args default to no-send runtime alert surface", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    suppressionDir: _internals.DEFAULT_SUPPRESSION_DIR,
    limit: 10,
    maxSnapshotAgeHours: 24,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    minDeliverySeverity: "critical",
    cooldownHours: 24,
    suppressRepeats: true,
    includeClear: false,
    drillCritical: false,
    send: false,
  });
});

test("alert delivery drill-critical is explicitly no-send", () => {
  const parsed = _internals.parseArgs(["--drill-critical"]);

  assert.equal(parsed.drillCritical, true);
  assert.equal(parsed.send, false);
  assert.throws(
    () => _internals.parseArgs(["--drill-critical", "--send"]),
    /drill_critical_is_no_send_only/
  );
});

test("alert delivery target detects webhook and bot-channel without returning secret values", () => {
  assert.deepEqual(_internals.getAlertDeliveryTarget({}), {
    configured: false,
    type: "none",
  });
  assert.deepEqual(
    _internals.getAlertDeliveryTarget({
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL: "https://example.invalid/webhook-secret",
    }),
    {
      configured: true,
      type: "discord_webhook",
    }
  );
  assert.deepEqual(
    _internals.getAlertDeliveryTarget({
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "123",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    }),
    {
      configured: true,
      type: "discord_bot_channel",
    }
  );
});

test("alert delivery skips clear alerts by default", async () => {
  const delivery = await _internals.deliverAlert({
    alert: {
      ok: true,
      severity: "ok",
      event: {
        status: "clear",
        reasonCodes: [],
      },
      summary: {
        latest: {
          posture: "operational",
          readinessPercent: 100,
          fresh: true,
        },
      },
    },
    target: {
      configured: false,
      type: "none",
    },
  });

  assert.equal(delivery.ok, true);
  assert.equal(delivery.status, "skipped_clear");
  assert.equal(delivery.sent, false);
});

test("alert delivery blocks active alerts without a configured target", async () => {
  const delivery = await _internals.deliverAlert({
    alert: {
      ok: false,
      severity: "critical",
      event: {
        status: "active",
        reasonCodes: ["runtime_health_blocked_reasons_present"],
      },
      summary: {
        latest: {
          posture: "action_required",
          readinessPercent: 83,
          fresh: true,
        },
      },
    },
    target: {
      configured: false,
      type: "none",
    },
  });

  assert.equal(delivery.ok, false);
  assert.equal(delivery.status, "blocked");
  assert.deepEqual(delivery.reasonCodes, ["alert_delivery_target_missing"]);
});

test("alert delivery dry-runs configured targets unless send is requested", async () => {
  const delivery = await _internals.deliverAlert({
    alert: {
      ok: false,
      severity: "critical",
      event: {
        status: "active",
        reasonCodes: ["runtime_health_blocked_reasons_present"],
      },
      summary: {
        latest: {
          posture: "action_required",
          readinessPercent: 83,
          fresh: true,
        },
      },
    },
    target: {
      configured: true,
      type: "discord_webhook",
    },
    send: false,
  });

  assert.equal(delivery.ok, true);
  assert.equal(delivery.status, "dry_run");
  assert.equal(delivery.sent, false);
  assert(delivery.messagePreview.includes("runtime_health_blocked_reasons_present"));
  assert.equal(delivery.payloadPreview.embeds[0].title, "DiscordOS Runtime Critical Alert");
  assert.equal(delivery.payloadPreview.embeds[0].color, _internals.CRITICAL_EMBED_COLOR);
  assert.equal(delivery.suppression.suppressed, false);
});

test("alert delivery can drill a synthetic critical payload without sending", async () => {
  const result = await _internals.buildRuntimeHealthAlertDelivery({
    drillCritical: true,
    includeClear: false,
    send: false,
    minDeliverySeverity: "critical",
    suppressRepeats: true,
    cooldownHours: 24,
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "123",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => {
      throw new Error("drill_should_not_send_network_request");
    },
    now: new Date("2026-06-14T04:00:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.drillCritical, true);
  assert.equal(result.sendRequested, false);
  assert.equal(result.alertDelivered, false);
  assert.equal(result.alert.severity, "critical");
  assert.equal(result.alert.status, "active");
  assert.deepEqual(result.alert.reasonCodes, ["runtime_health_alert_drill"]);
  assert.equal(result.delivery.status, "dry_run");
  assert.equal(result.delivery.targetType, "discord_bot_channel");
  assert.equal(result.delivery.sent, false);
  assert.equal(result.delivery.payloadPreview.embeds[0].title, "DiscordOS Runtime Critical Alert");
  assert.equal(result.event.dimensions.drillCritical, true);
});

test("alert delivery skips warning alerts by default", async () => {
  const delivery = await _internals.deliverAlert({
    alert: {
      ok: false,
      severity: "warning",
      event: {
        status: "active",
        reasonCodes: ["runtime_health_latest_stale"],
      },
      summary: {
        latest: {
          posture: "operational",
          readinessPercent: 100,
          fresh: false,
        },
      },
    },
    target: {
      configured: true,
      type: "discord_webhook",
    },
    send: true,
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(delivery.ok, true);
  assert.equal(delivery.status, "skipped_non_critical");
  assert.equal(delivery.sent, false);
  assert.deepEqual(delivery.reasonCodes, ["alert_below_delivery_threshold"]);
});

test("alert delivery can dry-run warnings when threshold is explicitly lowered", async () => {
  const delivery = await _internals.deliverAlert({
    alert: {
      ok: false,
      severity: "warning",
      event: {
        status: "active",
        reasonCodes: ["runtime_health_latest_stale"],
      },
      summary: {
        latest: {
          posture: "operational",
          readinessPercent: 100,
          fresh: false,
        },
      },
    },
    target: {
      configured: true,
      type: "discord_webhook",
    },
    minDeliverySeverity: "warning",
    send: false,
  });

  assert.equal(delivery.ok, true);
  assert.equal(delivery.status, "dry_run");
  assert.equal(delivery.sent, false);
});

test("alert delivery sends webhook embed payload with mentions disabled", async () => {
  const payload = _internals.buildDiscordAlertPayload({
    severity: "critical",
    event: {
      reasonCodes: ["runtime_health_blocked_reasons_present"],
    },
    summary: {
      latest: {
        posture: "action_required",
        readinessPercent: 83,
        fresh: true,
        blockedReasons: ["discord_bot_not_verified"],
      },
    },
  });
  const result = await _internals.sendDiscordWebhook({
    webhookUrl: "https://example.invalid/webhook-secret",
    payload,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://example.invalid/webhook-secret");
      assert.equal(init.method, "POST");
      assert.equal(init.headers["Content-Type"], "application/json");
      const parsed = JSON.parse(init.body);
      assert.equal(parsed.content, null);
      assert.equal(parsed.embeds[0].title, "DiscordOS Runtime Critical Alert");
      assert.equal(parsed.embeds[0].color, _internals.CRITICAL_EMBED_COLOR);
      assert.deepEqual(parsed.allowed_mentions, { parse: [] });
      return {
        ok: true,
        status: 204,
      };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    status: 204,
  });
});

test("alert delivery sends bot-channel embed payload with bot authorization", async () => {
  const payload = _internals.buildDiscordAlertPayload({
    severity: "critical",
    event: {
      reasonCodes: ["runtime_health_blocked_reasons_present"],
    },
    summary: {
      latest: {
        posture: "action_required",
        readinessPercent: 83,
        fresh: true,
        blockedReasons: ["discord_bot_not_verified"],
      },
    },
  });
  const result = await _internals.sendDiscordBotChannel({
    channelId: "123",
    token: "bot-secret",
    payload,
    fetchImpl: async (url, init) => {
      assert.equal(url, `${_internals.DISCORD_API_BASE}/channels/123/messages`);
      assert.equal(init.headers.Authorization, "Bot bot-secret");
      const parsed = JSON.parse(init.body);
      assert.equal(parsed.embeds[0].title, "DiscordOS Runtime Critical Alert");
      assert.deepEqual(parsed.allowed_mentions, { parse: [] });
      return {
        ok: true,
        status: 200,
      };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    status: 200,
  });
});

test("alert delivery records sent critical alerts and suppresses exact repeats", async () => {
  const suppressionDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-alert-suppression-"));
  const alert = {
    ok: false,
    severity: "critical",
    event: {
      status: "active",
      reasonCodes: ["runtime_health_blocked_reasons_present"],
    },
    summary: {
      latest: {
        posture: "action_required",
        readinessPercent: 83,
        fresh: true,
        blockedReasons: ["discord_bot_not_verified"],
      },
    },
  };

  let sends = 0;
  const first = await _internals.deliverAlert({
    alert,
    target: {
      configured: true,
      type: "discord_webhook",
    },
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL: "https://example.invalid/webhook-secret",
    },
    send: true,
    suppressionDir,
    now: new Date("2026-06-13T05:00:00.000Z"),
    fetchImpl: async () => {
      sends += 1;
      return {
        ok: true,
        status: 204,
      };
    },
  });

  assert.equal(first.ok, true);
  assert.equal(first.status, "sent");
  assert.equal(first.sent, true);
  assert.equal(first.suppression.recordWritten, true);
  assert.equal(first.suppression.lastSentAt, "2026-06-13T05:00:00.000Z");

  const repeat = await _internals.deliverAlert({
    alert,
    target: {
      configured: true,
      type: "discord_webhook",
    },
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL: "https://example.invalid/webhook-secret",
    },
    send: true,
    suppressionDir,
    now: new Date("2026-06-13T05:05:00.000Z"),
    fetchImpl: async () => {
      throw new Error("repeat_send_should_not_run");
    },
  });

  assert.equal(repeat.ok, true);
  assert.equal(repeat.status, "suppressed_repeat");
  assert.equal(repeat.sent, false);
  assert.deepEqual(repeat.reasonCodes, ["alert_repeat_suppressed"]);
  assert.equal(sends, 1);
});

test("alert delivery allows changed critical alert fingerprints during cooldown", async () => {
  const suppressionDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-alert-suppression-"));
  const original = {
    ok: false,
    severity: "critical",
    event: {
      status: "active",
      reasonCodes: ["runtime_health_blocked_reasons_present"],
    },
    summary: {
      latest: {
        posture: "action_required",
        readinessPercent: 83,
        fresh: true,
        blockedReasons: ["discord_bot_not_verified"],
      },
    },
  };
  const changed = {
    ...original,
    event: {
      status: "active",
      reasonCodes: ["runtime_health_latest_failed"],
    },
  };

  let sends = 0;
  const fetchImpl = async () => {
    sends += 1;
    return {
      ok: true,
      status: 204,
    };
  };

  await _internals.deliverAlert({
    alert: original,
    target: {
      configured: true,
      type: "discord_webhook",
    },
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL: "https://example.invalid/webhook-secret",
    },
    send: true,
    suppressionDir,
    now: new Date("2026-06-13T05:00:00.000Z"),
    fetchImpl,
  });
  const second = await _internals.deliverAlert({
    alert: changed,
    target: {
      configured: true,
      type: "discord_webhook",
    },
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL: "https://example.invalid/webhook-secret",
    },
    send: true,
    suppressionDir,
    now: new Date("2026-06-13T05:05:00.000Z"),
    fetchImpl,
  });

  assert.equal(second.status, "sent");
  assert.equal(sends, 2);
});

test("alert delivery allows repeated critical alerts after cooldown expires", async () => {
  const suppressionDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-alert-suppression-"));
  const alert = {
    ok: false,
    severity: "critical",
    event: {
      status: "active",
      reasonCodes: ["runtime_health_blocked_reasons_present"],
    },
    summary: {
      latest: {
        posture: "action_required",
        readinessPercent: 83,
        fresh: true,
        blockedReasons: ["discord_bot_not_verified"],
      },
    },
  };

  let sends = 0;
  const fetchImpl = async () => {
    sends += 1;
    return {
      ok: true,
      status: 204,
    };
  };

  await _internals.deliverAlert({
    alert,
    target: {
      configured: true,
      type: "discord_webhook",
    },
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL: "https://example.invalid/webhook-secret",
    },
    send: true,
    suppressionDir,
    cooldownHours: 1,
    now: new Date("2026-06-13T05:00:00.000Z"),
    fetchImpl,
  });
  const second = await _internals.deliverAlert({
    alert,
    target: {
      configured: true,
      type: "discord_webhook",
    },
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL: "https://example.invalid/webhook-secret",
    },
    send: true,
    suppressionDir,
    cooldownHours: 1,
    now: new Date("2026-06-13T06:01:00.000Z"),
    fetchImpl,
  });

  assert.equal(second.status, "sent");
  assert.equal(sends, 2);
});

test("alert delivery builds from runtime-health snapshots", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-alert-delivery-"));
  await writeJson(snapshotDir, "2026-06-13T04-00-00-000Z-pass.json", healthSnapshot());

  const result = await _internals.buildRuntimeHealthAlertDelivery({
    snapshotDir,
    limit: 10,
    maxSnapshotAgeHours: 24,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    minDeliverySeverity: "critical",
    includeClear: false,
    send: false,
    env: {},
    now: new Date("2026-06-13T04:05:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.alert.status, "clear");
  assert.equal(result.delivery.status, "skipped_clear");
  assert.equal(result.event.type, "discordos.runtime_health.alert_delivery_ready");
});

test("alert delivery renders markdown without target values", () => {
  const rendered = _internals.renderMarkdown({
    ok: false,
    destructive: false,
    sendRequested: true,
    drillCritical: false,
    alertDelivered: false,
    minDeliverySeverity: "critical",
    suppressRepeats: true,
    cooldownHours: 24,
    event: {
      type: "discordos.runtime_health.alert_delivery_blocked",
      severity: "error",
    },
    alert: {
      severity: "critical",
      status: "active",
      reasonCodes: ["runtime_health_blocked_reasons_present"],
    },
    delivery: {
      status: "blocked",
      targetType: "none",
      reasonCodes: ["alert_delivery_target_missing"],
    },
  });

  assert(rendered.includes("# DiscordOS Runtime Health Alert Delivery"));
  assert(rendered.includes("delivery status: `blocked`"));
  assert(!rendered.includes("webhook-secret"));
});
