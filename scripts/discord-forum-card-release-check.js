const {
  _internals: lifecycleInternals,
} = require("./discord-forum-card-lifecycle");
const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const DEFAULT_LIMIT = updatePostInternals.DEFAULT_PREFLIGHT_LIMIT;

function quoteCliValue(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderRepeatedArgs(flag, values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => ` ${flag} ${quoteCliValue(value)}`)
    .join("");
}

function parseArgs(args) {
  const options = {
    json: false,
    workflow: null,
    cardId: null,
    state: null,
    stateNote: null,
    title: null,
    body: null,
    bodyFile: null,
    bodySection: null,
    receiptFile: null,
    markers: [],
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--workflow") {
      const value = args[index + 1];
      if (!updatePostInternals.hasValue(value)) {
        throw new Error("missing_workflow_value");
      }
      options.workflow = value.trim();
      index += 1;
    } else if (arg === "--card-id") {
      const value = args[index + 1];
      if (!updatePostInternals.hasValue(value)) {
        throw new Error("missing_card_id_value");
      }
      options.cardId = value.trim();
      index += 1;
    } else if (arg === "--state") {
      const value = args[index + 1];
      if (!updatePostInternals.hasValue(value)) {
        throw new Error("missing_state_value");
      }
      options.state = value.trim();
      index += 1;
    } else if (arg === "--state-note") {
      const value = args[index + 1];
      if (!updatePostInternals.hasValue(value)) {
        throw new Error("missing_state_note_value");
      }
      options.stateNote = value.trim();
      index += 1;
    } else if (arg === "--title") {
      const value = args[index + 1];
      if (!updatePostInternals.hasValue(value)) {
        throw new Error("missing_title_value");
      }
      options.title = value.trim();
      index += 1;
    } else if (arg === "--body") {
      const value = args[index + 1];
      if (!updatePostInternals.hasValue(value)) {
        throw new Error("missing_body_value");
      }
      options.body = value.trim();
      index += 1;
    } else if (arg === "--body-file") {
      const value = args[index + 1];
      if (!updatePostInternals.hasValue(value)) {
        throw new Error("missing_body_file_value");
      }
      options.bodyFile = value.trim();
      index += 1;
    } else if (arg === "--body-section") {
      const value = args[index + 1];
      if (!updatePostInternals.hasValue(value)) {
        throw new Error("missing_body_section_value");
      }
      options.bodySection = value.trim();
      index += 1;
    } else if (arg === "--receipt-file") {
      const value = args[index + 1];
      if (!updatePostInternals.hasValue(value)) {
        throw new Error("missing_receipt_file_value");
      }
      options.receiptFile = value.trim();
      index += 1;
    } else if (arg === "--marker") {
      const value = args[index + 1];
      if (!updatePostInternals.hasValue(value)) {
        throw new Error("missing_marker_value");
      }
      options.markers.push(value.trim());
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

function skippedPreflight(reasonCode, reasonCodes = [reasonCode]) {
  return {
    ok: false,
    status: "skipped",
    destructive: false,
    sendsMessages: false,
    reasonCodes,
    targetAdmission: null,
    duplicateCheck: {
      attempted: false,
      status: "skipped",
      reasonCodes: [reasonCode],
    },
  };
}

function buildNextCommand({
  workflow,
  cardId,
  state,
  stateNote,
  title,
  body,
  bodyFile,
  bodySection,
  receiptFile,
  markers,
}) {
  const parts = [
    "npm run ops:discord:forum-card-lifecycle --",
    `--workflow ${quoteCliValue(workflow)}`,
    `--card-id ${quoteCliValue(cardId)}`,
    `--state ${quoteCliValue(state)}`,
  ];

  if (updatePostInternals.hasValue(stateNote)) {
    parts.push(`--state-note ${quoteCliValue(stateNote)}`);
  }
  if (updatePostInternals.hasValue(title)) {
    parts.push(`--title ${quoteCliValue(title)}`);
  }
  if (updatePostInternals.hasValue(body)) {
    parts.push(`--body ${quoteCliValue(body)}`);
  }
  if (updatePostInternals.hasValue(bodyFile)) {
    parts.push(`--body-file ${quoteCliValue(bodyFile)}`);
  }
  if (updatePostInternals.hasValue(bodySection)) {
    parts.push(`--body-section ${quoteCliValue(bodySection)}`);
  }
  if (updatePostInternals.hasValue(receiptFile)) {
    parts.push(`--receipt-file ${quoteCliValue(receiptFile)}`);
  }

  const markerArgs = renderRepeatedArgs("--marker", markers);
  return `${parts.join(" ")}${markerArgs} --apply`;
}

function sanitizeRenderedCommand(command) {
  if (!updatePostInternals.hasValue(command)) {
    return null;
  }

  return String(command).replace(/--body\s+"(?:\\.|[^"])*"/g, '--body "<redacted>"');
}

function classifyForumCardReleaseCheckEvent(result) {
  return {
    type: result.ok
      ? "discordos.forum_card.release_check_ready"
      : "discordos.forum_card.release_check_blocked",
    severity: result.ok ? "info" : "error",
    subject: "discordos.forum_card",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      lifecycleStatus: result.lifecycle.status,
      preflightStatus: result.preflight.status,
      readyForApply: result.readyForApply,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildDiscordForumCardReleaseCheck({
  workflow,
  cardId,
  state,
  stateNote = null,
  title,
  body,
  bodyFile,
  bodySection,
  receiptFile,
  markers = [],
  limit = DEFAULT_LIMIT,
  env = process.env,
  fetchImpl = fetch,
  cwd = process.cwd(),
  markerFilePath,
  fsImpl,
  notificationRouter,
} = {}) {
  const lifecycle = await lifecycleInternals.buildDiscordForumCardLifecycle({
    workflow,
    cardId,
    state,
    stateNote,
    title,
    body,
    bodyFile,
    bodySection,
    receiptFile,
    markers,
    apply: false,
    env,
    fetchImpl,
    cwd,
    markerFilePath,
    fsImpl,
    notificationRouter,
  });

  const preflight = lifecycle.notificationRoute.ok
    ? await updatePostInternals.runApplyPreflight({
      payload: lifecycle.payloadPreview,
      env,
      fetchImpl,
      limit,
    })
    : skippedPreflight("notification_route_not_admitted", [
      "notification_route_not_admitted",
      ...lifecycle.notificationRoute.reasonCodes,
    ]);

  const reasonCodes = [
    ...(lifecycle.notificationRoute.ok ? [] : ["notification_route_not_admitted", ...lifecycle.notificationRoute.reasonCodes]),
    ...preflight.reasonCodes,
  ];
  const readyForApply = lifecycle.ok && lifecycle.notificationRoute.ok && preflight.ok;
  const result = {
    ok: readyForApply,
    readyForApply,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: readyForApply ? "ready_for_apply" : "blocked",
    workflow,
    cardId,
    state: lifecycle.state,
    stateNote: lifecycle.stateNote,
    title: lifecycle.payloadPreview.embeds[0].title,
    bodyFile,
    bodySection,
    receiptFile,
    markers,
    limit,
    lifecycle,
    preflight,
    reasonCodes,
    nextCommand: readyForApply
      ? buildNextCommand({
        workflow,
        cardId,
        state,
        stateNote,
        title,
        body,
        bodyFile,
        bodySection,
        receiptFile,
        markers,
      })
      : null,
  };

  return {
    ...result,
    event: classifyForumCardReleaseCheckEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Forum Card Release Check",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- ready for apply: \`${result.readyForApply ? "true" : "false"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- workflow: \`${result.workflow || "unknown"}\``,
    `- card id: \`${result.cardId || "unknown"}\``,
    `- state: \`${result.state || "unknown"}\``,
    `- lifecycle status: \`${result.lifecycle.status}\``,
    `- notification route: \`${result.lifecycle.notificationRoute?.routeId || "none"}\``,
    `- notification route target: \`${result.lifecycle.notificationRoute?.target || "none"}\``,
    `- preflight status: \`${result.preflight.status}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  if (result.preflight.targetAdmission) {
    lines.push(`- target admitted: \`${result.preflight.targetAdmission.ok ? "true" : "false"}\``);
  }
  if (result.preflight.duplicateCheck) {
    lines.push(`- duplicate check status: \`${result.preflight.duplicateCheck.status}\``);
    lines.push(`- duplicate check attempted: \`${result.preflight.duplicateCheck.attempted ? "true" : "false"}\``);
    if (result.preflight.duplicateCheck.duplicate?.messageId) {
      lines.push(`- duplicate message id: \`${result.preflight.duplicateCheck.duplicate.messageId}\``);
    }
  }
  if (result.lifecycle.markerProgress?.summary?.markerCount) {
    lines.push(`- workflow marker count: \`${result.lifecycle.markerProgress.summary.markerCount}\``);
  }
  if (result.nextCommand) {
    lines.push(`- next command: \`${sanitizeRenderedCommand(result.nextCommand)}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordForumCardReleaseCheck(options);
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
    quoteCliValue,
    renderRepeatedArgs,
    parseArgs,
    skippedPreflight,
    buildNextCommand,
    sanitizeRenderedCommand,
    classifyForumCardReleaseCheckEvent,
    buildDiscordForumCardReleaseCheck,
    renderMarkdown,
  },
};
