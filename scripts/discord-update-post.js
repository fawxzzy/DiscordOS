const fs = require("node:fs/promises");
const path = require("node:path");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const UPDATE_EMBED_COLOR = 5763719;
const MAX_EMBED_TITLE_LENGTH = 256;
const MAX_EMBED_DESCRIPTION_LENGTH = 4096;

function parseArgs(args) {
  const options = {
    json: false,
    title: null,
    body: null,
    bodyFile: null,
    bodySection: null,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === "--title") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_title_value");
      }
      options.title = value.trim();
      index += 1;
    } else if (arg === "--body") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_body_value");
      }
      options.body = value.trim();
      index += 1;
    } else if (arg === "--body-file") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_body_file_value");
      }
      options.bodyFile = value.trim();
      index += 1;
    } else if (arg === "--body-section") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_body_section_value");
      }
      options.bodySection = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveRepoPath(filePath, cwd = process.cwd()) {
  return path.resolve(cwd, filePath);
}

function normalizeMarkdownBody(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function extractMarkdownSection(markdown, sectionName) {
  const normalizedName = String(sectionName || "").trim().toLowerCase();
  if (!normalizedName) {
    throw new Error("missing_body_section_value");
  }

  const lines = normalizeMarkdownBody(markdown).split("\n");
  let startIndex = -1;
  let startLevel = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (!match) {
      continue;
    }
    const headingText = match[2].replace(/#+\s*$/, "").trim().toLowerCase();
    if (headingText === normalizedName) {
      startIndex = index + 1;
      startLevel = match[1].length;
      break;
    }
  }

  if (startIndex === -1) {
    throw new Error(`body_section_not_found:${sectionName}`);
  }

  let endIndex = lines.length;
  for (let index = startIndex; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+/.exec(lines[index]);
    if (match && match[1].length <= startLevel) {
      endIndex = index;
      break;
    }
  }

  const section = normalizeMarkdownBody(lines.slice(startIndex, endIndex).join("\n"));
  if (!section) {
    throw new Error(`body_section_empty:${sectionName}`);
  }
  return section;
}

async function resolveBody({ body, bodyFile, bodySection, cwd = process.cwd() }) {
  if (hasValue(body) && hasValue(bodyFile)) {
    throw new Error("body_and_body_file_are_mutually_exclusive");
  }
  if (hasValue(bodySection) && !hasValue(bodyFile)) {
    throw new Error("body_section_requires_body_file");
  }

  if (hasValue(body)) {
    return normalizeMarkdownBody(body);
  }

  if (!hasValue(bodyFile)) {
    throw new Error("missing_body_or_body_file");
  }

  const raw = await fs.readFile(resolveRepoPath(bodyFile, cwd), "utf8");
  return hasValue(bodySection)
    ? extractMarkdownSection(raw, bodySection)
    : normalizeMarkdownBody(raw);
}

function validatePayloadInputs({ title, body }) {
  if (!hasValue(title)) {
    throw new Error("missing_title");
  }
  if (!hasValue(body)) {
    throw new Error("missing_body");
  }
  if (title.length > MAX_EMBED_TITLE_LENGTH) {
    throw new Error("title_too_long");
  }
  if (body.length > MAX_EMBED_DESCRIPTION_LENGTH) {
    throw new Error("body_too_long");
  }
}

function buildDiscordUpdatePayload({ title, body }) {
  const normalizedTitle = String(title || "").trim();
  const normalizedBody = normalizeMarkdownBody(body);
  validatePayloadInputs({
    title: normalizedTitle,
    body: normalizedBody,
  });

  return {
    content: "",
    embeds: [
      {
        title: normalizedTitle,
        description: normalizedBody,
        color: UPDATE_EMBED_COLOR,
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

function getUpdateTarget(env = process.env) {
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

async function sendDiscordBotChannel({ channelId, token, payload, fetchImpl = fetch }) {
  const response = await fetchImpl(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return {
    ok: response.ok,
    status: response.status,
  };
}

async function buildDiscordUpdatePost({
  title,
  body,
  bodyFile,
  bodySection,
  apply = false,
  env = process.env,
  fetchImpl = fetch,
  cwd = process.cwd(),
}) {
  const resolvedBody = await resolveBody({
    body,
    bodyFile,
    bodySection,
    cwd,
  });
  const payload = buildDiscordUpdatePayload({
    title,
    body: resolvedBody,
  });
  const target = getUpdateTarget(env);

  if (!apply) {
    return {
      ok: true,
      destructive: false,
      sendsMessages: false,
      status: "dry_run",
      target,
      reasonCodes: ["apply_flag_not_set"],
      payloadPreview: payload,
    };
  }

  if (!target.configured) {
    return {
      ok: false,
      destructive: false,
      sendsMessages: false,
      status: "blocked",
      target,
      reasonCodes: ["updates_target_missing"],
      payloadPreview: payload,
    };
  }

  const result = await sendDiscordBotChannel({
    channelId: env.DISCORDOS_UPDATES_CHANNEL_ID.trim(),
    token: env.DISCORDOS_BOT_TOKEN.trim(),
    payload,
    fetchImpl,
  });

  return {
    ok: result.ok,
    destructive: false,
    sendsMessages: result.ok,
    status: result.ok ? "sent" : "failed",
    target,
    httpStatus: result.status,
    reasonCodes: result.ok ? [] : ["updates_post_request_failed"],
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Update Post",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- target type: \`${result.target.type}\``,
    `- target configured: \`${result.target.configured ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  if (result.httpStatus) {
    lines.push(`- http status: \`${result.httpStatus}\``);
  }
  if (result.payloadPreview) {
    lines.push(`- payload title: \`${result.payloadPreview.embeds[0].title}\``);
    lines.push(`- payload body chars: \`${result.payloadPreview.embeds[0].description.length}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordUpdatePost(options);
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
    UPDATE_EMBED_COLOR,
    MAX_EMBED_TITLE_LENGTH,
    MAX_EMBED_DESCRIPTION_LENGTH,
    parseArgs,
    hasValue,
    resolveRepoPath,
    normalizeMarkdownBody,
    extractMarkdownSection,
    resolveBody,
    validatePayloadInputs,
    buildDiscordUpdatePayload,
    getUpdateTarget,
    sendDiscordBotChannel,
    buildDiscordUpdatePost,
    renderMarkdown,
  },
};
