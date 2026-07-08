const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-operator-env-readiness");

const READY_ENV = {
  DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
  DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "1515220075366580224",
  DISCORDOS_BOT_TOKEN: "bot-secret",
  DISCORDOS_FITNESS_VERIFY_ENDPOINT: "https://fitness.example.com/api/discord/verify",
  DISCORDOS_FITNESS_VERIFY_SECRET: "verification-secret",
  DISCORDOS_VERIFIED_ROLE_ID: "1515220075366580225",
};

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
  assert(result.reasonCodes.includes("fitness_verify_endpoint_missing"));
  assert(result.reasonCodes.includes("fitness_verify_secret_missing"));
  assert(result.reasonCodes.includes("fitness_verify_verified_role_id_missing"));
  assert.equal(result.readinessPlan.status, "action_required");
  assert(result.readinessPlan.nextActions.includes("configure_discordos_updates_channel_id"));
  assert(result.readinessPlan.nextActions.includes("load_discordos_bot_token"));
  assert(result.readinessPlan.nextActions.includes("configure_discordos_fitness_verify_endpoint"));
  assert(result.readinessPlan.nextActions.includes("load_discordos_fitness_verify_secret"));
});

test("operator env readiness accepts normalized bot-channel targets", () => {
  const result = _internals.buildDiscordOSOperatorEnvReadiness({
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "\u00EF\u00BB\u00BF1504671871512346695\\r\\n",
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "\uFEFF1515220075366580224\\n",
      DISCORDOS_BOT_TOKEN: " bot-secret\\n",
      DISCORDOS_FITNESS_VERIFY_ENDPOINT: "https://fitness.example.com/api/discord/verify",
      DISCORDOS_FITNESS_VERIFY_SECRET: "verification-secret",
      DISCORDOS_VERIFIED_ROLE_ID: "\uFEFF1515220075366580225\\n",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.updates.channelShapeValid, true);
  assert.equal(result.alerts.channelShapeValid, true);
  assert.equal(result.alerts.targetMode, "discord_bot_channel");
  assert.equal(result.fitnessVerify.targetReady, true);
  assert.equal(result.readinessPlan.status, "ready");
  assert.equal(result.readinessPlan.liveActionReadiness.updatesPostReady, true);
  assert.equal(result.readinessPlan.liveActionReadiness.criticalAlertDeliveryReady, true);
  assert.equal(result.readinessPlan.liveActionReadiness.fitnessVerifyReady, true);
  assert.deepEqual(result.reasonCodes, []);
});

test("operator env readiness allows webhook alert target without bot token for alerts", () => {
  const result = _internals.buildDiscordOSOperatorEnvReadiness({
    env: {
      ...READY_ENV,
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL:
        "https://discord.com/api/webhooks/1515220075366580224/webhook-secret",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.alerts.targetMode, "discord_webhook");
  assert.equal(result.readinessPlan.liveActionReadiness.alertUsesWebhook, true);
  assert.equal(result.readinessPlan.liveActionReadiness.alertUsesBotChannel, false);
});

test("operator env readiness reports empty pulled token separately from channel shape", () => {
  const result = _internals.buildDiscordOSOperatorEnvReadiness({
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "\u00EF\u00BB\u00BF1504671871512346695\\r\\n",
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "1515220075366580224",
      DISCORDOS_FITNESS_VERIFY_ENDPOINT: "https://fitness.example.com/api/discord/verify",
      DISCORDOS_FITNESS_VERIFY_SECRET: "verification-secret",
      DISCORDOS_VERIFIED_ROLE_ID: "1515220075366580225",
      DISCORDOS_BOT_TOKEN: "",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.updates.channelShapeValid, true);
  assert.equal(result.alerts.channelShapeValid, true);
  assert.equal(result.readinessPlan.blockedCheckCount, 3);
  assert.deepEqual(result.reasonCodes, ["bot_token_missing"]);
});

test("operator env readiness plan does not require bot token for webhook-only alerts", () => {
  const classified = _internals.classifyOperatorEnvReadiness({
    DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL:
      "https://discord.com/api/webhooks/1515220075366580224/webhook-secret",
  });
  const plan = _internals.buildOperatorEnvReadinessPlan(classified);
  const alertBotCheck = plan.checks.find((check) => check.id === "bot_token_for_alert_channel");

  assert.equal(alertBotCheck.ready, true);
  assert.equal(plan.liveActionReadiness.alertUsesWebhook, true);
  assert.equal(plan.liveActionReadiness.alertProbeReady, true);
  assert.equal(plan.liveActionReadiness.updatesPostReady, false);
});

test("operator env readiness renders markdown without target values", () => {
  const result = _internals.buildDiscordOSOperatorEnvReadiness({
    env: READY_ENV,
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Operator Env Readiness"));
  assert(rendered.includes("updates target ready: `true`"));
  assert(rendered.includes("fitness verify ready: `true`"));
  assert(rendered.includes("readiness plan: `ready`"));
  assert(!rendered.includes("1504671871512346695"));
  assert(!rendered.includes("1515220075366580224"));
  assert(!rendered.includes("1515220075366580225"));
  assert(!rendered.includes("bot-secret"));
  assert(!rendered.includes("verification-secret"));
  assert(!rendered.includes("fitness.example.com"));
});

test("operator env readiness blocks the Fitness verify path when bridge config is missing", () => {
  const result = _internals.buildDiscordOSOperatorEnvReadiness({
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "1515220075366580224",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.updates.targetReady, true);
  assert.equal(result.alerts.targetReady, true);
  assert.equal(result.fitnessVerify.targetReady, false);
  assert(result.reasonCodes.includes("fitness_verify_endpoint_missing"));
  assert(result.reasonCodes.includes("fitness_verify_secret_missing"));
  assert(result.reasonCodes.includes("fitness_verify_verified_role_id_missing"));
  assert(result.readinessPlan.nextActions.includes("configure_discordos_fitness_verify_endpoint"));
});

test("operator env readiness reports incomplete optional member-link storage as advisory", () => {
  const partial = _internals.buildDiscordOSOperatorEnvReadiness({
    env: {
      ...READY_ENV,
      DISCORDOS_SUPABASE_URL: "https://discordos.example.com",
    },
  });
  const complete = _internals.buildDiscordOSOperatorEnvReadiness({
    env: {
      ...READY_ENV,
      DISCORDOS_SUPABASE_URL: "https://discordos.example.com",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
  });

  assert.equal(partial.ok, true);
  assert.equal(partial.fitnessVerify.memberLinkReady, false);
  assert.deepEqual(partial.reasonCodes, []);
  assert(partial.readinessPlan.advisoryNextActions.includes(
    "configure_discordos_member_link_storage_or_leave_all_member_link_env_unset"
  ));
  assert.equal(complete.ok, true);
  assert.equal(complete.fitnessVerify.memberLinkReady, true);
  assert.deepEqual(complete.readinessPlan.advisoryNextActions, []);
});
