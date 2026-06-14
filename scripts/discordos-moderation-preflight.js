const ALLOWED_ACTIONS = new Set([
  "note",
  "warn",
  "timeout",
  "remove_content",
  "escalate",
  "close",
]);

function parseArgs(args) {
  const options = {
    json: false,
    caseId: null,
    action: null,
    subjectDiscordUserId: null,
    actorDiscordUserId: null,
    reason: null,
    note: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--case-id") {
      options.caseId = readValue(args, index, "missing_case_id_value");
      index += 1;
    } else if (arg === "--action") {
      options.action = readValue(args, index, "missing_action_value");
      index += 1;
    } else if (arg === "--subject-user-id") {
      options.subjectDiscordUserId = readValue(args, index, "missing_subject_user_id_value");
      index += 1;
    } else if (arg === "--actor-user-id") {
      options.actorDiscordUserId = readValue(args, index, "missing_actor_user_id_value");
      index += 1;
    } else if (arg === "--reason") {
      options.reason = readValue(args, index, "missing_reason_value");
      index += 1;
    } else if (arg === "--note") {
      options.note = readValue(args, index, "missing_note_value");
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

function isSnowflake(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value.trim());
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateModerationPreflightInput(input) {
  const reasonCodes = [];

  if (!hasValue(input.caseId)) {
    reasonCodes.push("case_id_missing");
  }
  if (!hasValue(input.action)) {
    reasonCodes.push("action_missing");
  } else if (!ALLOWED_ACTIONS.has(input.action)) {
    reasonCodes.push("action_not_admitted");
  }
  if (!isSnowflake(input.subjectDiscordUserId)) {
    reasonCodes.push("subject_user_id_invalid");
  }
  if (!isSnowflake(input.actorDiscordUserId)) {
    reasonCodes.push("actor_user_id_invalid");
  }
  if (!hasValue(input.reason)) {
    reasonCodes.push("reason_missing");
  }
  if (hasValue(input.note) && input.note.length > 1000) {
    reasonCodes.push("note_too_long");
  }

  return {
    ok: reasonCodes.length === 0,
    reasonCodes,
  };
}

function buildModerationActionPreview(input) {
  return {
    caseId: input.caseId,
    actionType: input.action,
    subjectDiscordUserIdShapeValid: isSnowflake(input.subjectDiscordUserId),
    actorDiscordUserIdShapeValid: isSnowflake(input.actorDiscordUserId),
    reasonPresent: hasValue(input.reason),
    notePresent: hasValue(input.note),
    proof: {
      strength: "local_contract",
      receiptPath: null,
      messageId: null,
      generatedAt: null,
    },
  };
}

function classifyModerationPreflightEvent(result) {
  return {
    type: result.ok
      ? "discordos.moderation.preflight_ready"
      : "discordos.moderation.preflight_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.moderation.preflight",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      action: result.preview.actionType || "unknown",
      liveActionAllowed: result.liveActionAllowed,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function buildDiscordOSModerationPreflight(input = {}) {
  const validation = validateModerationPreflightInput(input);
  const result = {
    ok: validation.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: validation.ok ? "ready" : "blocked",
    liveActionAllowed: false,
    requiresExplicitLiveLane: true,
    preview: buildModerationActionPreview(input),
    reasonCodes: validation.reasonCodes,
  };

  return {
    ...result,
    event: classifyModerationPreflightEvent(result),
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Moderation Preflight",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- action: \`${result.preview.actionType || "unknown"}\``,
    `- live action allowed: \`${result.liveActionAllowed ? "true" : "false"}\``,
    `- explicit live lane required: \`${result.requiresExplicitLiveLane ? "true" : "false"}\``,
    `- subject id shape valid: \`${result.preview.subjectDiscordUserIdShapeValid ? "true" : "false"}\``,
    `- actor id shape valid: \`${result.preview.actorDiscordUserIdShapeValid ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildDiscordOSModerationPreflight(options);
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
    isSnowflake,
    hasValue,
    validateModerationPreflightInput,
    buildModerationActionPreview,
    classifyModerationPreflightEvent,
    buildDiscordOSModerationPreflight,
    renderMarkdown,
  },
};
