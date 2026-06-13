const DISCORD_API_BASE = "https://discord.com/api/v10";

function parseArgs(args) {
  const options = {
    json: false,
    probeLive: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--probe-live") {
      options.probeLive = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function normalizeEnvValue(value) {
  return String(value || "")
    .replace(/^\u00EF\u00BB\u00BF/, "")
    .replace(/^\uFEFF/, "")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .trim();
}

function hasValue(value) {
  return normalizeEnvValue(value).length > 0;
}

function isSnowflake(value) {
  return /^\d{17,20}$/.test(normalizeEnvValue(value));
}

function classifyWebhookUrl(value) {
  if (!hasValue(value)) {
    return {
      present: false,
      shapeValid: false,
      reasonCodes: ["webhook_url_missing"],
    };
  }

  let parsed;
  try {
    parsed = new URL(normalizeEnvValue(value));
  } catch {
    return {
      present: true,
      shapeValid: false,
      reasonCodes: ["webhook_url_invalid"],
    };
  }

  const hostAllowed = parsed.hostname === "discord.com" || parsed.hostname === "discordapp.com";
  const pathValid = /^\/api\/webhooks\/\d{17,20}\/[^/]+$/.test(parsed.pathname);
  return {
    present: true,
    shapeValid: hostAllowed && pathValid && parsed.protocol === "https:",
    reasonCodes: hostAllowed && pathValid && parsed.protocol === "https:"
      ? []
      : ["webhook_url_shape_invalid"],
  };
}

function classifyBotChannel({ channelId, token }) {
  const channelPresent = hasValue(channelId);
  const tokenPresent = hasValue(token);
  const channelShapeValid = isSnowflake(channelId);

  const reasonCodes = [];
  if (!channelPresent) {
    reasonCodes.push("bot_channel_id_missing");
  } else if (!channelShapeValid) {
    reasonCodes.push("bot_channel_id_shape_invalid");
  }

  if (!tokenPresent) {
    reasonCodes.push("bot_token_missing");
  }

  return {
    channelPresent,
    tokenPresent,
    channelShapeValid,
    shapeValid: channelPresent && tokenPresent && channelShapeValid,
    reasonCodes,
  };
}

function getConfiguredTarget(env = process.env) {
  const webhook = classifyWebhookUrl(env.DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL);
  if (webhook.present) {
    return {
      configured: webhook.shapeValid,
      type: "discord_webhook",
      shapeValid: webhook.shapeValid,
      reasonCodes: webhook.reasonCodes,
    };
  }

  const botChannel = classifyBotChannel({
    channelId: env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID,
    token: env.DISCORDOS_BOT_TOKEN,
  });
  if (botChannel.channelPresent || botChannel.tokenPresent) {
    return {
      configured: botChannel.shapeValid,
      type: "discord_bot_channel",
      shapeValid: botChannel.shapeValid,
      reasonCodes: botChannel.reasonCodes,
    };
  }

  return {
    configured: false,
    type: "none",
    shapeValid: false,
    reasonCodes: ["alert_delivery_target_missing"],
  };
}

async function probeDiscordTarget({ target, env = process.env, fetchImpl = fetch }) {
  if (!target.configured) {
    return {
      attempted: false,
      ok: false,
      status: "not_attempted",
      reasonCodes: ["target_not_configured"],
    };
  }

  if (target.type === "discord_webhook") {
    const response = await fetchImpl(env.DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL, {
      method: "GET",
    });
    return {
      attempted: true,
      ok: response.ok,
      status: response.ok ? "reachable" : "blocked",
      httpStatus: response.status,
      reasonCodes: response.ok ? [] : ["webhook_probe_failed"],
    };
  }

  const response = await fetchImpl(
    `${DISCORD_API_BASE}/channels/${normalizeEnvValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bot ${normalizeEnvValue(env.DISCORDOS_BOT_TOKEN)}`,
      },
    }
  );

  return {
    attempted: true,
    ok: response.ok,
    status: response.ok ? "reachable" : "blocked",
    httpStatus: response.status,
    reasonCodes: response.ok ? [] : ["bot_channel_probe_failed"],
  };
}

function skipLiveProbe() {
  return {
    attempted: false,
    ok: true,
    status: "skipped",
    reasonCodes: ["probe_live_flag_not_set"],
  };
}

function classifyAlertTargetAdmissionEvent(result) {
  return {
    type: result.ok
      ? "discordos.runtime_health.alert_target_admission_ready"
      : "discordos.runtime_health.alert_target_admission_blocked",
    severity: result.ok ? "info" : "error",
    subject: "discordos.runtime",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      targetType: result.target.type,
      targetConfigured: result.target.configured,
      targetShapeValid: result.target.shapeValid,
      liveProbeAttempted: result.liveProbe.attempted,
      liveProbeStatus: result.liveProbe.status,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildRuntimeHealthAlertTargetAdmission({
  env = process.env,
  probeLive = false,
  fetchImpl = fetch,
} = {}) {
  const target = getConfiguredTarget(env);
  const liveProbe = probeLive
    ? await probeDiscordTarget({ target, env, fetchImpl })
    : skipLiveProbe();
  const reasonCodes = [...target.reasonCodes, ...liveProbe.reasonCodes].filter(
    (reasonCode) => reasonCode !== "probe_live_flag_not_set"
  );
  const result = {
    ok: target.configured && target.shapeValid && liveProbe.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    probeLive,
    target,
    liveProbe,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyAlertTargetAdmissionEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Runtime Health Alert Target Admission",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- probe live: \`${result.probeLive ? "true" : "false"}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- target type: \`${result.target.type}\``,
    `- target configured: \`${result.target.configured ? "true" : "false"}\``,
    `- target shape valid: \`${result.target.shapeValid ? "true" : "false"}\``,
    `- live probe attempted: \`${result.liveProbe.attempted ? "true" : "false"}\``,
    `- live probe status: \`${result.liveProbe.status}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  if (typeof result.liveProbe.httpStatus === "number") {
    lines.push(`- live probe http status: \`${result.liveProbe.httpStatus}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildRuntimeHealthAlertTargetAdmission(options);
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
    DISCORD_API_BASE,
    parseArgs,
    normalizeEnvValue,
    isSnowflake,
    classifyWebhookUrl,
    classifyBotChannel,
    getConfiguredTarget,
    probeDiscordTarget,
    skipLiveProbe,
    classifyAlertTargetAdmissionEvent,
    buildRuntimeHealthAlertTargetAdmission,
    renderMarkdown,
  },
};
