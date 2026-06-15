const {
  _internals: preflightInternals,
} = require("./discordos-slash-command-registration-preflight");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const REGISTRATION_ENV = "DISCORDOS_SLASH_COMMAND_REGISTRATION";
const REGISTRATION_ENV_VALUE = "enabled";

function parseArgs(args) {
  const preflightArgs = [];
  const options = {
    allowRegistration: false,
    apply: false,
  };

  for (const arg of args) {
    if (arg === "--allow-registration") {
      options.allowRegistration = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else {
      preflightArgs.push(arg);
    }
  }

  return {
    ...preflightInternals.parseArgs(preflightArgs),
    ...options,
  };
}

function buildDiscordCommandPayload(commands) {
  return commands.map((command) => ({
    name: command.name,
    description: `${command.surface} workflow command`,
    type: 1,
    dm_permission: false,
    default_member_permissions: null,
  }));
}

function resolveRegistrationAdmission({ allowRegistration, env }) {
  if (allowRegistration || env?.[REGISTRATION_ENV] === REGISTRATION_ENV_VALUE) {
    return {
      requested: true,
      admitted: false,
      status: "slash_commands_disabled",
      reasonCodes: ["slash_commands_disabled"],
    };
  }
  const envEnabled = env?.[REGISTRATION_ENV] === REGISTRATION_ENV_VALUE;
  if (!allowRegistration && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "no_registration_guard_active",
      reasonCodes: [],
    };
  }
  if (allowRegistration && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "registration_plan_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["registration_double_guard_missing"],
  };
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildRegistrationEndpoint({ applicationId, guildId }) {
  if (!hasValue(applicationId)) {
    return null;
  }
  if (hasValue(guildId)) {
    return `${DISCORD_API_BASE}/applications/${applicationId.trim()}/guilds/${guildId.trim()}/commands`;
  }
  return `${DISCORD_API_BASE}/applications/${applicationId.trim()}/commands`;
}

async function executeRegistrationApply({ endpoint, payload, env, fetchImpl }) {
  if (!hasValue(env.DISCORDOS_BOT_TOKEN)) {
    return {
      ok: false,
      attempted: false,
      status: "blocked",
      httpStatus: null,
      reasonCodes: ["discord_bot_token_missing"],
    };
  }

  const response = await fetchImpl(endpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${env.DISCORDOS_BOT_TOKEN.trim()}`,
    },
    body: JSON.stringify(payload),
  });

  return {
    ok: response.ok,
    attempted: true,
    status: response.ok ? "registered" : "failed",
    httpStatus: response.status,
    reasonCodes: response.ok ? [] : ["discord_registration_request_failed"],
  };
}

async function buildSlashCommandRegistrationApplyGuard({
  env = process.env,
  allowRegistration = false,
  apply = false,
  fetchImpl = fetch,
  ...input
} = {}) {
  const preflight = preflightInternals.buildSlashCommandRegistrationPreflight(input);
  const admission = resolveRegistrationAdmission({ allowRegistration, env });
  const payload = buildDiscordCommandPayload(preflight.commands);
  const endpoint = buildRegistrationEndpoint(input);
  const applyAllowed = preflight.ok && admission.admitted;
  let applyResult = {
    ok: false,
    attempted: false,
    status: apply ? "blocked" : "not_requested",
    httpStatus: null,
    reasonCodes: apply && !applyAllowed ? ["registration_apply_not_admitted"] : [],
  };

  if (apply && applyAllowed) {
    if (!endpoint) {
      applyResult = {
        ...applyResult,
        reasonCodes: ["application_id_required_for_apply"],
      };
    } else {
      applyResult = await executeRegistrationApply({ endpoint, payload, env, fetchImpl });
    }
  }

  const reasonCodes = [...new Set([
    ...preflight.reasonCodes,
    ...admission.reasonCodes,
    ...applyResult.reasonCodes,
  ])];
  const result = {
    ok: preflight.ok && admission.reasonCodes.length === 0 && applyResult.reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: applyResult.attempted,
    registersCommands: applyResult.status === "registered",
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "apply_guard_ready" : "blocked",
    scope: preflight.scope,
    commandCount: preflight.commandCount,
    commands: preflight.commands,
    registrationAdmission: admission,
    endpointConfigured: endpoint !== null,
    endpointScope: input.guildId ? "guild" : "application",
    payloadPreview: payload,
    applyResult,
    reasonCodes,
  };

  return {
    ...result,
    event: classifySlashCommandRegistrationApplyGuardEvent(result),
  };
}

function classifySlashCommandRegistrationApplyGuardEvent(result) {
  return {
    type: result.ok
      ? "discordos.slash_command.registration_apply_guard_ready"
      : "discordos.slash_command.registration_apply_guard_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.slash_command.registration_apply_guard",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      commandCount: result.commandCount,
      callsDiscordApi: result.callsDiscordApi,
      registersCommands: result.registersCommands,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Slash Command Registration Apply Guard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- registers commands: \`${result.registersCommands ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- scope: \`${result.scope}\``,
    `- commands: \`${result.commandCount}\``,
    `- registration admission: \`${result.registrationAdmission.status}\``,
    `- apply result: \`${result.applyResult.status}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildSlashCommandRegistrationApplyGuard(options);
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
    REGISTRATION_ENV,
    REGISTRATION_ENV_VALUE,
    parseArgs,
    buildDiscordCommandPayload,
    resolveRegistrationAdmission,
    buildRegistrationEndpoint,
    executeRegistrationApply,
    buildSlashCommandRegistrationApplyGuard,
    classifySlashCommandRegistrationApplyGuardEvent,
    renderMarkdown,
  },
};
