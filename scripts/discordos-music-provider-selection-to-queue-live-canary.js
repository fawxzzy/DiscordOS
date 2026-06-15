const {
  _internals: flowInternals,
} = require("./discordos-music-provider-queue-selection-button-flow");
const {
  _internals: writeAdapterInternals,
} = require("./discordos-music-sesh-write-adapter-guard");

const DEFAULT_OPTIONS = {
  json: false,
  sessionId: "music-provider-selection-to-queue-live-canary",
  guildId: "1504668396338413670",
  channelId: "1508139160853286942",
  actorDiscordUserId: "1515220075366580224",
  allowStorageWrite: false,
  apply: false,
};

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(missingCode);
  return value.trim();
}

function parseArgs(args) {
  const providerArgs = [];
  const options = {
    ...DEFAULT_OPTIONS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      providerArgs.push(arg);
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
      providerArgs.push(arg);
      if (["--provider-action", "--query", "--result-limit"].includes(arg)) {
        const value = readValue(args, index, `missing_value:${arg}`);
        providerArgs.push(value);
        index += 1;
      }
    }
  }

  return {
    ...flowInternals.parseArgs(providerArgs),
    ...options,
  };
}

function buildWriteInputFromSelection({ selection, input }) {
  return {
    sessionId: input.sessionId,
    action: "queue_item",
    guildId: input.guildId,
    channelId: input.channelId,
    actorDiscordUserId: input.actorDiscordUserId,
    itemTitle: selection?.title || "Provider Selected Track",
    allowStorageWrite: input.allowStorageWrite,
    apply: input.apply,
  };
}

async function buildMusicProviderSelectionToQueueLiveCanary({
  env = process.env,
  fetchImpl = fetch,
  ...input
} = {}) {
  const resolvedInput = { ...DEFAULT_OPTIONS, ...input };
  const flow = await flowInternals.buildMusicProviderQueueSelectionButtonFlow({
    env,
    fetchImpl,
    ...resolvedInput,
  });
  const selectedPlan = flow.queueSelectionPlans[0] || null;
  const writeInput = buildWriteInputFromSelection({ selection: selectedPlan, input: resolvedInput });
  const write = await writeAdapterInternals.buildMusicSeshWriteAdapterGuard({ ...writeInput, env, fetchImpl });
  const reasonCodes = [...new Set([
    ...flow.reasonCodes,
    ...write.reasonCodes,
    ...(write.callsMusicProviders || write.controlsPlayback ? ["provider_selection_queue_side_effect_boundary_failed"] : []),
    ...(write.slashCommandsAdmitted ? ["provider_selection_queue_slash_command_admitted"] : []),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: flow.callsMusicProviders,
    controlsPlayback: false,
    executesStorageWrite: write.executesStorageWrite,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "provider_selection_to_queue_live_canary_ready" : "blocked",
    selection: {
      customId: selectedPlan?.customId || null,
      providerTrackId: selectedPlan?.providerTrackId || null,
      title: selectedPlan?.title || null,
      queuesMetadata: selectedPlan?.selectionQueuesMetadata === true,
    },
    writeAdapter: {
      status: write.status,
      adapterStatus: write.adapterStatus,
      storageWritesAllowed: write.storageWritesAllowed,
      storageWriteStatus: write.storageWriteResult.status,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.selection_to_queue_live_canary_ready"
        : "discordos.music_provider.selection_to_queue_live_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.selection_to_queue_live_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        executesStorageWrite: result.executesStorageWrite,
        queuesMetadata: result.selection.queuesMetadata,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Selection To Queue Live Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- custom id: \`${result.selection.customId || "none"}\``,
    `- storage status: \`${result.writeAdapter.storageWriteStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderSelectionToQueueLiveCanary(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) process.exitCode = 1;
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
    buildWriteInputFromSelection,
    buildMusicProviderSelectionToQueueLiveCanary,
    renderMarkdown,
  },
};
