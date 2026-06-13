const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-alert-target-admission");

test("alert target admission args default to local validation only", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    probeLive: false,
  });
  assert.deepEqual(_internals.parseArgs(["--json", "--probe-live"]), {
    json: true,
    probeLive: true,
  });
});

test("alert target admission validates Discord webhook URL shape without returning values", () => {
  assert.deepEqual(_internals.classifyWebhookUrl(""), {
    present: false,
    shapeValid: false,
    reasonCodes: ["webhook_url_missing"],
  });
  assert.deepEqual(_internals.classifyWebhookUrl("not-a-url"), {
    present: true,
    shapeValid: false,
    reasonCodes: ["webhook_url_invalid"],
  });
  assert.deepEqual(_internals.classifyWebhookUrl("https://discord.com/api/webhooks/123456789012345678/token"), {
    present: true,
    shapeValid: true,
    reasonCodes: [],
  });
  assert.deepEqual(_internals.classifyWebhookUrl("http://discord.com/api/webhooks/123456789012345678/token"), {
    present: true,
    shapeValid: false,
    reasonCodes: ["webhook_url_shape_invalid"],
  });
});

test("alert target admission validates bot channel shape and token presence", () => {
  assert.deepEqual(_internals.classifyBotChannel({ channelId: "", token: "" }), {
    channelPresent: false,
    tokenPresent: false,
    channelShapeValid: false,
    shapeValid: false,
    reasonCodes: ["bot_channel_id_missing", "bot_token_missing"],
  });
  assert.deepEqual(_internals.classifyBotChannel({ channelId: "123", token: "bot-secret" }), {
    channelPresent: true,
    tokenPresent: true,
    channelShapeValid: false,
    shapeValid: false,
    reasonCodes: ["bot_channel_id_shape_invalid"],
  });
  assert.deepEqual(_internals.classifyBotChannel({
    channelId: "123456789012345678",
    token: "bot-secret",
  }), {
    channelPresent: true,
    tokenPresent: true,
    channelShapeValid: true,
    shapeValid: true,
    reasonCodes: [],
  });
});

test("alert target admission chooses webhook before bot-channel and masks values", () => {
  assert.deepEqual(_internals.getConfiguredTarget({}), {
    configured: false,
    type: "none",
    shapeValid: false,
    reasonCodes: ["alert_delivery_target_missing"],
  });
  assert.deepEqual(_internals.getConfiguredTarget({
    DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL:
      "https://discord.com/api/webhooks/123456789012345678/webhook-secret",
    DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "123456789012345678",
    DISCORDOS_BOT_TOKEN: "bot-secret",
  }), {
    configured: true,
    type: "discord_webhook",
    shapeValid: true,
    reasonCodes: [],
  });
});

test("alert target admission skips live probe by default", async () => {
  const result = await _internals.buildRuntimeHealthAlertTargetAdmission({
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL:
        "https://discord.com/api/webhooks/123456789012345678/webhook-secret",
    },
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.liveProbe.status, "skipped");
  assert.equal(result.event.type, "discordos.runtime_health.alert_target_admission_ready");
});

test("alert target admission can live-probe webhook with read-only GET", async () => {
  const result = await _internals.buildRuntimeHealthAlertTargetAdmission({
    probeLive: true,
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL:
        "https://discord.com/api/webhooks/123456789012345678/webhook-secret",
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://discord.com/api/webhooks/123456789012345678/webhook-secret");
      assert.equal(init.method, "GET");
      return {
        ok: true,
        status: 200,
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.liveProbe.attempted, true);
  assert.equal(result.liveProbe.httpStatus, 200);
});

test("alert target admission can live-probe bot channel with read-only GET", async () => {
  const result = await _internals.buildRuntimeHealthAlertTargetAdmission({
    probeLive: true,
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "123456789012345678",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, `${_internals.DISCORD_API_BASE}/channels/123456789012345678`);
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Authorization, "Bot bot-secret");
      return {
        ok: false,
        status: 403,
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.liveProbe.attempted, true);
  assert.equal(result.liveProbe.httpStatus, 403);
  assert.deepEqual(result.liveProbe.reasonCodes, ["bot_channel_probe_failed"]);
});

test("alert target admission renders markdown without secret values", async () => {
  const result = await _internals.buildRuntimeHealthAlertTargetAdmission({
    env: {
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL:
        "https://discord.com/api/webhooks/123456789012345678/webhook-secret",
    },
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Runtime Health Alert Target Admission"));
  assert(rendered.includes("target type: `discord_webhook`"));
  assert(!rendered.includes("webhook-secret"));
});
