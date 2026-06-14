const fs = require("node:fs/promises");
const {
  _internals: lifecycleInternals,
} = require("./discord-forum-card-lifecycle");
const {
  _internals: updatePreflightInternals,
} = require("./discord-update-preflight");
const {
  _internals: targetAdmissionInternals,
} = require("./discord-update-target-admission");
const {
  _internals: markerProgressInternals,
} = require("./discordos-workflow-marker-progress");

const DEFAULT_LIMIT = updatePreflightInternals.DEFAULT_LIMIT;
const DEFAULT_EXPECTED_CHANNEL_NAME = updatePreflightInternals.DEFAULT_EXPECTED_CHANNEL_NAME;
const DEFAULT_MARKER_FILE_PATH = markerProgressInternals.DEFAULT_MARKER_FILE_PATH;

function parseArgs(args) {
  const options = {
    json: false,
    probeLive: false,
    expectedName: DEFAULT_EXPECTED_CHANNEL_NAME,
    workflow: null,
    cardId: null,
    state: null,
    stateNote: null,
    title: null,
    body: null,
    bodyFile: null,
    bodySection: null,
    markers: [],
    markerFilePath: DEFAULT_MARKER_FILE_PATH,
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--probe-live") {
      options.probeLive = true;
    } else if (arg === "--expected-name") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_expected_name_value");
      }
      options.expectedName = value.trim().toLowerCase();
      index += 1;
    } else if (arg === "--workflow") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_workflow_value");
      }
      options.workflow = value.trim();
      index += 1;
    } else if (arg === "--card-id") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_card_id_value");
      }
      options.cardId = value.trim();
      index += 1;
    } else if (arg === "--state") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_state_value");
      }
      options.state = value.trim();
      index += 1;
    } else if (arg === "--state-note") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_state_note_value");
      }
      options.stateNote = value.trim();
      index += 1;
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

function normalizeReason(error) {
  return error instanceof Error ? error.message : String(error);
}

async function buildPayloadCheck({
  workflow,
  cardId,
  state,
  stateNote,
  title,
  body,
  bodyFile,
  bodySection,
  markers = [],
  cwd,
  markerFilePath,
  fsImpl = fs,
  env = process.env,
  fetchImpl = fetch,
  notificationRouter,
} = {}) {
  try {
    const lifecycle = await lifecycleInternals.buildDiscordForumCardLifecycle({
      workflow,
      cardId,
      state,
      stateNote,
      title,
      body,
      bodyFile,
      bodySection,
      markers,
      apply: false,
      env,
      fetchImpl,
      cwd,
      markerFilePath,
      fsImpl,
      notificationRouter,
    });

    return {
      ok: true,
      status: "valid",
      reasonCodes: [],
      title: lifecycle.payloadPreview.embeds[0].title,
      bodyChars: lifecycle.payloadPreview.embeds[0].description.length,
      embedColor: lifecycle.payloadPreview.embeds[0].color,
      markerProgress: lifecycle.markerProgress,
      mentionsDisabled: Array.isArray(lifecycle.payloadPreview.allowed_mentions?.parse)
        && lifecycle.payloadPreview.allowed_mentions.parse.length === 0,
      payloadPreview: lifecycle.payloadPreview,
      workflow,
      cardId,
      state: lifecycle.state,
      stateNote: lifecycle.stateNote,
    };
  } catch (error) {
    return {
      ok: false,
      status: "invalid",
      reasonCodes: [normalizeReason(error)],
      title: typeof title === "string" && title.trim().length > 0 ? title.trim() : null,
      bodyChars: typeof body === "string" && body.trim().length > 0 ? body.trim().length : null,
      embedColor: null,
      markerProgress: null,
      mentionsDisabled: true,
      payloadPreview: null,
      workflow: typeof workflow === "string" && workflow.trim().length > 0 ? workflow.trim() : null,
      cardId: typeof cardId === "string" && cardId.trim().length > 0 ? cardId.trim() : null,
      state: typeof state === "string" && state.trim().length > 0 ? state.trim() : null,
      stateNote: typeof stateNote === "string" && stateNote.trim().length > 0 ? stateNote.trim() : null,
    };
  }
}

async function buildDiscordForumCardPreflight({
  workflow,
  cardId,
  state,
  stateNote = null,
  title,
  body,
  bodyFile,
  bodySection,
  markers = [],
  limit = DEFAULT_LIMIT,
  probeLive = false,
  expectedName = DEFAULT_EXPECTED_CHANNEL_NAME,
  env = process.env,
  fetchImpl = fetch,
  cwd = process.cwd(),
  markerFilePath,
  fsImpl = fs,
  notificationRouter,
} = {}) {
  const payload = await buildPayloadCheck({
    workflow,
    cardId,
    state,
    stateNote,
    title,
    body,
    bodyFile,
    bodySection,
    markers,
    cwd,
    markerFilePath,
    fsImpl,
    env,
    fetchImpl,
    notificationRouter,
  });
  const notificationRoute = await lifecycleInternals.buildForumCardNotificationRoute({
    notificationRouter,
  });
  const targetAdmission = notificationRoute.ok
    ? await targetAdmissionInternals.buildDiscordUpdateTargetAdmission({
      env,
      probeLive,
      expectedName,
      fetchImpl,
    })
    : updatePreflightInternals.buildNotificationRouteBlockedTargetAdmission({
      env,
      probeLive,
      expectedName,
    });
  const duplicateCheck = await updatePreflightInternals.buildDuplicateCheck({
    payloadCheck: payload,
    notificationRoute,
    targetAdmission,
    probeLive,
    title: payload.title || title,
    limit,
    env,
    fetchImpl,
  });

  const reasonCodes = [...new Set([
    ...payload.reasonCodes,
    ...(notificationRoute.ok ? [] : ["notification_route_not_admitted", ...notificationRoute.reasonCodes]),
    ...targetAdmission.reasonCodes,
    ...duplicateCheck.reasonCodes,
  ])].filter((reasonCode) => reasonCode !== "probe_live_flag_not_set");
  const result = {
    ok: payload.ok && notificationRoute.ok && targetAdmission.ok && duplicateCheck.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    probeLive,
    expectedName,
    limit,
    status: payload.ok && notificationRoute.ok && targetAdmission.ok && duplicateCheck.ok ? "ready" : "blocked",
    payload,
    notificationRoute,
    targetAdmission,
    duplicateCheck,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyDiscordForumCardPreflightEvent(result),
  };
}

function classifyDiscordForumCardPreflightEvent(result) {
  return {
    type: result.ok
      ? "discordos.forum_card.preflight_ready"
      : "discordos.forum_card.preflight_blocked",
    severity: result.ok ? "info" : "error",
    subject: "discordos.forum_card",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      payloadStatus: result.payload.status,
      targetAdmissionStatus: result.targetAdmission.ok ? "pass" : "fail",
      liveProbeAttempted: result.targetAdmission.liveProbe.attempted,
      duplicateCheckStatus: result.duplicateCheck.status,
      duplicateCheckAttempted: result.duplicateCheck.attempted,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Forum Card Preflight",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- probe live: \`${result.probeLive ? "true" : "false"}\``,
    `- expected channel name: \`${result.expectedName}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    `- notification route: \`${result.notificationRoute.routeId || "none"}\``,
    `- notification route target: \`${result.notificationRoute.target || "none"}\``,
    `- payload status: \`${result.payload.status}\``,
    `- workflow: \`${result.payload.workflow || "unknown"}\``,
    `- card id: \`${result.payload.cardId || "unknown"}\``,
    `- state: \`${result.payload.state || "unknown"}\``,
    `- payload title: \`${result.payload.title || "unknown"}\``,
    `- payload body chars: \`${result.payload.bodyChars ?? "unknown"}\``,
    `- workflow marker count: \`${result.payload.markerProgress?.summary?.markerCount ?? 0}\``,
    `- mentions disabled: \`${result.payload.mentionsDisabled ? "true" : "false"}\``,
    `- target admitted: \`${result.targetAdmission.ok ? "true" : "false"}\``,
    `- target type: \`${result.targetAdmission.target.type}\``,
    `- target configured: \`${result.targetAdmission.target.configured ? "true" : "false"}\``,
    `- target live probe attempted: \`${result.targetAdmission.liveProbe.attempted ? "true" : "false"}\``,
    `- duplicate check status: \`${result.duplicateCheck.status}\``,
    `- duplicate check attempted: \`${result.duplicateCheck.attempted ? "true" : "false"}\``,
  ];

  if (typeof result.targetAdmission.liveProbe.httpStatus === "number") {
    lines.push(`- target live probe http status: \`${result.targetAdmission.liveProbe.httpStatus}\``);
  }
  if (result.targetAdmission.liveProbe.channel?.name) {
    lines.push(`- channel name: \`${result.targetAdmission.liveProbe.channel.name}\``);
  }
  if (typeof result.duplicateCheck.httpStatus === "number") {
    lines.push(`- duplicate lookup http status: \`${result.duplicateCheck.httpStatus}\``);
  }
  if (typeof result.duplicateCheck.searchedMessages === "number") {
    lines.push(`- duplicate searched messages: \`${result.duplicateCheck.searchedMessages}\``);
  }
  if (result.duplicateCheck.duplicate) {
    lines.push(`- duplicate message id: \`${result.duplicateCheck.duplicate.messageId || "unknown"}\``);
    lines.push(`- duplicate channel id: \`${result.duplicateCheck.duplicate.channelId || "unknown"}\``);
    lines.push(`- duplicate timestamp: \`${result.duplicateCheck.duplicate.timestamp || "unknown"}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordForumCardPreflight(options);
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
    DEFAULT_EXPECTED_CHANNEL_NAME,
    DEFAULT_MARKER_FILE_PATH,
    parseArgs,
    normalizeReason,
    buildPayloadCheck,
    classifyDiscordForumCardPreflightEvent,
    buildDiscordForumCardPreflight,
    renderMarkdown,
  },
};
