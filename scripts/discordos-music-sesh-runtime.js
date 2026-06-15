const {
  _internals: preflightInternals,
} = require("./discordos-music-sesh-preflight");

const RUNTIME_ACTIONS = new Set([
  "open_session",
  "queue_item",
  "vote",
  "lock_session",
  "close_session",
]);
const PROVIDER_ACTIONS = new Set([
  "search",
  "play",
  "pause",
  "skip",
  "stop",
]);
const PROVIDER_ADMISSION_ENV = "DISCORDOS_MUSIC_PROVIDER_ADAPTER";
const PROVIDER_ADMISSION_ENV_VALUE = "enabled";

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
    sessionId: null,
    action: null,
    guildId: null,
    channelId: null,
    actorDiscordUserId: null,
    itemTitle: null,
    voteDirection: null,
    providerAction: null,
    allowProviderAdmission: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--session-id") {
      options.sessionId = readValue(args, index, "missing_session_id_value");
      index += 1;
    } else if (arg === "--action") {
      options.action = readValue(args, index, "missing_action_value");
      index += 1;
    } else if (arg === "--guild-id") {
      options.guildId = readValue(args, index, "missing_guild_id_value");
      index += 1;
    } else if (arg === "--channel-id") {
      options.channelId = readValue(args, index, "missing_channel_id_value");
      index += 1;
    } else if (arg === "--actor-user-id") {
      options.actorDiscordUserId = readValue(args, index, "missing_actor_user_id_value");
      index += 1;
    } else if (arg === "--item-title") {
      options.itemTitle = readValue(args, index, "missing_item_title_value");
      index += 1;
    } else if (arg === "--vote-direction") {
      options.voteDirection = readValue(args, index, "missing_vote_direction_value");
      index += 1;
    } else if (arg === "--provider-action") {
      options.providerAction = readValue(args, index, "missing_provider_action_value");
      index += 1;
    } else if (arg === "--allow-provider-admission") {
      options.allowProviderAdmission = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function validateRuntimeInput(input = {}) {
  const validation = preflightInternals.validateMusicSeshPreflightInput(input);
  const reasonCodes = [...validation.reasonCodes];
  if (input.action && !RUNTIME_ACTIONS.has(input.action)) {
    reasonCodes.push("runtime_action_not_admitted");
  }
  if (input.providerAction && !PROVIDER_ACTIONS.has(input.providerAction)) {
    reasonCodes.push("provider_action_not_admitted");
  }
  return {
    ok: reasonCodes.length === 0,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function buildProviderAdmission({
  providerAction = null,
  allowProviderAdmission = false,
  env = process.env,
} = {}) {
  const requested = preflightInternals.hasValue(providerAction);
  const envEnabled = env?.[PROVIDER_ADMISSION_ENV] === PROVIDER_ADMISSION_ENV_VALUE;
  const reasonCodes = [];

  if (!requested) {
    return {
      requested: false,
      admitted: false,
      status: "provider_not_requested",
      providerAction: null,
      callsMusicProviders: false,
      controlsPlayback: false,
      reasonCodes,
    };
  }
  if (!PROVIDER_ACTIONS.has(providerAction)) {
    reasonCodes.push("provider_action_not_admitted");
  }
  if (!allowProviderAdmission || !envEnabled) {
    reasonCodes.push("music_provider_adapter_double_guard_missing");
  }

  return {
    requested,
    admitted: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "provider_admission_ready" : "blocked",
    providerAction,
    callsMusicProviders: false,
    controlsPlayback: false,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function buildQueueWorkflow(input = {}) {
  const queuedItem = input.action === "queue_item" && preflightInternals.hasValue(input.itemTitle)
    ? {
        titlePresent: true,
        titleLength: input.itemTitle.length,
        requestedByPresent: preflightInternals.isSnowflake(input.actorDiscordUserId),
      }
    : null;
  const vote = input.action === "vote"
    ? {
        direction: input.voteDirection || null,
        actorPresent: preflightInternals.isSnowflake(input.actorDiscordUserId),
      }
    : null;

  return {
    sessionId: input.sessionId || null,
    action: input.action || null,
    state: input.action === "close_session"
      ? "closed"
      : input.action === "lock_session"
        ? "locked"
        : "open",
    queueItemCountDelta: queuedItem ? 1 : 0,
    voteDelta: vote ? 1 : 0,
    queuedItem,
    vote,
  };
}

function classifyMusicSeshRuntimeEvent(result) {
  return {
    type: result.ok
      ? "discordos.music_sesh.runtime_ready"
      : "discordos.music_sesh.runtime_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.music_sesh.runtime",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      action: result.workflow.action || "unknown",
      queueItemCountDelta: result.workflow.queueItemCountDelta,
      voteDelta: result.workflow.voteDelta,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function buildMusicSeshRuntime(input = {}) {
  const validation = validateRuntimeInput(input);
  const providerAdmission = buildProviderAdmission(input);
  const reasonCodes = [...new Set([
    ...validation.reasonCodes,
    ...providerAdmission.reasonCodes,
  ])];
  const workflow = buildQueueWorkflow(input);
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsMusicProviders: providerAdmission.callsMusicProviders,
    controlsPlayback: providerAdmission.controlsPlayback,
    persistsStorage: false,
    status: reasonCodes.length === 0 ? "runtime_ready" : "blocked",
    workflow,
    providerAdmission,
    nextCommand: "npm run ops:discordos:music-sesh-runtime",
    reasonCodes,
  };

  return {
    ...result,
    event: classifyMusicSeshRuntimeEvent(result),
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Runtime",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- persists storage: \`${result.persistsStorage ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- action: \`${result.workflow.action || "unknown"}\``,
    `- queue delta: \`${result.workflow.queueItemCountDelta}\``,
    `- vote delta: \`${result.workflow.voteDelta}\``,
    `- provider admission: \`${result.providerAdmission.status}\``,
    `- provider action: \`${result.providerAdmission.providerAction || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildMusicSeshRuntime(options);
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
    RUNTIME_ACTIONS,
    PROVIDER_ACTIONS,
    PROVIDER_ADMISSION_ENV,
    parseArgs,
    validateRuntimeInput,
    buildProviderAdmission,
    buildQueueWorkflow,
    classifyMusicSeshRuntimeEvent,
    buildMusicSeshRuntime,
    renderMarkdown,
  },
};
