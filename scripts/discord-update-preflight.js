const {
  _internals: updatePostInternals,
} = require("./discord-update-post");
const {
  _internals: updateLookupInternals,
} = require("./discord-update-lookup");
const {
  _internals: targetAdmissionInternals,
} = require("./discord-update-target-admission");
const { _internals: notificationRouterInternals } = require("./discordos-notification-router");
const { _internals: markerProgressInternals } = require("./discordos-workflow-marker-progress");

const DEFAULT_LIMIT = updateLookupInternals.DEFAULT_LIMIT;
const DEFAULT_EXPECTED_CHANNEL_NAME = targetAdmissionInternals.DEFAULT_EXPECTED_CHANNEL_NAME;

function parseArgs(args) {
  const options = {
    json: false,
    probeLive: false,
    expectedName: DEFAULT_EXPECTED_CHANNEL_NAME,
    title: null,
    body: null,
    bodyFile: null,
    bodySection: null,
    markers: [],
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
  title,
  body,
  bodyFile,
  bodySection,
  markers = [],
  cwd,
  markerFilePath = markerProgressInternals.DEFAULT_MARKER_FILE_PATH,
  fsImpl,
}) {
  try {
    const resolvedBody = await updatePostInternals.resolveBody({
      body,
      bodyFile,
      bodySection,
      cwd,
    });
    const markerProgress = await markerProgressInternals.resolveWorkflowMarkerProgress({
      markers,
      markerFilePath,
      fsImpl,
    });
    const payload = updatePostInternals.buildDiscordUpdatePayload({
      title,
      body: resolvedBody,
      markerProgress,
    });

    return {
      ok: true,
      status: "valid",
      reasonCodes: [],
      title: payload.embeds[0].title,
      bodyChars: payload.embeds[0].description.length,
      embedColor: payload.embeds[0].color,
      markerProgress,
      mentionsDisabled: Array.isArray(payload.allowed_mentions?.parse)
        && payload.allowed_mentions.parse.length === 0,
    };
  } catch (error) {
    return {
      ok: false,
      status: "invalid",
      reasonCodes: [normalizeReason(error)],
      title: updatePostInternals.hasValue(title) ? String(title).trim() : null,
      bodyChars: null,
      embedColor: updatePostInternals.UPDATE_EMBED_COLOR,
      markerProgress: null,
      mentionsDisabled: true,
    };
  }
}

function skippedDuplicateCheck(reasonCode) {
  return {
    ok: true,
    status: "skipped",
    attempted: false,
    httpStatus: null,
    searchedMessages: 0,
    duplicate: null,
    reasonCodes: [reasonCode],
  };
}

async function buildUpdateNotificationRoute({
  notificationRouter = notificationRouterInternals,
} = {}) {
  const routeDecision = await notificationRouter.buildNotificationRouteDecision({
    source: "updates",
    type: "discordos.updates.publication",
    severity: "info",
  });

  return {
    ok: routeDecision.ok,
    status: routeDecision.routeDecision.status,
    routeId: routeDecision.route?.id || null,
    target: routeDecision.route?.target || null,
    targetEnv: routeDecision.route?.targetEnv || null,
    fallbackTargetEnv: routeDecision.route?.fallbackTargetEnv || null,
    reasonCodes: routeDecision.reasonCodes,
  };
}

function buildNotificationRouteBlockedTargetAdmission({ env, probeLive, expectedName }) {
  const target = targetAdmissionInternals.getConfiguredTarget(env);
  const liveProbe = {
    attempted: false,
    ok: true,
    status: "skipped",
    reasonCodes: ["notification_route_not_admitted"],
  };
  const result = {
    ok: false,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    probeLive,
    expectedName,
    target,
    liveProbe,
    reasonCodes: ["notification_route_not_admitted"],
  };

  return {
    ...result,
    event: targetAdmissionInternals.classifyUpdateTargetAdmissionEvent(result),
  };
}

async function buildDuplicateCheck({
  payloadCheck,
  notificationRoute,
  targetAdmission,
  probeLive,
  title,
  limit,
  env,
  fetchImpl,
}) {
  if (!payloadCheck.ok) {
    return skippedDuplicateCheck("payload_invalid");
  }
  if (!notificationRoute.ok) {
    return skippedDuplicateCheck("notification_route_not_admitted");
  }
  if (!targetAdmission.ok) {
    return skippedDuplicateCheck("target_not_admitted");
  }
  if (!probeLive) {
    return skippedDuplicateCheck("probe_live_flag_not_set");
  }

  const lookup = await updateLookupInternals.buildDiscordUpdateLookup({
    title,
    limit,
    env,
    fetchImpl,
  });

  if (lookup.ok && lookup.status === "found") {
    return {
      ok: false,
      status: "duplicate_found",
      attempted: true,
      httpStatus: lookup.httpStatus || null,
      searchedMessages: lookup.searchedMessages || 0,
      duplicate: lookup.message,
      reasonCodes: ["updates_duplicate_title_found"],
    };
  }

  if (lookup.status === "not_found") {
    return {
      ok: true,
      status: "not_found",
      attempted: true,
      httpStatus: lookup.httpStatus || null,
      searchedMessages: lookup.searchedMessages || 0,
      duplicate: null,
      reasonCodes: [],
    };
  }

  return {
    ok: false,
    status: lookup.status || "failed",
    attempted: true,
    httpStatus: lookup.httpStatus || null,
    searchedMessages: lookup.searchedMessages || 0,
    duplicate: null,
    reasonCodes: lookup.reasonCodes?.length
      ? lookup.reasonCodes
      : ["updates_duplicate_lookup_failed"],
  };
}

function classifyDiscordUpdatePreflightEvent(result) {
  return {
    type: result.ok
      ? "discordos.updates.preflight_ready"
      : "discordos.updates.preflight_blocked",
    severity: result.ok ? "info" : "error",
    subject: "discordos.updates",
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

async function buildDiscordUpdatePreflight({
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
  markerFilePath = markerProgressInternals.DEFAULT_MARKER_FILE_PATH,
  fsImpl,
  notificationRouter = notificationRouterInternals,
} = {}) {
  const payload = await buildPayloadCheck({
    title,
    body,
    bodyFile,
    bodySection,
    markers,
    cwd,
    markerFilePath,
    fsImpl,
  });
  const notificationRoute = await buildUpdateNotificationRoute({ notificationRouter });
  const targetAdmission = notificationRoute.ok
    ? await targetAdmissionInternals.buildDiscordUpdateTargetAdmission({
      env,
      probeLive,
      expectedName,
      fetchImpl,
    })
    : buildNotificationRouteBlockedTargetAdmission({
      env,
      probeLive,
      expectedName,
    });
  const duplicateCheck = await buildDuplicateCheck({
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
    event: classifyDiscordUpdatePreflightEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Update Preflight",
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
    const result = await buildDiscordUpdatePreflight(options);
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
    parseArgs,
    normalizeReason,
    buildPayloadCheck,
    buildUpdateNotificationRoute,
    buildNotificationRouteBlockedTargetAdmission,
    skippedDuplicateCheck,
    buildDuplicateCheck,
    classifyDiscordUpdatePreflightEvent,
    buildDiscordUpdatePreflight,
    renderMarkdown,
  },
};
