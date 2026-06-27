const {
  _internals: writeAdapterInternals,
} = require("./discordos-music-sesh-write-adapter-guard");

const BUTTON_ACTIONS = new Map([
  ["music_sesh:open", {
    action: "open_session",
  }],
  ["music_sesh:queue", {
    action: "queue_item",
    itemTitle: "Button Queued Track",
  }],
  ["music_sesh:vote_skip", {
    action: "vote",
    voteDirection: "down",
    itemTitle: "Button Skip Vote",
  }],
  ["music_sesh:status", {
    action: "open_session",
  }],
  ["music_sesh:lock", {
    action: "lock_session",
  }],
  ["music_sesh:close", {
    action: "close_session",
  }],
]);

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
    customId: "music_sesh:queue",
    sessionId: "music-sesh-button-session",
    guildId: "1504668396338413670",
    channelId: "1516089950787862689",
    actorDiscordUserId: "1515220075366580224",
    itemTitle: null,
    allowStorageWrite: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--custom-id") {
      options.customId = readValue(args, index, "missing_custom_id_value");
      index += 1;
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

function resolveButtonAction(customId) {
  return BUTTON_ACTIONS.get(String(customId || "").trim()) || null;
}

function buildWriteAdapterInput(input = {}) {
  const route = resolveButtonAction(input.customId);
  if (!route) {
    return null;
  }
  return {
    sessionId: input.sessionId,
    action: route.action,
    guildId: input.guildId,
    channelId: input.channelId,
    actorDiscordUserId: input.actorDiscordUserId,
    itemTitle: input.itemTitle || route.itemTitle || null,
    voteDirection: route.voteDirection || null,
    allowStorageWrite: input.allowStorageWrite,
    apply: input.apply,
  };
}

async function buildMusicSeshButtonRouter({
  env = process.env,
  fetchImpl = fetch,
  ...input
} = {}) {
  const writeAdapterInput = buildWriteAdapterInput(input);
  if (!writeAdapterInput) {
    return {
      ok: false,
      destructive: false,
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
      status: "blocked",
      customId: input.customId || null,
      route: null,
      writeAdapter: null,
      reasonCodes: ["button_custom_id_not_admitted"],
      event: {
        type: "discordos.music_sesh.button_router_blocked",
        severity: "warning",
        subject: "discordos.music_sesh.button_router",
        status: "fail",
        dimensions: {
          customId: input.customId || "none",
          executesStorageWrite: false,
        },
      },
    };
  }

  const writeAdapter = await writeAdapterInternals.buildMusicSeshWriteAdapterGuard({
    ...writeAdapterInput,
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
    status: writeAdapter.ok ? "button_route_ready" : "blocked",
    customId: input.customId,
    route: {
      action: writeAdapterInput.action,
      voteDirection: writeAdapterInput.voteDirection,
      itemTitle: writeAdapterInput.itemTitle,
    },
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
        ? "discordos.music_sesh.button_router_ready"
        : "discordos.music_sesh.button_router_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.button_router",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        customId: result.customId,
        action: result.route.action,
        executesStorageWrite: result.executesStorageWrite,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Button Router",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- custom id: \`${result.customId || "none"}\``,
    `- action: \`${result.route?.action || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshButtonRouter(options);
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
    BUTTON_ACTIONS,
    parseArgs,
    resolveButtonAction,
    buildWriteAdapterInput,
    buildMusicSeshButtonRouter,
    renderMarkdown,
  },
};
