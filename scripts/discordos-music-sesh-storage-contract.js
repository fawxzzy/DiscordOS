const {
  _internals: runtimeInternals,
} = require("./discordos-music-sesh-runtime");

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
    action: "queue_item",
    guildId: null,
    channelId: null,
    actorDiscordUserId: null,
    itemTitle: null,
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
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function buildStorageTables() {
  return [
    {
      table: "discordos.discordos_music_sesh_sessions",
      idempotencyKey: "session_id",
      retentionClass: "product_workflow_state",
    },
    {
      table: "discordos.discordos_music_sesh_queue_items",
      idempotencyKey: "queue_item_id",
      retentionClass: "product_workflow_state",
    },
    {
      table: "discordos.discordos_music_sesh_votes",
      idempotencyKey: "session_id:actor_fingerprint:queue_item_id",
      retentionClass: "product_workflow_state",
    },
  ];
}

function buildMusicSeshStorageContract(input = {}) {
  const runtime = runtimeInternals.buildMusicSeshRuntime(input);
  const reasonCodes = [...runtime.reasonCodes];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    writesStorage: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    status: reasonCodes.length === 0 ? "storage_contract_ready" : "blocked",
    runtimeStatus: runtime.status,
    storageWritesAllowed: false,
    readbackReady: false,
    nextGate: "music_sesh_storage_migration_rls_proof",
    tables: buildStorageTables(),
    readbackPlan: {
      rpc: "discordos_read_music_sesh_state",
      transport: "supabase_edge_or_service_role_rpc",
      requiredGate: "storage_migration_rls_proof",
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.storage_contract_ready"
        : "discordos.music_sesh.storage_contract_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.storage_contract",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        tableCount: result.tables.length,
        storageWritesAllowed: result.storageWritesAllowed,
        readbackReady: result.readbackReady,
        reasonCodeCount: result.reasonCodes.length,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Music Sesh Storage Contract",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes storage: \`${result.writesStorage ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- next gate: \`${result.nextGate}\``,
    `- readback rpc: \`${result.readbackPlan.rpc}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
    "## Tables",
    "",
  ];

  for (const table of result.tables) {
    lines.push(`- ${table.table}: idempotency \`${table.idempotencyKey}\``);
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildMusicSeshStorageContract(options);
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
    buildStorageTables,
    buildMusicSeshStorageContract,
    renderMarkdown,
  },
};
