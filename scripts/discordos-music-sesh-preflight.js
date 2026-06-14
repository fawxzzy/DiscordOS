const ALLOWED_ACTIONS = new Set([
  "open_session",
  "queue_item",
  "vote",
  "lock_session",
  "close_session",
]);

function parseArgs(args) {
  const options = {
    json: false,
    sessionId: null,
    action: null,
    guildId: null,
    channelId: null,
    actorDiscordUserId: null,
    itemTitle: null,
    voteDirection: null,
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
    } else if (arg === "--vote-direction") {
      options.voteDirection = readValue(args, index, "missing_vote_direction_value");
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSnowflake(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value.trim());
}

function validateMusicSeshPreflightInput(input) {
  const reasonCodes = [];

  if (!hasValue(input.sessionId)) {
    reasonCodes.push("session_id_missing");
  }
  if (!hasValue(input.action)) {
    reasonCodes.push("action_missing");
  } else if (!ALLOWED_ACTIONS.has(input.action)) {
    reasonCodes.push("action_not_admitted");
  }
  if (!isSnowflake(input.guildId)) {
    reasonCodes.push("guild_id_invalid");
  }
  if (!isSnowflake(input.channelId)) {
    reasonCodes.push("channel_id_invalid");
  }
  if (!isSnowflake(input.actorDiscordUserId)) {
    reasonCodes.push("actor_user_id_invalid");
  }
  if (input.action === "queue_item" && !hasValue(input.itemTitle)) {
    reasonCodes.push("item_title_missing");
  }
  if (hasValue(input.itemTitle) && input.itemTitle.length > 120) {
    reasonCodes.push("item_title_too_long");
  }
  if (input.action === "vote" && !["up", "down"].includes(input.voteDirection)) {
    reasonCodes.push("vote_direction_invalid");
  }

  return {
    ok: reasonCodes.length === 0,
    reasonCodes,
  };
}

function buildMusicSeshPreview(input) {
  return {
    sessionId: input.sessionId,
    action: input.action,
    guildIdShapeValid: isSnowflake(input.guildId),
    channelIdShapeValid: isSnowflake(input.channelId),
    actorDiscordUserIdShapeValid: isSnowflake(input.actorDiscordUserId),
    itemTitlePresent: hasValue(input.itemTitle),
    voteDirection: input.voteDirection || null,
    proof: {
      strength: "local_contract",
      receiptPath: null,
      messageId: null,
      generatedAt: null,
    },
  };
}

function classifyMusicSeshPreflightEvent(result) {
  return {
    type: result.ok
      ? "discordos.music_sesh.preflight_ready"
      : "discordos.music_sesh.preflight_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.music_sesh.preflight",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      action: result.preview.action || "unknown",
      liveActionAllowed: result.liveActionAllowed,
      providerCallsAllowed: result.providerCallsAllowed,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function buildDiscordOSMusicSeshPreflight(input = {}) {
  const validation = validateMusicSeshPreflightInput(input);
  const result = {
    ok: validation.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: validation.ok ? "ready" : "blocked",
    liveActionAllowed: false,
    providerCallsAllowed: false,
    playbackAllowed: false,
    persistenceAllowed: false,
    requiresExplicitLiveLane: true,
    preview: buildMusicSeshPreview(input),
    reasonCodes: validation.reasonCodes,
  };

  return {
    ...result,
    event: classifyMusicSeshPreflightEvent(result),
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Preflight",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- action: \`${result.preview.action || "unknown"}\``,
    `- live action allowed: \`${result.liveActionAllowed ? "true" : "false"}\``,
    `- provider calls allowed: \`${result.providerCallsAllowed ? "true" : "false"}\``,
    `- playback allowed: \`${result.playbackAllowed ? "true" : "false"}\``,
    `- persistence allowed: \`${result.persistenceAllowed ? "true" : "false"}\``,
    `- explicit live lane required: \`${result.requiresExplicitLiveLane ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildDiscordOSMusicSeshPreflight(options);
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
    ALLOWED_ACTIONS,
    parseArgs,
    hasValue,
    isSnowflake,
    validateMusicSeshPreflightInput,
    buildMusicSeshPreview,
    classifyMusicSeshPreflightEvent,
    buildDiscordOSMusicSeshPreflight,
    renderMarkdown,
  },
};
