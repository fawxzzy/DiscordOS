const SURFACES = new Set(["all", "board", "moderation", "music"]);

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
    surface: "all",
    applicationId: null,
    guildId: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--surface") {
      options.surface = readValue(args, index, "missing_surface_value");
      index += 1;
    } else if (arg === "--application-id") {
      options.applicationId = readValue(args, index, "missing_application_id_value");
      index += 1;
    } else if (arg === "--guild-id") {
      options.guildId = readValue(args, index, "missing_guild_id_value");
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function isSnowflake(value) {
  return typeof value === "string" && /^[0-9]{17,20}$/.test(value);
}

function buildCommandDefinitions(surface = "all") {
  if (!SURFACES.has(surface)) {
    return [];
  }
  return [];
}

function buildSlashCommandRegistrationPreflight(input = {}) {
  const surface = input.surface || "all";
  const reasonCodes = [];
  if (!SURFACES.has(surface)) {
    reasonCodes.push("surface_not_admitted");
  }
  if (input.applicationId && !isSnowflake(input.applicationId)) {
    reasonCodes.push("application_id_invalid");
  }
  if (input.guildId && !isSnowflake(input.guildId)) {
    reasonCodes.push("guild_id_invalid");
  }

  const commands = SURFACES.has(surface) ? buildCommandDefinitions(surface) : [];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    registersCommands: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "slash_commands_disabled" : "blocked",
    scope: input.guildId ? "guild" : "application",
    commandCount: commands.length,
    commands,
    nextGate: "discordos_chat_or_button_interaction_surface",
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.slash_command.registration_disabled_ready"
        : "discordos.slash_command.registration_preflight_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.slash_command.registration_preflight",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        commandCount: result.commandCount,
        callsDiscordApi: result.callsDiscordApi,
        registersCommands: result.registersCommands,
        reasonCodeCount: result.reasonCodes.length,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Slash Command Registration Preflight",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- registers commands: \`${result.registersCommands ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- scope: \`${result.scope}\``,
    `- commands: \`${result.commandCount}\``,
    `- next gate: \`${result.nextGate}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const command of result.commands) {
    lines.push(`- /${command.name}: ${command.surface} permission \`${command.defaultPermission}\``);
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildSlashCommandRegistrationPreflight(options);
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
    SURFACES,
    parseArgs,
    isSnowflake,
    buildCommandDefinitions,
    buildSlashCommandRegistrationPreflight,
    renderMarkdown,
  },
};
