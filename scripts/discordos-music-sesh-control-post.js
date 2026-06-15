const BUTTONS = [
  {
    id: "music_sesh_queue",
    label: "Queue",
    customId: "music_sesh:queue",
    style: 1,
    action: "queue_item",
  },
  {
    id: "music_sesh_skip",
    label: "Skip",
    customId: "music_sesh:vote_skip",
    style: 2,
    action: "vote_skip",
  },
  {
    id: "music_sesh_status",
    label: "Status",
    customId: "music_sesh:status",
    style: 2,
    action: "status",
  },
  {
    id: "music_sesh_close",
    label: "Close",
    customId: "music_sesh:close",
    style: 4,
    action: "close_session",
  },
];

function parseArgs(args) {
  const options = {
    json: false,
    channelName: "music-sesh",
    sessionId: "music-sesh-control",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--channel-name") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_channel_name_value");
      }
      options.channelName = value.trim();
      index += 1;
    } else if (arg === "--session-id") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_session_id_value");
      }
      options.sessionId = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function buildMusicSeshControlPost({ channelName = "music-sesh", sessionId = "music-sesh-control" } = {}) {
  const components = [
    {
      type: 1,
      components: BUTTONS.map((button) => ({
        type: 2,
        style: button.style,
        label: button.label,
        custom_id: button.customId,
      })),
    },
  ];
  const result = {
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    slashCommandsAdmitted: false,
    status: "control_post_ready",
    channelName,
    sessionId,
    interactionTypes: ["MESSAGE_COMPONENT"],
    buttonCount: BUTTONS.length,
    buttons: BUTTONS,
    payloadPreview: {
      content: "",
      embeds: [
        {
          title: "Music Sesh",
          description: "Use the buttons on this post to queue, skip, check status, or close the session.",
          color: 5763719,
        },
      ],
      components,
      allowed_mentions: {
        parse: [],
      },
    },
    reasonCodes: [],
  };

  return {
    ...result,
    event: {
      type: "discordos.music_sesh.control_post_ready",
      severity: "info",
      subject: "discordos.music_sesh.control_post",
      status: "pass",
      dimensions: {
        buttonCount: result.buttonCount,
        channelName: result.channelName,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Music Sesh Control Post",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- channel: \`${result.channelName}\``,
    `- buttons: \`${result.buttonCount}\``,
    `- interaction types: \`${result.interactionTypes.join(",")}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const button of result.buttons) {
    lines.push(`- button ${button.id}: custom id \`${button.customId}\`, action \`${button.action}\``);
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildMusicSeshControlPost(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
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
    BUTTONS,
    parseArgs,
    buildMusicSeshControlPost,
    renderMarkdown,
  },
};
