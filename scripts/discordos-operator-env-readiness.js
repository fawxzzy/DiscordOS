const {
  _internals: updateTargetInternals,
} = require("./discord-update-target-admission");
const {
  _internals: alertTargetInternals,
} = require("./runtime-health-alert-target-admission");

function parseArgs(args) {
  const options = {
    json: false,
  };

  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function classifyChannelId(value, missingReason, invalidReason) {
  const present = updateTargetInternals.hasValue(value);
  const shapeValid = updateTargetInternals.isSnowflake(value);
  const reasonCodes = [];

  if (!present) {
    reasonCodes.push(missingReason);
  } else if (!shapeValid) {
    reasonCodes.push(invalidReason);
  }

  return {
    present,
    shapeValid,
    reasonCodes,
  };
}

function classifySecretPresence(value, missingReason) {
  const present = updateTargetInternals.hasValue(value);
  return {
    present,
    reasonCodes: present ? [] : [missingReason],
  };
}

function classifyOperatorEnvReadiness(env = process.env) {
  const updatesChannel = classifyChannelId(
    env.DISCORDOS_UPDATES_CHANNEL_ID,
    "updates_channel_id_missing",
    "updates_channel_id_shape_invalid"
  );
  const alertChannel = classifyChannelId(
    env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID,
    "alert_channel_id_missing",
    "alert_channel_id_shape_invalid"
  );
  const botToken = classifySecretPresence(env.DISCORDOS_BOT_TOKEN, "bot_token_missing");
  const alertWebhook = alertTargetInternals.classifyWebhookUrl(
    env.DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL
  );
  const updatesTargetReady = updatesChannel.shapeValid && botToken.present;
  const alertTargetReady = alertWebhook.shapeValid || (alertChannel.shapeValid && botToken.present);
  const reasonCodes = [
    ...(updatesTargetReady ? [] : updatesChannel.reasonCodes),
    ...(updatesTargetReady || botToken.present ? [] : botToken.reasonCodes),
    ...(alertTargetReady ? [] : alertWebhook.present ? alertWebhook.reasonCodes : alertChannel.reasonCodes),
    ...(alertTargetReady || alertWebhook.shapeValid || botToken.present ? [] : botToken.reasonCodes),
  ];

  return {
    ok: updatesTargetReady && alertTargetReady,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: updatesTargetReady && alertTargetReady ? "ready" : "blocked",
    updates: {
      targetReady: updatesTargetReady,
      channelPresent: updatesChannel.present,
      channelShapeValid: updatesChannel.shapeValid,
      botTokenPresent: botToken.present,
    },
    alerts: {
      targetReady: alertTargetReady,
      webhookPresent: alertWebhook.present,
      webhookShapeValid: alertWebhook.shapeValid,
      channelPresent: alertChannel.present,
      channelShapeValid: alertChannel.shapeValid,
      botTokenPresent: botToken.present,
      targetMode: alertWebhook.present ? "discord_webhook" : alertChannel.present ? "discord_bot_channel" : "none",
    },
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function classifyOperatorEnvReadinessEvent(result) {
  return {
    type: result.ok
      ? "discordos.operator.env_ready"
      : "discordos.operator.env_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.operator.env",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      updatesTargetReady: result.updates.targetReady,
      alertTargetReady: result.alerts.targetReady,
      alertTargetMode: result.alerts.targetMode,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function buildDiscordOSOperatorEnvReadiness({ env = process.env } = {}) {
  const result = classifyOperatorEnvReadiness(env);
  return {
    ...result,
    event: classifyOperatorEnvReadinessEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Operator Env Readiness",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- updates target ready: \`${result.updates.targetReady ? "true" : "false"}\``,
    `- updates channel present: \`${result.updates.channelPresent ? "true" : "false"}\``,
    `- updates channel shape valid: \`${result.updates.channelShapeValid ? "true" : "false"}\``,
    `- alerts target ready: \`${result.alerts.targetReady ? "true" : "false"}\``,
    `- alerts target mode: \`${result.alerts.targetMode}\``,
    `- alerts webhook present: \`${result.alerts.webhookPresent ? "true" : "false"}\``,
    `- alerts webhook shape valid: \`${result.alerts.webhookShapeValid ? "true" : "false"}\``,
    `- alerts channel present: \`${result.alerts.channelPresent ? "true" : "false"}\``,
    `- alerts channel shape valid: \`${result.alerts.channelShapeValid ? "true" : "false"}\``,
    `- bot token present: \`${result.updates.botTokenPresent ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildDiscordOSOperatorEnvReadiness();
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
    classifyChannelId,
    classifySecretPresence,
    classifyOperatorEnvReadiness,
    classifyOperatorEnvReadinessEvent,
    buildDiscordOSOperatorEnvReadiness,
    renderMarkdown,
  },
};
