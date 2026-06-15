const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), "config", "discordos-music-sesh-channel-target.json");
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

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
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--config") {
      options.configPath = path.resolve(readValue(args, index, "missing_config_value"));
      index += 1;
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

async function buildMusicSeshChannelTargetStatus({
  configPath = DEFAULT_CONFIG_PATH,
  fsImpl = fs,
} = {}) {
  const config = await readConfig(configPath, fsImpl);
  const target = buildTargetStatus(config);
  const result = {
    ...target,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    status: target.ok ? "channel_target_ready" : "blocked",
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
    buildMusicSeshChannelTargetStatus,
    renderMarkdown,
  },
};
