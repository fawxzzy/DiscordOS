const DISCORD_API_BASE = "https://discord.com/api/v10";
const DEFAULT_EXPECTED_CHANNEL_NAME = "updates";

function parseArgs(args) {
  const options = {
    json: false,
    probeLive: false,
    expectedName: DEFAULT_EXPECTED_CHANNEL_NAME,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--probe-live") {
      options.probeLive = true;
    } else if (arg === "--expected-name") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_expected_name_value");
      }
      options.expectedName = value.trim().toLowerCase();
      index += 1;
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

function classifyBotChannel({ channelId, token }) {
  const channelPresent = hasValue(channelId);
  const tokenPresent = hasValue(token);
  const channelShapeValid = isSnowflake(channelId);
  const reasonCodes = [];

  if (!channelPresent) {
    reasonCodes.push("updates_channel_id_missing");
  } else if (!channelShapeValid) {
    reasonCodes.push("updates_channel_id_shape_invalid");
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
  const botChannel = classifyBotChannel({
    channelId: env.DISCORDOS_UPDATES_CHANNEL_ID,
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
    reasonCodes: ["updates_target_missing"],
  };
}

function normalizeChannelName(value) {
  return String(value || "").trim().toLowerCase();
}

function classifyChannelProbeBody(body, expectedName = DEFAULT_EXPECTED_CHANNEL_NAME) {
  const name = normalizeChannelName(body?.name);
  const normalizedExpectedName = normalizeChannelName(expectedName);
  const reasonCodes = [];

  if (!name) {
    reasonCodes.push("updates_channel_name_missing");
  } else if (name === "alerts") {
    reasonCodes.push("updates_channel_points_to_alerts");
  } else if (name !== normalizedExpectedName) {
    reasonCodes.push("updates_channel_name_mismatch");
  }

  return {
    name: name || null,
    type: typeof body?.type === "number" ? body.type : null,
    guildId: typeof body?.guild_id === "string" ? body.guild_id : null,
    nameMatches: name === normalizedExpectedName,
    reasonCodes,
  };
}

async function probeDiscordUpdateTarget({
  target,
  expectedName = DEFAULT_EXPECTED_CHANNEL_NAME,
  env = process.env,
  fetchImpl = fetch,
}) {
  if (!target.configured) {
    return {
      attempted: false,
      ok: false,
      status: "not_attempted",
      reasonCodes: ["target_not_configured"],
    };
  }

  const response = await fetchImpl(
    `${DISCORD_API_BASE}/channels/${normalizeEnvValue(env.DISCORDOS_UPDATES_CHANNEL_ID)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bot ${normalizeEnvValue(env.DISCORDOS_BOT_TOKEN)}`,
      },
    }
  );
  const body = typeof response.json === "function" ? await response.json().catch(() => null) : null;
  const channel = response.ok ? classifyChannelProbeBody(body, expectedName) : null;
  const reasonCodes = response.ok
    ? channel.reasonCodes
    : ["updates_channel_probe_failed"];

  return {
    attempted: true,
    ok: response.ok && channel.nameMatches,
    status: response.ok && channel.nameMatches ? "reachable" : "blocked",
    httpStatus: response.status,
    channel,
    reasonCodes,
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

function classifyUpdateTargetAdmissionEvent(result) {
  return {
    type: result.ok
      ? "discordos.updates.target_admission_ready"
      : "discordos.updates.target_admission_blocked",
    severity: result.ok ? "info" : "error",
    subject: "discordos.updates",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      targetType: result.target.type,
      targetConfigured: result.target.configured,
      targetShapeValid: result.target.shapeValid,
      liveProbeAttempted: result.liveProbe.attempted,
      liveProbeStatus: result.liveProbe.status,
      channelName: result.liveProbe.channel?.name || null,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildDiscordUpdateTargetAdmission({
  env = process.env,
  probeLive = false,
  expectedName = DEFAULT_EXPECTED_CHANNEL_NAME,
  fetchImpl = fetch,
} = {}) {
  const target = getConfiguredTarget(env);
  const liveProbe = probeLive
    ? await probeDiscordUpdateTarget({
      target,
      env,
      expectedName,
      fetchImpl,
    })
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
    expectedName,
    target,
    liveProbe,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyUpdateTargetAdmissionEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Updates Target Admission",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- probe live: \`${result.probeLive ? "true" : "false"}\``,
    `- expected channel name: \`${result.expectedName}\``,
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
  if (result.liveProbe.channel?.name) {
    lines.push(`- channel name: \`${result.liveProbe.channel.name}\``);
  }
  if (typeof result.liveProbe.channel?.type === "number") {
    lines.push(`- channel type: \`${result.liveProbe.channel.type}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordUpdateTargetAdmission(options);
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
    DEFAULT_EXPECTED_CHANNEL_NAME,
    parseArgs,
    normalizeEnvValue,
    hasValue,
    isSnowflake,
    classifyBotChannel,
    getConfiguredTarget,
    normalizeChannelName,
    classifyChannelProbeBody,
    probeDiscordUpdateTarget,
    skipLiveProbe,
    classifyUpdateTargetAdmissionEvent,
    buildDiscordUpdateTargetAdmission,
    renderMarkdown,
  },
};
