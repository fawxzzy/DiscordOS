const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), "config", "discordos-music-sesh-channel-target.json");
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const TARGET_ENV_CONTRACT = [
  {
    envName: "DISCORDOS_MUSIC_SESH_GUILD_ID",
    targetKey: "guildId",
  },
  {
    envName: "DISCORDOS_MUSIC_SESH_CATEGORY_ID",
    targetKey: "categoryId",
  },
  {
    envName: "DISCORDOS_MUSIC_SESH_CHANNEL_ID",
    targetKey: "channelId",
  },
];

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

function parseArgs(args) {
  const options = {
    json: false,
    configPath: DEFAULT_CONFIG_PATH,
    requireEnv: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--config") {
      options.configPath = path.resolve(readValue(args, index, "missing_config_value"));
      index += 1;
    } else if (arg === "--require-env") {
      options.requireEnv = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function snowflakeValid(value) {
  return SNOWFLAKE_PATTERN.test(String(value || "").trim());
}

async function readConfig(configPath = DEFAULT_CONFIG_PATH, fsImpl = fs) {
  const raw = await fsImpl.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

function buildTargetStatus(config) {
  const target = config?.target || {};
  const reasonCodes = [];

  if (config?.version !== 1) {
    reasonCodes.push("channel_target_version_invalid");
  }
  if (!hasValue(target.id)) {
    reasonCodes.push("target_id_missing");
  }
  if (!snowflakeValid(target.guildId)) {
    reasonCodes.push("guild_id_invalid");
  }
  if (!snowflakeValid(target.categoryId)) {
    reasonCodes.push("category_id_invalid");
  }
  if (!snowflakeValid(target.channelId)) {
    reasonCodes.push("channel_id_invalid");
  }
  if (!hasValue(target.categoryName)) {
    reasonCodes.push("category_name_missing");
  }
  if (!hasValue(target.channelName)) {
    reasonCodes.push("channel_name_missing");
  }
  if (target.slashCommandsAdmitted !== false) {
    reasonCodes.push("slash_commands_must_remain_disabled");
  }

  return {
    ok: reasonCodes.length === 0,
    targetId: target.id || null,
    label: target.label || null,
    guildId: target.guildId || null,
    categoryId: target.categoryId || null,
    categoryName: target.categoryName || null,
    channelId: target.channelId || null,
    channelName: target.channelName || null,
    channelType: target.channelType || null,
    purpose: target.purpose || null,
    slashCommandsAdmitted: target.slashCommandsAdmitted === true,
    reasonCodes,
  };
}

function buildEnvContract(target, {
  env = process.env,
  requireEnv = false,
} = {}) {
  const reasonCodes = [];
  const variables = TARGET_ENV_CONTRACT.map((entry) => {
    const expectedValue = target?.[entry.targetKey] || null;
    const actualValue = env?.[entry.envName] || null;
    const provided = hasValue(actualValue);
    const matches = provided && actualValue === expectedValue;
    if (requireEnv && !provided) {
      reasonCodes.push(`${entry.envName.toLowerCase()}_missing`);
    } else if (provided && !matches) {
      reasonCodes.push(`${entry.envName.toLowerCase()}_mismatch`);
    }
    return {
      envName: entry.envName,
      targetKey: entry.targetKey,
      expectedValue,
      provided,
      matches,
    };
  });

  return {
    ok: reasonCodes.length === 0,
    requireEnv,
    operatorProvidedIdsRequired: false,
    runtimeResolutionSource: "committed_config",
    variables,
    reasonCodes,
  };
}

async function buildMusicSeshChannelTargetStatus({
  configPath = DEFAULT_CONFIG_PATH,
  requireEnv = false,
  env = process.env,
  fsImpl = fs,
} = {}) {
  const config = await readConfig(configPath, fsImpl);
  const target = buildTargetStatus(config);
  const envContract = buildEnvContract(config?.target || {}, { env, requireEnv });
  const reasonCodes = [...new Set([
    ...target.reasonCodes,
    ...envContract.reasonCodes,
  ])];
  const result = {
    ...target,
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    envContract,
    status: reasonCodes.length === 0 ? "channel_target_ready" : "blocked",
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.channel_target_ready"
        : "discordos.music_sesh.channel_target_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.channel_target",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        channelId: result.channelId || "none",
        slashCommandsAdmitted: result.slashCommandsAdmitted,
        operatorProvidedIdsRequired: result.envContract.operatorProvidedIdsRequired,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Channel Target",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- category: \`${result.categoryName || "none"}\``,
    `- channel: \`${result.channelName || "none"}\``,
    `- channel id: \`${result.channelId || "none"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- runtime resolution: \`${result.envContract.runtimeResolutionSource}\``,
    `- operator-provided ids required: \`${result.envContract.operatorProvidedIdsRequired ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshChannelTargetStatus(options);
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
    DEFAULT_CONFIG_PATH,
    SNOWFLAKE_PATTERN,
    parseArgs,
    hasValue,
    snowflakeValid,
    readConfig,
    buildTargetStatus,
    buildEnvContract,
    buildMusicSeshChannelTargetStatus,
    renderMarkdown,
  },
};
