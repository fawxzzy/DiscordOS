const INTERACTION_TYPES = new Set(["PING", "MESSAGE_COMPONENT"]);

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
    type: "PING",
    surface: "music",
    command: "music",
    sessionId: "music-sesh-smoke",
    action: "queue_item",
    itemTitle: "Smoke Track",
    customId: "music_sesh:queue",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--type") {
      options.type = readValue(args, index, "missing_type_value");
      index += 1;
    } else if (arg === "--surface") {
      options.surface = readValue(args, index, "missing_surface_value");
      index += 1;
    } else if (arg === "--command") {
      options.command = readValue(args, index, "missing_command_value");
      index += 1;
    } else if (arg === "--session-id") {
      options.sessionId = readValue(args, index, "missing_session_id_value");
      index += 1;
    } else if (arg === "--action") {
      options.action = readValue(args, index, "missing_action_value");
      index += 1;
    } else if (arg === "--item-title") {
      options.itemTitle = readValue(args, index, "missing_item_title_value");
      index += 1;
    } else if (arg === "--custom-id") {
      options.customId = readValue(args, index, "missing_custom_id_value");
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function buildInteractionHandlerAdmission(input = {}) {
  const type = input.type || "PING";
  const reasonCodes = [];
  if (!INTERACTION_TYPES.has(type)) {
    reasonCodes.push("interaction_type_not_admitted");
  }
  if (type === "APPLICATION_COMMAND") {
    reasonCodes.push("slash_commands_disabled");
  }

  let route = null;
  if (type === "PING") {
    route = {
      kind: "pong",
      responseType: 1,
      command: null,
    };
  } else if (type === "MESSAGE_COMPONENT") {
    route = {
      kind: "message_component",
      responseType: 4,
      command: null,
      customId: input.customId || "music_sesh:queue",
      surface: String(input.customId || "").startsWith("music_sesh:") ? "music_sesh" : "unknown",
    };
  }

  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    admitsInteraction: reasonCodes.length === 0,
    executesRoute: false,
    status: reasonCodes.length === 0 ? "handler_admission_ready" : "blocked",
    type,
    route,
    reasonCodes: [...new Set(reasonCodes)],
  };

  return {
    ...result,
    event: classifyInteractionHandlerAdmissionEvent(result),
  };
}

function classifyInteractionHandlerAdmissionEvent(result) {
  return {
    type: result.ok
      ? "discordos.discord_interaction.handler_admission_ready"
      : "discordos.discord_interaction.handler_admission_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.discord_interaction.handler_admission",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      interactionType: result.type,
      routeKind: result.route?.kind || "none",
      admitsInteraction: result.admitsInteraction,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Interaction Handler Admission",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- admits interaction: \`${result.admitsInteraction ? "true" : "false"}\``,
    `- executes route: \`${result.executesRoute ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- type: \`${result.type}\``,
    `- route: \`${result.route?.kind || "none"}\``,
    `- response type: \`${result.route?.responseType || "none"}\``,
    `- command: \`${result.route?.command || "none"}\``,
    `- custom id: \`${result.route?.customId || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildInteractionHandlerAdmission(options);
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
    INTERACTION_TYPES,
    parseArgs,
    buildInteractionHandlerAdmission,
    classifyInteractionHandlerAdmissionEvent,
    renderMarkdown,
  },
};
