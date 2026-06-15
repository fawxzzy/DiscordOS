const {
  _internals: chatIntakeInternals,
} = require("./discordos-chat-command-intake");
const {
  _internals: writeAdapterInternals,
} = require("./discordos-music-sesh-write-adapter-guard");

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
    wakeWord: "computa",
    content: "computa music queue Smoke Track",
    authorBot: false,
    sessionId: "music-sesh-chat-session",
    guildId: null,
    channelId: null,
    actorDiscordUserId: null,
    itemTitle: null,
    allowStorageWrite: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--wake-word") {
      options.wakeWord = readValue(args, index, "missing_wake_word_value");
      index += 1;
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
    } else if (arg === "--item-title") {
      options.itemTitle = readValue(args, index, "missing_item_title_value");
      index += 1;
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

function normalizeChatAction(action) {
  if (action === "vote_skip") {
    return {
      action: "vote",
      voteDirection: "down",
      itemTitle: "Chat Skip Vote",
    };
  }
  return {
    action,
    voteDirection: null,
    itemTitle: null,
  };
}

async function buildChatMessageListener({
  env = process.env,
  fetchImpl = fetch,
  ...input
} = {}) {
  if (input.authorBot) {
    const result = {
      ok: true,
      destructive: false,
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
      status: "ignored_bot_author",
      intake: null,
      writeAdapter: null,
      reasonCodes: [],
    };
    return {
      ...result,
      event: {
        type: "discordos.chat_message.listener_ignored",
        severity: "info",
        subject: "discordos.chat_message.listener",
        status: "pass",
        dimensions: {
          authorBot: true,
          executesStorageWrite: false,
        },
      },
    };
  }

  const intake = chatIntakeInternals.buildChatCommandIntake({
    wakeWord: input.wakeWord,
    content: input.content,
  });
  if (!intake.ok) {
    const result = {
      ok: false,
      destructive: false,
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
      status: "blocked",
      intake,
      writeAdapter: null,
      reasonCodes: intake.reasonCodes,
    };
    return {
      ...result,
      event: {
        type: "discordos.chat_message.listener_blocked",
        severity: "warning",
        subject: "discordos.chat_message.listener",
        status: "fail",
        dimensions: {
          action: intake.action || "none",
          executesStorageWrite: false,
        },
      },
    };
  }

  const normalized = normalizeChatAction(intake.action);
  const writeAdapter = await writeAdapterInternals.buildMusicSeshWriteAdapterGuard({
    sessionId: input.sessionId,
    action: normalized.action,
    guildId: input.guildId,
    channelId: input.channelId,
    actorDiscordUserId: input.actorDiscordUserId,
    itemTitle: input.itemTitle || intake.itemTitle || normalized.itemTitle,
    voteDirection: normalized.voteDirection,
    allowStorageWrite: input.allowStorageWrite,
    apply: input.apply,
    env,
    fetchImpl,
  });
  const result = {
    ok: writeAdapter.ok,
    destructive: false,
    sendsMessages: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: writeAdapter.executesStorageWrite,
    slashCommandsAdmitted: false,
    status: writeAdapter.ok ? "chat_message_route_ready" : "blocked",
    intake,
    writeAdapter: {
      status: writeAdapter.status,
      adapterStatus: writeAdapter.adapterStatus,
      storageWritesAllowed: writeAdapter.storageWritesAllowed,
      storageWriteResult: writeAdapter.storageWriteResult,
    },
    reasonCodes: writeAdapter.reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.chat_message.listener_ready"
        : "discordos.chat_message.listener_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.chat_message.listener",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        action: intake.action || "none",
        executesStorageWrite: result.executesStorageWrite,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Chat Message Listener",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- action: \`${result.intake?.action || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildChatMessageListener(options);
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
    normalizeChatAction,
    buildChatMessageListener,
    renderMarkdown,
  },
};
