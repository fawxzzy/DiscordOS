const {
  _internals: chatListenerInternals,
} = require("./discordos-chat-message-listener");

const INGEST_ENV = "DISCORDOS_CHAT_MESSAGE_INGEST";
const INGEST_ENV_VALUE = "enabled";

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
    content: "computa music queue Ingest Track",
    authorBot: false,
    sessionId: "music-sesh-chat-ingest",
    guildId: "1504668396338413670",
    channelId: "1516089950787862689",
    actorDiscordUserId: "1515220075366580224",
    allowIngest: false,
    allowStorageWrite: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--content") {
      options.content = readValue(args, index, "missing_content_value");
      index += 1;
    } else if (arg === "--author-bot") {
      options.authorBot = true;
    } else if (arg === "--session-id") {
      options.sessionId = readValue(args, index, "missing_session_id_value");
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
    } else if (arg === "--allow-ingest") {
      options.allowIngest = true;
    } else if (arg === "--allow-storage-write") {
      options.allowStorageWrite = true;
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

function resolveIngestAdmission({ allowIngest, env }) {
  const envEnabled = env?.[INGEST_ENV] === INGEST_ENV_VALUE;
  if (!allowIngest && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "ingest_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowIngest && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "ingest_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["chat_message_ingest_double_guard_missing"],
  };
}

async function buildChatMessageLiveIngest({
  env = process.env,
  fetchImpl = fetch,
  allowIngest = false,
  allowStorageWrite = false,
  apply = false,
  ...input
} = {}) {
  const admission = resolveIngestAdmission({ allowIngest, env });
  let listener = null;
  const reasonCodes = [...admission.reasonCodes];

  if (!apply || admission.admitted) {
    listener = await chatListenerInternals.buildChatMessageListener({
      ...input,
      allowStorageWrite,
      apply: apply && admission.admitted,
      env,
      fetchImpl,
    });
    reasonCodes.push(...listener.reasonCodes);
  }

  if (apply && !admission.admitted) {
    reasonCodes.push("chat_message_ingest_not_admitted");
  }

  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: listener?.executesStorageWrite === true,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0
      ? apply
        ? "chat_message_ingested"
        : "dry_run"
      : "blocked",
    admission,
    listener,
    userResponse: listener?.userResponse || null,
    statusResponseRoute: listener?.userResponse
      ? {
          status: listener.status,
          content: listener.userResponse.content,
          allowedMentionsDisabled: listener.userResponse.allowedMentionsDisabled === true,
          noUnsafeMentions: listener.statusReadModel?.responseReadback?.noUnsafeMentions === true,
        }
      : null,
    reasonCodes: [...new Set(reasonCodes)],
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.chat_message.live_ingest_ready"
        : "discordos.chat_message.live_ingest_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.chat_message.live_ingest",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        executesStorageWrite: result.executesStorageWrite,
        slashCommandsAdmitted: false,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Chat Message Live Ingest",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- listener status: \`${result.listener?.status || "none"}\``,
    `- status response route: \`${result.statusResponseRoute ? "ready" : "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildChatMessageLiveIngest(options);
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
    INGEST_ENV,
    INGEST_ENV_VALUE,
    parseArgs,
    resolveIngestAdmission,
    buildChatMessageLiveIngest,
    renderMarkdown,
  },
};
