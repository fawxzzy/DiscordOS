const {
  _internals: dashboardInternals,
} = require("./discordos-operator-dashboard");
const {
  _internals: preflightInternals,
} = require("./discordos-slash-command-registration-preflight");
const {
  _internals: admissionInternals,
} = require("./discordos-interaction-handler-admission");
const {
  _internals: controlPostInternals,
} = require("./discordos-music-sesh-control-post");
const {
  _internals: chatCommandInternals,
} = require("./discordos-chat-command-intake");

function parseArgs(args) {
  const options = {
    json: false,
  };
  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }
  return options;
}

function includesSlashSurface(tile) {
  return /slash/i.test(`${tile.id} ${tile.label} ${tile.command}`);
}

function buildInteractionDoctrineStatus() {
  const runtimePanel = dashboardInternals.buildProductRuntimePanel();
  const slashTiles = runtimePanel.tiles.filter(includesSlashSurface);
  const slashPreflight = preflightInternals.buildSlashCommandRegistrationPreflight({ surface: "all" });
  const applicationCommandAdmission = admissionInternals.buildInteractionHandlerAdmission({
    type: "APPLICATION_COMMAND",
  });
  const buttonAdmission = admissionInternals.buildInteractionHandlerAdmission({
    type: "MESSAGE_COMPONENT",
    customId: "music_sesh:queue",
  });
  const controlPost = controlPostInternals.buildMusicSeshControlPost();
  const chatCommand = chatCommandInternals.buildChatCommandIntake({
    content: "computa music queue Smoke Track",
  });
  const reasonCodes = [];

  if (slashTiles.length > 0) {
    reasonCodes.push("slash_command_product_surface_exposed");
  }
  if (slashPreflight.commandCount !== 0 || slashPreflight.slashCommandsAdmitted !== false) {
    reasonCodes.push("slash_command_registration_not_disabled");
  }
  if (applicationCommandAdmission.ok || applicationCommandAdmission.admitsInteraction) {
    reasonCodes.push("application_command_interaction_admitted");
  }
  if (!applicationCommandAdmission.reasonCodes.includes("slash_commands_disabled")) {
    reasonCodes.push("application_command_missing_disabled_reason");
  }
  if (!buttonAdmission.ok || buttonAdmission.route?.kind !== "message_component") {
    reasonCodes.push("button_interaction_not_admitted");
  }
  if (!controlPost.ok || controlPost.buttonCount < 1) {
    reasonCodes.push("control_post_not_ready");
  }
  if (!chatCommand.ok || chatCommand.executesAction) {
    reasonCodes.push("chat_command_intake_not_ready");
  }

  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    status: reasonCodes.length === 0 ? "interaction_doctrine_ready" : "blocked",
    slashCommandProductSurfaceCount: slashTiles.length,
    slashCommandRegistrationCommandCount: slashPreflight.commandCount,
    applicationCommandsAdmitted: applicationCommandAdmission.admitsInteraction,
    buttonInteractionsAdmitted: buttonAdmission.admitsInteraction,
    controlPostReady: controlPost.ok,
    chatCommandIntakeReady: chatCommand.ok,
    allowedInteractionSystems: ["channel_or_forum_posts_with_buttons", "chat_message_commands"],
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.interaction_doctrine.ready"
        : "discordos.interaction_doctrine.blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.interaction_doctrine",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        slashCommandProductSurfaceCount: result.slashCommandProductSurfaceCount,
        buttonInteractionsAdmitted: result.buttonInteractionsAdmitted,
        chatCommandIntakeReady: result.chatCommandIntakeReady,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Interaction Doctrine Status",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- slash command product surfaces: \`${result.slashCommandProductSurfaceCount}\``,
    `- slash registration commands: \`${result.slashCommandRegistrationCommandCount}\``,
    `- application commands admitted: \`${result.applicationCommandsAdmitted ? "true" : "false"}\``,
    `- button interactions admitted: \`${result.buttonInteractionsAdmitted ? "true" : "false"}\``,
    `- control post ready: \`${result.controlPostReady ? "true" : "false"}\``,
    `- chat command intake ready: \`${result.chatCommandIntakeReady ? "true" : "false"}\``,
    `- allowed systems: \`${result.allowedInteractionSystems.join(",")}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildInteractionDoctrineStatus(options);
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
    includesSlashSurface,
    buildInteractionDoctrineStatus,
    renderMarkdown,
  },
};
