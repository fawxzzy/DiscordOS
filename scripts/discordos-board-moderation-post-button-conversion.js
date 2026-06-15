const CONVERTED_SURFACES = [
  {
    id: "board",
    label: "Board",
    postButtonSurface: "board_post_buttons",
    chatMessageSurface: "computa board ...",
    buttons: [
      { customId: "board:open", action: "opened" },
      { customId: "board:progress", action: "in_progress" },
      { customId: "board:close", action: "closed" },
    ],
    nextCommand: "npm run ops:discordos:board-lifecycle-sync",
  },
  {
    id: "moderation",
    label: "Moderation",
    postButtonSurface: "moderation_post_buttons",
    chatMessageSurface: "computa mod ...",
    buttons: [
      { customId: "moderation:review", action: "review" },
      { customId: "moderation:escalate", action: "escalate" },
      { customId: "moderation:resolve", action: "resolve" },
    ],
    nextCommand: "npm run ops:discordos:moderation-audit-dashboard",
  },
];

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

function classifyConvertedSurface(surface) {
  const reasonCodes = [];
  if (!surface?.id || !["board", "moderation"].includes(surface.id)) {
    reasonCodes.push("surface_id_not_admitted");
  }
  if (!Array.isArray(surface?.buttons) || surface.buttons.length === 0) {
    reasonCodes.push("surface_buttons_missing");
  }
  if (surface?.slashCommandSurface) {
    reasonCodes.push("slash_command_surface_present");
  }
  if (typeof surface?.nextCommand !== "string" || !surface.nextCommand.startsWith("npm run ops:discordos:")) {
    reasonCodes.push("next_command_invalid");
  }
  return {
    ...surface,
    ok: reasonCodes.length === 0,
    slashCommandSurface: null,
    reasonCodes,
  };
}

function buildBoardModerationPostButtonConversion() {
  const surfaces = CONVERTED_SURFACES.map(classifyConvertedSurface);
  const reasonCodes = [...new Set(surfaces.flatMap((surface) => surface.reasonCodes))];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "post_button_conversion_ready" : "blocked",
    surfaceCount: surfaces.length,
    buttonCount: surfaces.reduce((sum, surface) => sum + surface.buttons.length, 0),
    surfaces,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.board_moderation.post_button_conversion_ready"
        : "discordos.board_moderation.post_button_conversion_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.board_moderation.post_button_conversion",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        surfaceCount: result.surfaceCount,
        buttonCount: result.buttonCount,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Board Moderation Post Button Conversion",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- surfaces: \`${result.surfaceCount}\``,
    `- buttons: \`${result.buttonCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];
  for (const surface of result.surfaces) {
    lines.push(`- surface ${surface.id}: buttons \`${surface.buttons.length}\`, command \`${surface.nextCommand}\``);
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildBoardModerationPostButtonConversion(options);
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
    CONVERTED_SURFACES,
    parseArgs,
    classifyConvertedSurface,
    buildBoardModerationPostButtonConversion,
    renderMarkdown,
  },
};
