const {
  _internals: registrationInternals,
} = require("./discordos-slash-command-registration-apply-guard");
const {
  _internals: preflightInternals,
} = require("./discordos-slash-command-registration-preflight");

const DEACTIVATION_ENV = "DISCORDOS_SLASH_COMMAND_DEACTIVATION";
const DEACTIVATION_ENV_VALUE = "enabled";

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
    applicationId: null,
    guildId: null,
    allowDeactivation: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--application-id") {
      options.applicationId = readValue(args, index, "missing_application_id_value");
      index += 1;
    } else if (arg === "--guild-id") {
      options.guildId = readValue(args, index, "missing_guild_id_value");
      index += 1;
    } else if (arg === "--allow-deactivation") {
      options.allowDeactivation = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function resolveDeactivationAdmission({ allowDeactivation, env }) {
  const envEnabled = env?.[DEACTIVATION_ENV] === DEACTIVATION_ENV_VALUE;
  if (!allowDeactivation && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "no_deactivation_guard_active",
      reasonCodes: [],
    };
  }
  if (allowDeactivation && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "deactivation_plan_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["deactivation_double_guard_missing"],
  };
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function executeDeactivationApply({ endpoint, env, fetchImpl }) {
  if (!hasValue(env.DISCORDOS_BOT_TOKEN)) {
    return {
      ok: false,
      attempted: false,
      status: "blocked",
      httpStatus: null,
      commandsRemaining: null,
      reasonCodes: ["discord_bot_token_missing"],
    };
  }

  const response = await fetchImpl(endpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${env.DISCORDOS_BOT_TOKEN.trim()}`,
    },
    body: "[]",
  });
  let commandsRemaining = null;
  try {
    const body = await response.json();
    if (Array.isArray(body)) {
      commandsRemaining = body.length;
    }
  } catch (_error) {
    commandsRemaining = null;
  }

  return {
    ok: response.ok && (commandsRemaining === null || commandsRemaining === 0),
    attempted: true,
    status: response.ok ? "deactivated" : "failed",
    httpStatus: response.status,
    commandsRemaining,
    reasonCodes: response.ok ? [] : ["discord_deactivation_request_failed"],
  };
}

async function buildSlashCommandDeactivationApplyGuard({
  env = process.env,
  allowDeactivation = false,
  apply = false,
  fetchImpl = fetch,
  ...input
} = {}) {
  const idPreflight = preflightInternals.buildSlashCommandRegistrationPreflight({
    surface: "all",
    applicationId: input.applicationId,
    guildId: input.guildId,
  });
  const admission = resolveDeactivationAdmission({ allowDeactivation, env });
  const endpoint = registrationInternals.buildRegistrationEndpoint(input);
  const applyAllowed = idPreflight.ok && admission.admitted;
  let applyResult = {
    ok: false,
    attempted: false,
    status: apply ? "blocked" : "not_requested",
    httpStatus: null,
    commandsRemaining: null,
    reasonCodes: apply && !applyAllowed ? ["deactivation_apply_not_admitted"] : [],
  };

  if (apply && applyAllowed) {
    if (!endpoint) {
      applyResult = {
        ...applyResult,
        reasonCodes: ["application_id_required_for_apply"],
      };
    } else {
      applyResult = await executeDeactivationApply({ endpoint, env, fetchImpl });
    }
  }

  const reasonCodes = [...new Set([
    ...idPreflight.reasonCodes,
    ...admission.reasonCodes,
    ...applyResult.reasonCodes,
  ])];
  const result = {
    ok: idPreflight.ok && admission.reasonCodes.length === 0 && applyResult.reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: applyResult.attempted,
    registersCommands: false,
    removesCommands: applyResult.status === "deactivated",
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "deactivation_guard_ready" : "blocked",
    endpointConfigured: endpoint !== null,
    endpointScope: input.guildId ? "guild" : "application",
    deactivationAdmission: admission,
    applyResult,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.slash_command.deactivation_apply_guard_ready"
        : "discordos.slash_command.deactivation_apply_guard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.slash_command.deactivation_apply_guard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        callsDiscordApi: result.callsDiscordApi,
        removesCommands: result.removesCommands,
        commandsRemaining: result.applyResult.commandsRemaining,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Slash Command Deactivation Apply Guard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- registers commands: \`${result.registersCommands ? "true" : "false"}\``,
    `- removes commands: \`${result.removesCommands ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- endpoint scope: \`${result.endpointScope}\``,
    `- deactivation admission: \`${result.deactivationAdmission.status}\``,
    `- apply result: \`${result.applyResult.status}\``,
    `- commands remaining: \`${result.applyResult.commandsRemaining ?? "unknown"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildSlashCommandDeactivationApplyGuard(options);
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
    DEACTIVATION_ENV,
    DEACTIVATION_ENV_VALUE,
    parseArgs,
    resolveDeactivationAdmission,
    executeDeactivationApply,
    buildSlashCommandDeactivationApplyGuard,
    renderMarkdown,
  },
};
