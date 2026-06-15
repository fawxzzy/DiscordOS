const {
  _internals: buttonRouterInternals,
} = require("./discordos-music-sesh-button-router");

const LIFECYCLE_BUTTONS = [
  "music_sesh:open",
  "music_sesh:queue",
  "music_sesh:vote_skip",
  "music_sesh:lock",
  "music_sesh:close",
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
    sessionId: "music-sesh-lifecycle-buttons",
    guildId: "1504668396338413670",
    channelId: "1508139160853286942",
    actorDiscordUserId: "1515220075366580224",
    allowStorageWrite: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
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

async function buildMusicSeshSessionLifecycleButtons({
  env = process.env,
  fetchImpl = fetch,
  ...input
} = {}) {
  const routes = [];
  for (const customId of LIFECYCLE_BUTTONS) {
    routes.push(await buttonRouterInternals.buildMusicSeshButtonRouter({
      ...input,
      customId,
      env,
      fetchImpl,
    }));
  }

  const reasonCodes = [...new Set(routes.flatMap((route) => route.reasonCodes))];
  const result = {
    ok: routes.every((route) => route.ok) && reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: routes.some((route) => route.executesStorageWrite),
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "session_lifecycle_buttons_ready" : "blocked",
    routeCount: routes.length,
    actionSequence: routes.map((route) => route.route?.action || "blocked"),
    routes: routes.map((route) => ({
      ok: route.ok,
      customId: route.customId,
      status: route.status,
      action: route.route?.action || null,
      executesStorageWrite: route.executesStorageWrite,
      reasonCodes: route.reasonCodes,
    })),
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.session_lifecycle_buttons_ready"
        : "discordos.music_sesh.session_lifecycle_buttons_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.session_lifecycle_buttons",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        routeCount: result.routeCount,
        executesStorageWrite: result.executesStorageWrite,
        slashCommandsAdmitted: false,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Session Lifecycle Buttons",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- routes: \`${result.routeCount}\``,
    `- actions: \`${result.actionSequence.join(",")}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshSessionLifecycleButtons(options);
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
    LIFECYCLE_BUTTONS,
    parseArgs,
    buildMusicSeshSessionLifecycleButtons,
    renderMarkdown,
  },
};
