const {
  _internals: buttonRouterInternals,
} = require("./discordos-music-sesh-button-router");
const {
  _internals: chatListenerInternals,
} = require("./discordos-chat-message-listener");
const {
  _internals: readbackInternals,
} = require("./discordos-music-sesh-live-readback");

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
    live: false,
    sessionId: `music-sesh-canary-${Date.now()}`,
    guildId: null,
    channelId: null,
    actorDiscordUserId: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--live") {
      options.live = true;
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
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function buildCanarySteps(input = {}) {
  return [
    {
      id: "button_queue",
      interactionType: "MESSAGE_COMPONENT",
      runner: "button",
      customId: "music_sesh:queue",
      itemTitle: "Canary Button Queue",
    },
    {
      id: "chat_vote_skip",
      interactionType: "MESSAGE_CREATE",
      runner: "chat",
      content: "computa music skip",
      itemTitle: "Canary Button Queue",
    },
    {
      id: "button_close",
      interactionType: "MESSAGE_COMPONENT",
      runner: "button",
      customId: "music_sesh:close",
    },
  ].map((step) => ({
    ...step,
    sessionId: input.sessionId,
    guildId: input.guildId,
    channelId: input.channelId,
    actorDiscordUserId: input.actorDiscordUserId,
  }));
}

async function runCanaryStep({
  step,
  live,
  env,
  fetchImpl,
}) {
  const common = {
    sessionId: step.sessionId,
    guildId: step.guildId,
    channelId: step.channelId,
    actorDiscordUserId: step.actorDiscordUserId,
    allowStorageWrite: live,
    apply: live,
    env,
    fetchImpl,
  };
  if (step.runner === "button") {
    return buttonRouterInternals.buildMusicSeshButtonRouter({
      ...common,
      customId: step.customId,
      itemTitle: step.itemTitle,
    });
  }
  return chatListenerInternals.buildChatMessageListener({
    ...common,
    content: step.content,
    itemTitle: step.itemTitle,
  });
}

async function buildButtonChatLiveCanary({
  env = process.env,
  fetchImpl = fetch,
  live = false,
  ...input
} = {}) {
  const steps = buildCanarySteps(input);
  const results = [];
  for (const step of steps) {
    const result = await runCanaryStep({
      step,
      live,
      env,
      fetchImpl,
    });
    results.push({
      id: step.id,
      interactionType: step.interactionType,
      ok: result.ok,
      status: result.status,
      executesStorageWrite: result.executesStorageWrite,
      reasonCodes: result.reasonCodes,
    });
  }

  const readback = await readbackInternals.buildMusicSeshLiveReadback({
    live,
    env,
    fetchImpl,
  });
  const reasonCodes = [...new Set([
    ...results.flatMap((result) => result.reasonCodes),
    ...readback.reasonCodes,
  ])];
  const result = {
    ok: results.every((step) => step.ok) && readback.ok,
    destructive: false,
    sendsMessages: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    liveAttempted: live,
    executesStorageWrite: results.some((step) => step.executesStorageWrite),
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "button_chat_canary_ready" : "blocked",
    sessionId: input.sessionId,
    steps,
    stepResults: results,
    readback: {
      ok: readback.ok,
      status: readback.status,
      liveAttempted: readback.liveAttempted,
      summary: readback.summary,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.button_chat_canary_ready"
        : "discordos.music_sesh.button_chat_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.button_chat_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveAttempted: result.liveAttempted,
        stepCount: results.length,
        executesStorageWrite: result.executesStorageWrite,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Music Sesh Button Chat Live Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- session id: \`${result.sessionId || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const step of result.stepResults) {
    lines.push(`- step ${step.id}: \`${step.status}\` storage \`${step.executesStorageWrite ? "true" : "false"}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonChatLiveCanary(options);
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
    buildCanarySteps,
    runCanaryStep,
    buildButtonChatLiveCanary,
    renderMarkdown,
  },
};
