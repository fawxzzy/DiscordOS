const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-operator-env-readiness");

test("operator env readiness args default to markdown output", () => {
  assert.deepEqual(_internals.parseArgs([]), { json: false });
  assert.deepEqual(_internals.parseArgs(["--json"]), { json: true });
});

test("operator env readiness blocks without target env", () => {
  const result = _internals.buildDiscordOSOperatorEnvReadiness({ env: {} });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.updates.targetReady, false);
  assert.equal(result.alerts.targetReady, false);
  assert(result.reasonCodes.includes("updates_channel_id_missing"));
  assert(result.reasonCodes.includes("bot_token_missing"));
});

test("operator env readiness accepts normalized bot-channel targets", () => {
  const result = _internals.buildDiscordOSOperatorEnvReadiness({
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "\u00EF\u00BB\u00BF1504671871512346695\\r\\n",
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "\uFEFF1515220075366580224\\n",
      DISCORDOS_BOT_TOKEN: " bot-secret\\n",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.updates.channelShapeValid, true);
  assert.equal(result.alerts.channelShapeValid, true);
  assert.equal(result.alerts.targetMode, "discord_bot_channel");
  assert.deepEqual(result.reasonCodes, []);
});

test("operator env readiness allows webhook alert target without bot token for alerts", () => {
  const result = _internals.buildDiscordOSOperatorEnvReadiness({
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL:
        "https://discord.com/api/webhooks/1515220075366580224/webhook-secret",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.alerts.targetMode, "discord_webhook");
});

test("operator env readiness reports empty pulled token separately from channel shape", () => {
  const result = _internals.buildDiscordOSOperatorEnvReadiness({
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "\u00EF\u00BB\u00BF1504671871512346695\\r\\n",
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "1515220075366580224",
      DISCORDOS_BOT_TOKEN: "",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.updates.channelShapeValid, true);
  assert.equal(result.alerts.channelShapeValid, true);
  assert.deepEqual(result.reasonCodes, ["bot_token_missing"]);
});

test("operator env readiness renders markdown without target values", () => {
  const result = _internals.buildDiscordOSOperatorEnvReadiness({
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "1515220075366580224",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Operator Env Readiness"));
  assert(rendered.includes("updates target ready: `true`"));
  assert(!rendered.includes("1504671871512346695"));
  assert(!rendered.includes("1515220075366580224"));
  assert(!rendered.includes("bot-secret"));
});
