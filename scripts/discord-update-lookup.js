const {
  _internals: updatePostInternals,
} = require("./discord-update-post");
const {
  _internals: targetAdmissionInternals,
} = require("./discord-update-target-admission");

const DISCORD_API_BASE = updatePostInternals.DISCORD_API_BASE;
const DEFAULT_LIMIT = 25;

function parseArgs(args) {
  const options = {
    json: false,
    title: null,
    limit: DEFAULT_LIMIT,
    receiptFile: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--title") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_title_value");
      }
      options.title = value.trim();
      index += 1;
    } else if (arg === "--limit") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new Error("invalid_limit");
      }
      options.limit = value;
      index += 1;
    } else if (arg === "--receipt-file") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_receipt_file_value");
      }
      options.receiptFile = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return targetAdmissionInternals.normalizeEnvValue(value).length > 0;
}

function getLookupTarget(env = process.env) {
  if (hasValue(env.DISCORDOS_UPDATES_CHANNEL_ID) && hasValue(env.DISCORDOS_BOT_TOKEN)) {
    return {
      configured: true,
      type: "discord_bot_channel",
    };
  }

  return {
    configured: false,
    type: "none",
  };
}

async function fetchDiscordChannelMessages({
  channelId,
  token,
  limit = DEFAULT_LIMIT,
  fetchImpl = fetch,
}) {
  const url = `${DISCORD_API_BASE}/channels/${channelId}/messages?limit=${limit}`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bot ${token}`,
    },
  });
  const body = typeof response.json === "function" ? await response.json().catch(() => null) : null;
  return {
    ok: response.ok,
    status: response.status,
    messages: Array.isArray(body) ? body : [],
  };
}

function getMessageEmbedTitle(message) {
  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    if (typeof embed?.title === "string" && embed.title.trim().length > 0) {
      return embed.title.trim();
    }
  }
  return null;
}

function findMessageByEmbedTitle(messages, title) {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle) {
    throw new Error("missing_title");
  }

  return messages.find((message) => getMessageEmbedTitle(message) === normalizedTitle) || null;
}

function summarizeMessage(message) {
  if (!message) {
    return null;
  }

  return {
    messageId: typeof message.id === "string" ? message.id : null,
    channelId: typeof message.channel_id === "string" ? message.channel_id : null,
    timestamp: typeof message.timestamp === "string" ? message.timestamp : null,
    title: getMessageEmbedTitle(message),
  };
}

async function buildDiscordUpdateLookup({
  title,
  limit = DEFAULT_LIMIT,
  receiptFile,
  env = process.env,
  fetchImpl = fetch,
  cwd = process.cwd(),
}) {
  if (!hasValue(title)) {
    throw new Error("missing_title");
  }

  const target = getLookupTarget(env);
  if (!target.configured) {
    return {
      ok: false,
      destructive: false,
      sendsMessages: false,
      writesReceipt: false,
      status: "blocked",
      target,
      reasonCodes: ["updates_lookup_target_missing"],
      receipt: {
        requested: hasValue(receiptFile),
        written: false,
        path: receiptFile || null,
      },
    };
  }

  const result = await fetchDiscordChannelMessages({
    channelId: targetAdmissionInternals.normalizeEnvValue(env.DISCORDOS_UPDATES_CHANNEL_ID),
    token: targetAdmissionInternals.normalizeEnvValue(env.DISCORDOS_BOT_TOKEN),
    limit,
    fetchImpl,
  });

  if (!result.ok) {
    return {
      ok: false,
      destructive: false,
      sendsMessages: false,
      writesReceipt: false,
      status: "failed",
      target,
      httpStatus: result.status,
      reasonCodes: ["updates_lookup_request_failed"],
      receipt: {
        requested: hasValue(receiptFile),
        written: false,
        path: receiptFile || null,
      },
    };
  }

  const message = summarizeMessage(findMessageByEmbedTitle(result.messages, title));
  if (!message) {
    return {
      ok: false,
      destructive: false,
      sendsMessages: false,
      writesReceipt: false,
      status: "not_found",
      target,
      httpStatus: result.status,
      searchedMessages: result.messages.length,
      reasonCodes: ["updates_message_not_found"],
      receipt: {
        requested: hasValue(receiptFile),
        written: false,
        path: receiptFile || null,
      },
    };
  }

  const lookupResult = {
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesReceipt: false,
    status: "found",
    target,
    httpStatus: result.status,
    searchedMessages: result.messages.length,
    message,
    reasonCodes: [],
    receipt: {
      requested: hasValue(receiptFile),
      written: false,
      path: receiptFile || null,
    },
  };

  if (hasValue(receiptFile)) {
    try {
      const receipt = await updatePostInternals.writeDiscordPublicationReceipt({
        receiptFile,
        cwd,
        result: {
          status: "sent",
          sendsMessages: true,
          httpStatus: result.status,
          channelId: message.channelId,
          messageId: message.messageId,
          timestamp: message.timestamp,
        },
      });
      return {
        ...lookupResult,
        writesReceipt: true,
        receipt,
      };
    } catch (_error) {
      return {
        ...lookupResult,
        ok: false,
        status: "found_receipt_write_failed",
        writesReceipt: false,
        reasonCodes: ["receipt_write_failed"],
        receipt: {
          requested: true,
          written: false,
          path: receiptFile,
        },
      };
    }
  }

  return lookupResult;
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Update Lookup",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes receipt: \`${result.writesReceipt ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- target type: \`${result.target.type}\``,
    `- target configured: \`${result.target.configured ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  if (result.httpStatus) {
    lines.push(`- http status: \`${result.httpStatus}\``);
  }
  if (typeof result.searchedMessages === "number") {
    lines.push(`- searched messages: \`${result.searchedMessages}\``);
  }
  if (result.message) {
    lines.push(`- message id: \`${result.message.messageId || "unknown"}\``);
    lines.push(`- channel id: \`${result.message.channelId || "unknown"}\``);
    lines.push(`- timestamp: \`${result.message.timestamp || "unknown"}\``);
    lines.push(`- title: \`${result.message.title || "unknown"}\``);
  }
  if (result.receipt?.requested) {
    lines.push(`- receipt file: \`${result.receipt.path}\``);
    lines.push(`- receipt written: \`${result.receipt.written ? "true" : "false"}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordUpdateLookup(options);
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
    DISCORD_API_BASE,
    DEFAULT_LIMIT,
    parseArgs,
    hasValue,
    getLookupTarget,
    fetchDiscordChannelMessages,
    getMessageEmbedTitle,
    findMessageByEmbedTitle,
    summarizeMessage,
    buildDiscordUpdateLookup,
    renderMarkdown,
  },
};
