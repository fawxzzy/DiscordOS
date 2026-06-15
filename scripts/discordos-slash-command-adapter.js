const SURFACES = new Set(["board", "moderation", "music"]);

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
    surface: null,
    command: null,
    cardId: null,
    caseId: null,
    sessionId: null,
    action: null,
    state: null,
    itemTitle: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--surface") {
      options.surface = readValue(args, index, "missing_surface_value");
      index += 1;
    } else if (arg === "--command") {
      options.command = readValue(args, index, "missing_command_value");
      index += 1;
    } else if (arg === "--card-id") {
      options.cardId = readValue(args, index, "missing_card_id_value");
      index += 1;
    } else if (arg === "--case-id") {
      options.caseId = readValue(args, index, "missing_case_id_value");
      index += 1;
    } else if (arg === "--session-id") {
      options.sessionId = readValue(args, index, "missing_session_id_value");
      index += 1;
    } else if (arg === "--action") {
      options.action = readValue(args, index, "missing_action_value");
      index += 1;
    } else if (arg === "--state") {
      options.state = readValue(args, index, "missing_state_value");
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

function buildCommandPlan(input = {}) {
  if (input.surface === "board") {
    return {
      adapter: "board_lifecycle_sync",
      command: "npm run ops:discordos:board-lifecycle-sync",
      args: {
        cardId: input.cardId || null,
        state: input.state || "opened",
      },
    };
  }
  if (input.surface === "moderation") {
    return {
      adapter: "moderation_audit_review_search",
      command: "npm run ops:discordos:moderation-audit-review-search",
      args: {
        caseId: input.caseId || null,
        action: input.action || null,
      },
    };
  }
  if (input.surface === "music") {
    return {
      adapter: "music_sesh_runtime",
      command: "npm run ops:discordos:music-sesh-runtime",
      args: {
        sessionId: input.sessionId || null,
        action: input.action || "queue_item",
        itemTitlePresent: typeof input.itemTitle === "string" && input.itemTitle.length > 0,
      },
    };
  }
  return null;
}

function validateAdapterInput(input = {}) {
  const reasonCodes = [];
  if (!SURFACES.has(input.surface)) {
    reasonCodes.push("surface_not_admitted");
  }
  if (!input.command) {
    reasonCodes.push("slash_command_missing");
  }
  if (input.surface === "board" && !input.cardId) {
    reasonCodes.push("card_id_missing");
  }
  if (input.surface === "moderation" && !input.caseId && !input.action) {
    reasonCodes.push("moderation_filter_missing");
  }
  if (input.surface === "music" && !input.sessionId) {
    reasonCodes.push("session_id_missing");
  }
  return {
    ok: reasonCodes.length === 0,
    reasonCodes,
  };
}

function classifySlashCommandAdapterEvent(result) {
  return {
    type: result.ok
      ? "discordos.slash_command.adapter_ready"
      : "discordos.slash_command.adapter_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.slash_command.adapter",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      surface: result.surface || "unknown",
      adapter: result.commandPlan?.adapter || "none",
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function buildSlashCommandAdapter(input = {}) {
  const validation = validateAdapterInput(input);
  const result = {
    ok: validation.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    registersCommands: false,
    callsDiscordApi: false,
    status: validation.ok ? "adapter_ready" : "blocked",
    surface: input.surface || null,
    slashCommand: input.command || null,
    commandPlan: buildCommandPlan(input),
    reasonCodes: validation.reasonCodes,
  };

  return {
    ...result,
    event: classifySlashCommandAdapterEvent(result),
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Slash Command Adapter",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- registers commands: \`${result.registersCommands ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- surface: \`${result.surface || "unknown"}\``,
    `- adapter: \`${result.commandPlan?.adapter || "none"}\``,
    `- command: \`${result.commandPlan?.command || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildSlashCommandAdapter(options);
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
    SURFACES,
    parseArgs,
    validateAdapterInput,
    buildCommandPlan,
    classifySlashCommandAdapterEvent,
    buildSlashCommandAdapter,
    renderMarkdown,
  },
};
