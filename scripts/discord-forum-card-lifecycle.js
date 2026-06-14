const fs = require("node:fs/promises");
const {
  _internals: updatePostInternals,
} = require("./discord-update-post");
const {
  _internals: targetAdmissionInternals,
} = require("./discord-update-target-admission");
const { _internals: notificationRouterInternals } = require("./discordos-notification-router");
const { _internals: markerProgressInternals } = require("./discordos-workflow-marker-progress");

const FORUM_CARD_NOTIFICATION_SOURCE = "forum-card";
const FORUM_CARD_NOTIFICATION_TYPE = "discordos.forum_card.lifecycle";
const FORUM_CARD_STATES = ["opened", "in_progress", "blocked", "completed", "closed"];

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
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function normalizeForumCardState(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (!FORUM_CARD_STATES.includes(normalized)) {
    throw new Error(`invalid_forum_card_state:${normalized || "unknown"}`);
  }
  return normalized;
}

function formatForumCardState(state) {
  return normalizeForumCardState(state)
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function buildForumCardLifecycleTitle({ workflow, cardId, state, title }) {
  if (updatePostInternals.hasValue(title)) {
    return title.trim();
  }

  if (!updatePostInternals.hasValue(workflow)) {
    throw new Error("missing_workflow");
  }
  if (!updatePostInternals.hasValue(cardId)) {
    throw new Error("missing_card_id");
  }

  return `${workflow.trim()} Card ${cardId.trim()} ${formatForumCardState(state)}`;
}

function buildForumCardLifecycleMetadata({
  workflow,
  cardId,
  state,
  stateNote = null,
}) {
  if (!updatePostInternals.hasValue(workflow)) {
    throw new Error("missing_workflow");
  }
  if (!updatePostInternals.hasValue(cardId)) {
    throw new Error("missing_card_id");
  }

  const lines = [
    "## Card Lifecycle",
    "",
    `- workflow: \`${workflow.trim()}\``,
    `- card id: \`${cardId.trim()}\``,
    `- state: \`${normalizeForumCardState(state)}\``,
  ];

  if (updatePostInternals.hasValue(stateNote)) {
    lines.push(`- state note: \`${stateNote.trim()}\``);
  }

  return lines.join("\n");
}

function buildForumCardLifecycleBody({
  workflow,
  cardId,
  state,
  stateNote = null,
  body,
  markerProgress = null,
}) {
  const metadata = buildForumCardLifecycleMetadata({
    workflow,
    cardId,
    state,
    stateNote,
  });
  const normalizedBody = updatePostInternals.normalizeMarkdownBody(body);
  const combined = normalizedBody
    ? `${metadata}\n\n${normalizedBody}`
    : metadata;

  return markerProgressInternals.appendWorkflowMarkerMarkdown(combined, markerProgress);
}

async function buildForumCardNotificationRoute({
  notificationRouter = notificationRouterInternals,
} = {}) {
  const routeDecision = await notificationRouter.buildNotificationRouteDecision({
    source: FORUM_CARD_NOTIFICATION_SOURCE,
    type: FORUM_CARD_NOTIFICATION_TYPE,
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

async function buildDiscordForumCardLifecycle({
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
  apply = false,
  env = process.env,
  fetchImpl = fetch,
  cwd = process.cwd(),
  markerFilePath = markerProgressInternals.DEFAULT_MARKER_FILE_PATH,
  fsImpl = fs,
  notificationRouter = notificationRouterInternals,
} = {}) {
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
  const normalizedTitle = buildForumCardLifecycleTitle({
    workflow,
    cardId,
    state,
    title,
  });
  const payload = updatePostInternals.buildDiscordUpdatePayload({
    title: normalizedTitle,
    body: buildForumCardLifecycleBody({
      workflow,
      cardId,
      state,
      stateNote,
      body: resolvedBody,
      markerProgress,
    }),
  });
  const target = updatePostInternals.getUpdateTarget(env);
  const notificationRoute = await buildForumCardNotificationRoute({ notificationRouter });
  const normalizedState = normalizeForumCardState(state);

  if (!apply) {
    return {
      ok: true,
      destructive: false,
      sendsMessages: false,
      status: "dry_run",
      workflow,
      cardId,
      state: normalizedState,
      stateNote: updatePostInternals.hasValue(stateNote) ? stateNote.trim() : null,
      target,
      notificationRoute,
      reasonCodes: ["apply_flag_not_set"],
      markerProgress,
      receipt: {
        requested: updatePostInternals.hasValue(receiptFile),
        written: false,
        path: receiptFile || null,
      },
      payloadPreview: payload,
    };
  }

  if (!notificationRoute.ok) {
    return {
      ok: false,
      destructive: false,
      sendsMessages: false,
      status: "blocked",
      workflow,
      cardId,
      state: normalizedState,
      stateNote: updatePostInternals.hasValue(stateNote) ? stateNote.trim() : null,
      target,
      notificationRoute,
      reasonCodes: ["notification_route_not_admitted", ...notificationRoute.reasonCodes],
      markerProgress,
      receipt: {
        requested: updatePostInternals.hasValue(receiptFile),
        written: false,
        path: receiptFile || null,
      },
      payloadPreview: payload,
    };
  }

  if (!target.configured) {
    return {
      ok: false,
      destructive: false,
      sendsMessages: false,
      status: "blocked",
      workflow,
      cardId,
      state: normalizedState,
      stateNote: updatePostInternals.hasValue(stateNote) ? stateNote.trim() : null,
      target,
      notificationRoute,
      reasonCodes: ["updates_target_missing"],
      markerProgress,
      receipt: {
        requested: updatePostInternals.hasValue(receiptFile),
        written: false,
        path: receiptFile || null,
      },
      payloadPreview: payload,
    };
  }

  const preflight = await updatePostInternals.runApplyPreflight({
    payload,
    env,
    fetchImpl,
  });

  if (!preflight.ok) {
    return {
      ok: false,
      destructive: false,
      sendsMessages: false,
      status: "preflight_blocked",
      workflow,
      cardId,
      state: normalizedState,
      stateNote: updatePostInternals.hasValue(stateNote) ? stateNote.trim() : null,
      target,
      notificationRoute,
      reasonCodes: preflight.reasonCodes,
      markerProgress,
      receipt: {
        requested: updatePostInternals.hasValue(receiptFile),
        written: false,
        path: receiptFile || null,
      },
      payloadPreview: payload,
      preflight,
    };
  }

  const sendResult = await updatePostInternals.sendDiscordBotChannel({
    channelId: targetAdmissionInternals.normalizeEnvValue(env.DISCORDOS_UPDATES_CHANNEL_ID),
    token: targetAdmissionInternals.normalizeEnvValue(env.DISCORDOS_BOT_TOKEN),
    payload,
    fetchImpl,
  });

  const postResult = {
    ok: sendResult.ok,
    destructive: false,
    sendsMessages: sendResult.ok,
    status: sendResult.ok ? "sent" : "failed",
    workflow,
    cardId,
    state: normalizedState,
    stateNote: updatePostInternals.hasValue(stateNote) ? stateNote.trim() : null,
    target,
    notificationRoute,
    httpStatus: sendResult.status,
    messageId: sendResult.messageId,
    channelId: sendResult.channelId,
    timestamp: sendResult.timestamp,
    reasonCodes: sendResult.ok ? [] : ["forum_card_lifecycle_post_request_failed"],
    markerProgress,
    preflight,
  };

  if (postResult.ok && updatePostInternals.hasValue(receiptFile)) {
    try {
      const receipt = await updatePostInternals.writeDiscordPublicationReceipt({
        receiptFile,
        result: postResult,
        cwd,
      });
      return {
        ...postResult,
        receipt,
      };
    } catch (_error) {
      return {
        ...postResult,
        ok: false,
        status: "sent_receipt_write_failed",
        receipt: {
          requested: true,
          written: false,
          path: receiptFile,
        },
        reasonCodes: ["receipt_write_failed"],
      };
    }
  }

  return {
    ...postResult,
    receipt: {
      requested: updatePostInternals.hasValue(receiptFile),
      written: false,
      path: receiptFile || null,
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Forum Card Lifecycle",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- workflow: \`${result.workflow || "unknown"}\``,
    `- card id: \`${result.cardId || "unknown"}\``,
    `- state: \`${result.state || "unknown"}\``,
    `- state note: \`${result.stateNote || "none"}\``,
    `- target type: \`${result.target.type}\``,
    `- target configured: \`${result.target.configured ? "true" : "false"}\``,
    `- notification route: \`${result.notificationRoute?.routeId || "none"}\``,
    `- notification route target: \`${result.notificationRoute?.target || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  if (result.httpStatus) {
    lines.push(`- http status: \`${result.httpStatus}\``);
  }
  if (result.messageId) {
    lines.push(`- message id: \`${result.messageId}\``);
  }
  if (result.channelId) {
    lines.push(`- channel id: \`${result.channelId}\``);
  }
  if (result.timestamp) {
    lines.push(`- timestamp: \`${result.timestamp}\``);
  }
  if (result.receipt?.requested) {
    lines.push(`- receipt file: \`${result.receipt.path}\``);
    lines.push(`- receipt written: \`${result.receipt.written ? "true" : "false"}\``);
  }
  if (result.markerProgress?.summary?.markerCount) {
    lines.push(`- workflow marker count: \`${result.markerProgress.summary.markerCount}\``);
    for (const marker of result.markerProgress.markers) {
      lines.push(
        `- workflow marker: \`${marker.name}\` \`${marker.completionPercent}%\` sections=\`${marker.sectionLabels.join(",")}\``
      );
    }
  }
  if (result.payloadPreview) {
    lines.push(`- payload title: \`${result.payloadPreview.embeds[0].title}\``);
    lines.push(`- payload body chars: \`${result.payloadPreview.embeds[0].description.length}\``);
  }
  if (result.preflight) {
    lines.push(`- preflight status: \`${result.preflight.status}\``);
    lines.push(`- preflight target admitted: \`${result.preflight.targetAdmission.ok ? "true" : "false"}\``);
    lines.push(`- preflight duplicate status: \`${result.preflight.duplicateCheck.status}\``);
    if (result.preflight.duplicateCheck.duplicate?.messageId) {
      lines.push(`- preflight duplicate message id: \`${result.preflight.duplicateCheck.duplicate.messageId}\``);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordForumCardLifecycle(options);
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
    FORUM_CARD_NOTIFICATION_SOURCE,
    FORUM_CARD_NOTIFICATION_TYPE,
    FORUM_CARD_STATES,
    parseArgs,
    normalizeForumCardState,
    formatForumCardState,
    buildForumCardLifecycleTitle,
    buildForumCardLifecycleMetadata,
    buildForumCardLifecycleBody,
    buildForumCardNotificationRoute,
    buildDiscordForumCardLifecycle,
    renderMarkdown,
  },
};
