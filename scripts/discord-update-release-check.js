const {
  _internals: draftValidatorInternals,
} = require("./discord-update-draft-validator");
const {
  _internals: preflightInternals,
} = require("./discord-update-preflight");

const DEFAULT_LIMIT = preflightInternals.DEFAULT_LIMIT;
const DEFAULT_BODY_SECTION = draftValidatorInternals.DEFAULT_BODY_SECTION;

function parseArgs(args) {
  const options = {
    json: false,
    title: null,
    bodyFile: null,
    bodySection: DEFAULT_BODY_SECTION,
    limit: DEFAULT_LIMIT,
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
    } else if (arg === "--limit") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new Error("invalid_limit");
      }
      options.limit = value;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function skippedPreflight(reasonCode) {
  return {
    ok: false,
    status: "skipped",
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    reasonCodes: [reasonCode],
  };
}

function classifyDiscordUpdateReleaseCheckEvent(result) {
  return {
    type: result.ok
      ? "discordos.updates.release_check_ready"
      : "discordos.updates.release_check_blocked",
    severity: result.ok ? "info" : "error",
    subject: "discordos.updates",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      draftStatus: result.draft.status,
      preflightStatus: result.preflight.status,
      readyForApply: result.readyForApply,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildDiscordUpdateReleaseCheck({
  title,
  bodyFile,
  bodySection = DEFAULT_BODY_SECTION,
  limit = DEFAULT_LIMIT,
  env = process.env,
  fetchImpl = fetch,
  cwd = process.cwd(),
} = {}) {
  const draft = await draftValidatorInternals.buildDiscordUpdateDraftValidation({
    title,
    bodyFile,
    bodySection,
    cwd,
  });
  const preflight = draft.ok
    ? await preflightInternals.buildDiscordUpdatePreflight({
      title,
      bodyFile,
      bodySection,
      limit,
      probeLive: true,
      env,
      fetchImpl,
      cwd,
    })
    : skippedPreflight("draft_validation_failed");
  const reasonCodes = [
    ...draft.reasonCodes,
    ...preflight.reasonCodes,
  ];
  const result = {
    ok: draft.ok && preflight.ok,
    readyForApply: draft.ok && preflight.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: draft.ok && preflight.ok ? "ready_for_apply" : "blocked",
    title,
    bodyFile,
    bodySection,
    limit,
    draft,
    preflight,
    reasonCodes,
    nextCommand: draft.ok && preflight.ok
      ? `npm run ops:discord:update-post -- --title "${title}" --body-file ${bodyFile} --body-section "${bodySection}" --apply`
      : null,
  };

  return {
    ...result,
    event: classifyDiscordUpdateReleaseCheckEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Update Release Check",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- ready for apply: \`${result.readyForApply ? "true" : "false"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- title: \`${result.title || "unknown"}\``,
    `- body file: \`${result.bodyFile || "unknown"}\``,
    `- body section: \`${result.bodySection}\``,
    `- draft status: \`${result.draft.status}\``,
    `- draft receipt links: \`${result.draft.receiptLinks?.count ?? "unknown"}\``,
    `- preflight status: \`${result.preflight.status}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  if (result.preflight.targetAdmission) {
    lines.push(`- target admitted: \`${result.preflight.targetAdmission.ok ? "true" : "false"}\``);
    lines.push(`- target live probe attempted: \`${result.preflight.targetAdmission.liveProbe.attempted ? "true" : "false"}\``);
  }
  if (result.preflight.duplicateCheck) {
    lines.push(`- duplicate check status: \`${result.preflight.duplicateCheck.status}\``);
    lines.push(`- duplicate check attempted: \`${result.preflight.duplicateCheck.attempted ? "true" : "false"}\``);
    if (result.preflight.duplicateCheck.duplicate?.messageId) {
      lines.push(`- duplicate message id: \`${result.preflight.duplicateCheck.duplicate.messageId}\``);
    }
  }
  if (result.nextCommand) {
    lines.push(`- next command: \`${result.nextCommand}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordUpdateReleaseCheck(options);
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
    DEFAULT_LIMIT,
    DEFAULT_BODY_SECTION,
    parseArgs,
    skippedPreflight,
    classifyDiscordUpdateReleaseCheckEvent,
    buildDiscordUpdateReleaseCheck,
    renderMarkdown,
  },
};
