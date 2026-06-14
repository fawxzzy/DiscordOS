const fs = require("node:fs/promises");
const {
  _internals: updatePostInternals,
} = require("./discord-update-post");
const { _internals: markerProgressInternals } = require("./discordos-workflow-marker-progress");

const DEFAULT_BODY_SECTION = "Update Post";
const REQUIRED_BODY_ANCHORS = [
  "What changed:",
  "Proof:",
  "Current production state:",
  "Verification:",
];
const SECRET_VALUE_PATTERNS = [
  { code: "discord_webhook_url_present", pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+/i },
  { code: "authorization_header_present", pattern: /\bAuthorization\s*:\s*(?:Bot|Bearer)\s+[A-Za-z0-9._-]+/i },
  { code: "bot_token_assignment_present", pattern: /\b(?:DISCORDOS_BOT_TOKEN|DISCORD_BOT_TOKEN)\s*=\s*\S+/i },
  { code: "secret_assignment_present", pattern: /\b(?:CRON_SECRET|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|PASSWORD|TOKEN)\s*=\s*\S+/i },
  { code: "placeholder_text_present", pattern: /\b(?:TODO|TBD|PLACEHOLDER|DRAFT ONLY|DO NOT POST)\b/i },
];

function parseArgs(args) {
  const options = {
    json: false,
    title: null,
    bodyFile: null,
    bodySection: DEFAULT_BODY_SECTION,
    markers: [],
    markerFilePath: markerProgressInternals.DEFAULT_MARKER_FILE_PATH,
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
    } else if (arg === "--marker") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_marker_value");
      }
      options.markers.push(value.trim());
      index += 1;
    } else if (arg === "--marker-file") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_marker_file_value");
      }
      options.markerFilePath = value.trim();
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

function getMarkdownHeadings(markdown) {
  return updatePostInternals.normalizeMarkdownBody(markdown)
    .split("\n")
    .map((line) => /^(#{1,6})\s+(.+?)\s*$/.exec(line))
    .filter(Boolean)
    .map((match) => ({
      level: match[1].length,
      text: match[2].replace(/#+\s*$/, "").trim(),
    }));
}

function hasHeading(markdown, headingText) {
  const normalizedHeading = String(headingText || "").trim().toLowerCase();
  return getMarkdownHeadings(markdown).some(
    (heading) => heading.text.trim().toLowerCase() === normalizedHeading
  );
}

function extractDurableReceiptLinks(markdown) {
  const matches = updatePostInternals.normalizeMarkdownBody(markdown)
    .match(/`?docs\/ops\/[A-Za-z0-9._/-]+\.md`?/g) || [];
  return [...new Set(matches.map((match) => match.replace(/`/g, "")))];
}

function validateRequiredBodyAnchors(body) {
  return REQUIRED_BODY_ANCHORS.filter((anchor) => !body.includes(anchor))
    .map((anchor) => `missing_public_body_anchor:${anchor.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`);
}

function validatePublicSafeText({ title, body, markdown }) {
  const joined = [title, body, markdown].filter(Boolean).join("\n");
  return SECRET_VALUE_PATTERNS
    .filter(({ pattern }) => pattern.test(joined))
    .map(({ code }) => code);
}

async function buildPayloadCheck({
  title,
  body,
  markers = [],
  markerFilePath = markerProgressInternals.DEFAULT_MARKER_FILE_PATH,
  fsImpl = fs,
}) {
  try {
    const markerProgress = await markerProgressInternals.resolveWorkflowMarkerProgress({
      markers,
      markerFilePath,
      fsImpl,
    });
    const payload = updatePostInternals.buildDiscordUpdatePayload({
      title,
      body,
      markerProgress,
    });
    return {
      ok: true,
      status: "valid",
      reasonCodes: [],
      title: payload.embeds[0].title,
      bodyChars: payload.embeds[0].description.length,
      maxTitleChars: updatePostInternals.MAX_EMBED_TITLE_LENGTH,
      maxBodyChars: updatePostInternals.MAX_EMBED_DESCRIPTION_LENGTH,
      markerProgress,
      mentionsDisabled: Array.isArray(payload.allowed_mentions?.parse)
        && payload.allowed_mentions.parse.length === 0,
    };
  } catch (error) {
    return {
      ok: false,
      status: "invalid",
      reasonCodes: [error instanceof Error ? error.message : String(error)],
      title: hasValue(title) ? String(title).trim() : null,
      bodyChars: hasValue(body) ? body.length : null,
      maxTitleChars: updatePostInternals.MAX_EMBED_TITLE_LENGTH,
      maxBodyChars: updatePostInternals.MAX_EMBED_DESCRIPTION_LENGTH,
      markerProgress: null,
      mentionsDisabled: true,
    };
  }
}

function classifyDiscordUpdateDraftEvent(result) {
  return {
    type: result.ok
      ? "discordos.updates.draft_ready"
      : "discordos.updates.draft_blocked",
    severity: result.ok ? "info" : "error",
    subject: "discordos.updates",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      payloadStatus: result.payload.status,
      bodyAnchorStatus: result.bodyAnchors.ok ? "pass" : "fail",
      receiptLinkStatus: result.receiptLinks.ok ? "pass" : "fail",
      publicSafetyStatus: result.publicSafety.ok ? "pass" : "fail",
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildDiscordUpdateDraftValidation({
  title,
  bodyFile,
  bodySection = DEFAULT_BODY_SECTION,
  markers = [],
  cwd = process.cwd(),
  markerFilePath = markerProgressInternals.DEFAULT_MARKER_FILE_PATH,
  fsImpl = fs,
} = {}) {
  if (!hasValue(bodyFile)) {
    throw new Error("missing_body_file");
  }

  const resolvedBodyFile = updatePostInternals.resolveRepoPath(bodyFile, cwd);
  const markdown = await fsImpl.readFile(resolvedBodyFile, "utf8");
  const body = updatePostInternals.extractMarkdownSection(markdown, bodySection);
  const payload = await buildPayloadCheck({
    title,
    body,
    markers,
    markerFilePath,
    fsImpl,
  });
  const bodyAnchorReasonCodes = validateRequiredBodyAnchors(body);
  const durableReceipts = extractDurableReceiptLinks(markdown);
  const receiptReasonCodes = [];
  if (!hasHeading(markdown, "Durable Receipts")) {
    receiptReasonCodes.push("missing_durable_receipts_heading");
  }
  if (durableReceipts.length === 0) {
    receiptReasonCodes.push("missing_durable_receipt_links");
  }
  const publicSafetyReasonCodes = validatePublicSafeText({
    title,
    body,
    markdown,
  });
  const reasonCodes = [
    ...payload.reasonCodes,
    ...bodyAnchorReasonCodes,
    ...receiptReasonCodes,
    ...publicSafetyReasonCodes,
  ];
  const result = {
    ok: payload.ok
      && bodyAnchorReasonCodes.length === 0
      && receiptReasonCodes.length === 0
      && publicSafetyReasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: reasonCodes.length === 0 ? "ready" : "blocked",
    bodyFile,
    bodySection,
    markers,
    payload,
    bodyAnchors: {
      ok: bodyAnchorReasonCodes.length === 0,
      required: REQUIRED_BODY_ANCHORS,
      reasonCodes: bodyAnchorReasonCodes,
    },
    receiptLinks: {
      ok: receiptReasonCodes.length === 0,
      durableReceipts,
      count: durableReceipts.length,
      reasonCodes: receiptReasonCodes,
    },
    publicSafety: {
      ok: publicSafetyReasonCodes.length === 0,
      reasonCodes: publicSafetyReasonCodes,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: classifyDiscordUpdateDraftEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Update Draft Validation",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- body file: \`${result.bodyFile}\``,
    `- body section: \`${result.bodySection}\``,
    `- payload status: \`${result.payload.status}\``,
    `- payload title: \`${result.payload.title || "unknown"}\``,
    `- payload body chars: \`${result.payload.bodyChars ?? "unknown"}\``,
    `- workflow marker count: \`${result.payload.markerProgress?.summary?.markerCount ?? 0}\``,
    `- body anchors: \`${result.bodyAnchors.ok ? "pass" : "fail"}\``,
    `- durable receipt links: \`${result.receiptLinks.count}\``,
    `- public safety: \`${result.publicSafety.ok ? "pass" : "fail"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordUpdateDraftValidation(options);
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
    DEFAULT_BODY_SECTION,
    REQUIRED_BODY_ANCHORS,
    SECRET_VALUE_PATTERNS,
    parseArgs,
    hasValue,
    getMarkdownHeadings,
    hasHeading,
    extractDurableReceiptLinks,
    validateRequiredBodyAnchors,
    validatePublicSafeText,
    buildPayloadCheck,
    classifyDiscordUpdateDraftEvent,
    buildDiscordUpdateDraftValidation,
    renderMarkdown,
  },
};
