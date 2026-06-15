const {
  _internals: reviewSearchInternals,
} = require("./discordos-moderation-audit-review-search");

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
    live: false,
    subcommand: "search",
    caseId: null,
    action: null,
    subjectFingerprint: null,
    limit: 10,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--live") {
      options.live = true;
    } else if (arg === "--subcommand") {
      options.subcommand = readValue(args, index, "missing_subcommand_value");
      index += 1;
    } else if (arg === "--case-id") {
      options.caseId = readValue(args, index, "missing_case_id_value");
      index += 1;
    } else if (arg === "--action") {
      options.action = readValue(args, index, "missing_action_value");
      index += 1;
    } else if (arg === "--subject-fingerprint") {
      options.subjectFingerprint = readValue(args, index, "missing_subject_fingerprint_value");
      index += 1;
    } else if (arg === "--limit") {
      options.limit = Number.parseInt(readValue(args, index, "missing_limit_value"), 10);
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function buildModerationReviewSlashCommand({
  env = process.env,
  fetchImpl = fetch,
  ...input
} = {}) {
  const subcommandOk = ["search", "case"].includes(input.subcommand);
  const search = subcommandOk
    ? await reviewSearchInternals.buildModerationAuditReviewSearch({
        live: input.live,
        caseId: input.caseId,
        action: input.action,
        subjectFingerprint: input.subjectFingerprint,
        limit: input.limit,
        env,
        fetchImpl,
      })
    : null;
  const reasonCodes = [...new Set([
    ...(subcommandOk ? [] : ["subcommand_not_admitted"]),
    ...(search?.reasonCodes || []),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    executesModerationAction: false,
    status: reasonCodes.length === 0 ? "slash_review_ready" : "blocked",
    slash: {
      command: "/mod-review",
      subcommand: input.subcommand || null,
      ephemeralResponseRecommended: true,
    },
    search: search
      ? {
          status: search.status,
          liveAttempted: search.liveAttempted,
          returnedCount: search.returnedCount,
          rows: search.rows,
        }
      : null,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.moderation.review_slash_command_ready"
        : "discordos.moderation.review_slash_command_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.moderation.review_slash_command",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        subcommand: result.slash.subcommand || "unknown",
        returnedCount: result.search?.returnedCount || 0,
        reasonCodeCount: result.reasonCodes.length,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Moderation Review Slash Command",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- executes moderation action: \`${result.executesModerationAction ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- command: \`${result.slash.command}\``,
    `- subcommand: \`${result.slash.subcommand || "unknown"}\``,
    `- returned count: \`${result.search?.returnedCount || 0}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildModerationReviewSlashCommand(options);
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
    buildModerationReviewSlashCommand,
    renderMarkdown,
  },
};
