const ACTION_ALIASES = new Map([
  ["queue", "queue_item"],
  ["add", "queue_item"],
  ["play", "queue_item"],
  ["skip", "vote_skip"],
  ["status", "status"],
  ["close", "close_session"],
]);

function parseArgs(args) {
  const options = {
    json: false,
    wakeWord: "computa",
    content: "computa music queue Smoke Track",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--wake-word") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_wake_word_value");
      }
      options.wakeWord = value.trim();
      index += 1;
    } else if (arg === "--content") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_content_value");
      }
      options.content = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function buildChatCommandIntake({ wakeWord = "computa", content = "" } = {}) {
  const tokens = String(content || "").trim().split(/\s+/).filter(Boolean);
  const reasonCodes = [];
  const normalizedWakeWord = String(wakeWord || "").trim().toLowerCase();
  const heardWakeWord = tokens[0]?.toLowerCase() === normalizedWakeWord;
  const domain = tokens[1]?.toLowerCase() || null;
  const actionToken = tokens[2]?.toLowerCase() || null;
  const action = ACTION_ALIASES.get(actionToken) || null;
  const itemTitle = action === "queue_item" ? tokens.slice(3).join(" ").trim() : "";

  if (!heardWakeWord) {
    reasonCodes.push("wake_word_not_matched");
  }
  if (domain !== "music") {
    reasonCodes.push("domain_not_admitted");
  }
  if (!action) {
    reasonCodes.push("action_not_admitted");
  }
  if (action === "queue_item" && itemTitle.length === 0) {
    reasonCodes.push("queue_item_title_missing");
  }

  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    executesAction: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "chat_command_intake_ready" : "blocked",
    wakeWord: normalizedWakeWord,
    contentShape: heardWakeWord ? "wake_word_command" : "ignored_message",
    domain,
    action,
    itemTitle: itemTitle || null,
    commandPlan: reasonCodes.length === 0
      ? {
          workflow: "music_sesh",
          action,
          itemTitle: itemTitle || null,
          nextCommand: "npm run ops:discordos:music-sesh-write-adapter-guard",
        }
      : null,
    reasonCodes: [...new Set(reasonCodes)],
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.chat_command.intake_ready"
        : "discordos.chat_command.intake_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.chat_command.intake",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        domain: result.domain || "none",
        action: result.action || "none",
        executesAction: result.executesAction,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Chat Command Intake",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- executes action: \`${result.executesAction ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- wake word: \`${result.wakeWord}\``,
    `- content shape: \`${result.contentShape}\``,
    `- domain: \`${result.domain || "none"}\``,
    `- action: \`${result.action || "none"}\``,
    `- item title: \`${result.itemTitle || "none"}\``,
    `- next command: \`${result.commandPlan?.nextCommand || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildChatCommandIntake(options);
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
    ACTION_ALIASES,
    parseArgs,
    buildChatCommandIntake,
    renderMarkdown,
  },
};
