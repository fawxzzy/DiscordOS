const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const CLEANUP_ENV = "DISCORDOS_MAZER_LEGACY_FEEDBACK_CLEANUP";
const CLEANUP_ENV_VALUE = "enabled";
const DEFAULT_BOARD_PATH = path.resolve(
  process.cwd(),
  "config",
  "discordos-mazer-feedback-board.json"
);
const DEFAULT_ARCHIVE_NAME = "archived-mazer-feedback";
const DELETE_CONFIRMATION = "confirm-delete-legacy-mazer-feedback";

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
    boardPath: DEFAULT_BOARD_PATH,
    forumChannelId: null,
    action: "readback",
    renameTo: DEFAULT_ARCHIVE_NAME,
    allowCleanup: false,
    apply: false,
    confirmDelete: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--board-path") {
      options.boardPath = path.resolve(readValue(args, index, "missing_board_path_value"));
      index += 1;
    } else if (arg === "--forum-channel-id") {
      options.forumChannelId = readValue(args, index, "missing_forum_channel_id_value");
      index += 1;
    } else if (arg === "--action") {
      options.action = readValue(args, index, "missing_action_value");
      index += 1;
    } else if (arg === "--rename-to") {
      options.renameTo = readValue(args, index, "missing_rename_to_value");
      index += 1;
    } else if (arg === "--allow-cleanup") {
      options.allowCleanup = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === `--${DELETE_CONFIRMATION}`) {
      options.confirmDelete = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeEnvValue(value) {
  return String(value || "")
    .replace(/^\u00EF\u00BB\u00BF/, "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function resolveCleanupAdmission({ allowCleanup, env }) {
  const envEnabled = env?.[CLEANUP_ENV] === CLEANUP_ENV_VALUE;
  if (!allowCleanup && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "cleanup_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowCleanup && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "cleanup_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["mazer_legacy_feedback_cleanup_double_guard_missing"],
  };
}

async function readBoardConfig(boardPath = DEFAULT_BOARD_PATH, fsImpl = fs) {
  const raw = await fsImpl.readFile(boardPath, "utf8");
  return JSON.parse(raw);
}

function resolveLegacyForumChannelId({ board, forumChannelId }) {
  return forumChannelId
    || board?.board?.legacyForumChannelId
    || null;
}

async function discordRequest({
  path: requestPath,
  token,
  method = "GET",
  body = null,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(`${updatePostInternals.DISCORD_API_BASE}${requestPath}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = response.status === 204 || typeof response.json !== "function"
    ? null
    : await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function fetchChannel({ channelId, token, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${channelId}`,
    token,
    fetchImpl,
  });
}

async function patchChannel({ channelId, token, body, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${channelId}`,
    token,
    method: "PATCH",
    body,
    fetchImpl,
  });
}

async function deleteChannel({ channelId, token, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${channelId}`,
    token,
    method: "DELETE",
    fetchImpl,
  });
}

function summarizeChannel(channel) {
  return {
    id: channel?.id || null,
    name: channel?.name || null,
    type: Number.isFinite(Number(channel?.type)) ? Number(channel.type) : null,
    guildId: channel?.guild_id || null,
    parentId: channel?.parent_id || null,
    topic: channel?.topic || null,
  };
}

function isMazerLegacyTarget(channel) {
  const name = String(channel?.name || "").toLowerCase();
  return name.includes("mazer") && (name.includes("feedback") || name.includes("archived"));
}

function normalizeAction(action) {
  const normalized = String(action || "").trim().toLowerCase();
  if (["readback", "archive", "rename", "delete"].includes(normalized)) {
    return normalized;
  }
  return "unsupported";
}

async function buildMazerLegacyFeedbackForumCleanup({
  env = process.env,
  fetchImpl = fetch,
  fsImpl = fs,
  boardPath = DEFAULT_BOARD_PATH,
  forumChannelId = null,
  action = "readback",
  renameTo = DEFAULT_ARCHIVE_NAME,
  allowCleanup = false,
  apply = false,
  confirmDelete = false,
} = {}) {
  const reasonCodes = [];
  const token = normalizeEnvValue(env.DISCORDOS_BOT_TOKEN);
  const normalizedAction = normalizeAction(action);
  if (normalizedAction === "unsupported") {
    reasonCodes.push("unsupported_legacy_cleanup_action");
  }
  if (!hasValue(token)) {
    reasonCodes.push("bot_token_missing");
  }

  let board = null;
  try {
    board = await readBoardConfig(boardPath, fsImpl);
  } catch {
    reasonCodes.push("mazer_feedback_board_config_read_failed");
  }

  const configuredLegacyForumChannelId = board?.board?.legacyForumChannelId || null;
  const targetForumChannelId = resolveLegacyForumChannelId({ board, forumChannelId });
  if (!hasValue(targetForumChannelId)) {
    reasonCodes.push("legacy_forum_channel_id_missing");
  }
  if (
    hasValue(configuredLegacyForumChannelId)
    && hasValue(targetForumChannelId)
    && targetForumChannelId !== configuredLegacyForumChannelId
  ) {
    reasonCodes.push("legacy_forum_channel_id_mismatch");
  }

  const admission = resolveCleanupAdmission({ allowCleanup, env });
  reasonCodes.push(...admission.reasonCodes);
  if (apply && normalizedAction !== "readback" && !admission.admitted) {
    reasonCodes.push("mazer_legacy_feedback_cleanup_not_admitted");
  }
  if (apply && normalizedAction === "delete" && !confirmDelete) {
    reasonCodes.push("legacy_forum_delete_confirmation_missing");
  }
  if ((normalizedAction === "archive" || normalizedAction === "rename") && !hasValue(renameTo)) {
    reasonCodes.push("legacy_forum_rename_target_missing");
  }
  if (
    (normalizedAction === "archive" || normalizedAction === "rename")
    && hasValue(renameTo)
    && !String(renameTo).toLowerCase().includes("mazer")
  ) {
    reasonCodes.push("legacy_forum_rename_target_not_mazer_scoped");
  }

  let channelRead = {
    ok: false,
    status: null,
    channel: null,
  };
  if (hasValue(token) && hasValue(targetForumChannelId)) {
    const fetched = await fetchChannel({
      channelId: targetForumChannelId,
      token,
      fetchImpl,
    });
    channelRead = {
      ok: fetched.ok,
      status: fetched.status,
      channel: summarizeChannel(fetched.payload),
    };
    if (!fetched.ok) {
      reasonCodes.push("legacy_forum_channel_read_failed");
    }
  }

  if (channelRead.channel && channelRead.channel.type !== 15) {
    reasonCodes.push("legacy_forum_channel_not_forum_type");
  }
  if (channelRead.channel && !isMazerLegacyTarget(channelRead.channel)) {
    reasonCodes.push("legacy_forum_channel_not_mazer_feedback_named");
  }

  const canMutate = apply
    && admission.admitted
    && channelRead.ok
    && channelRead.channel?.type === 15
    && isMazerLegacyTarget(channelRead.channel)
    && !reasonCodes.includes("legacy_forum_channel_id_mismatch")
    && !reasonCodes.includes("unsupported_legacy_cleanup_action")
    && hasValue(token);

  let mutation = {
    attempted: false,
    ok: false,
    action: normalizedAction,
    httpStatus: null,
    resultChannel: null,
  };
  if (canMutate && normalizedAction === "archive") {
    const patched = await patchChannel({
      channelId: targetForumChannelId,
      token,
      body: {
        name: renameTo || DEFAULT_ARCHIVE_NAME,
        topic: "Archived legacy Mazer feedback forum. Current board lives in project-feedback / mazer.",
      },
      fetchImpl,
    });
    mutation = {
      attempted: true,
      ok: patched.ok,
      action: normalizedAction,
      httpStatus: patched.status,
      resultChannel: summarizeChannel(patched.payload),
    };
    if (!patched.ok) {
      reasonCodes.push("legacy_forum_archive_patch_failed");
    }
  } else if (canMutate && normalizedAction === "rename") {
    const patched = await patchChannel({
      channelId: targetForumChannelId,
      token,
      body: { name: renameTo },
      fetchImpl,
    });
    mutation = {
      attempted: true,
      ok: patched.ok,
      action: normalizedAction,
      httpStatus: patched.status,
      resultChannel: summarizeChannel(patched.payload),
    };
    if (!patched.ok) {
      reasonCodes.push("legacy_forum_rename_patch_failed");
    }
  } else if (canMutate && normalizedAction === "delete" && confirmDelete) {
    const deleted = await deleteChannel({
      channelId: targetForumChannelId,
      token,
      fetchImpl,
    });
    mutation = {
      attempted: true,
      ok: deleted.ok,
      action: normalizedAction,
      httpStatus: deleted.status,
      resultChannel: summarizeChannel(deleted.payload),
    };
    if (!deleted.ok) {
      reasonCodes.push("legacy_forum_delete_failed");
    }
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const result = {
    ok: uniqueReasonCodes.length === 0 && (!mutation.attempted || mutation.ok),
    destructive: normalizedAction === "delete",
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: channelRead.ok || mutation.attempted,
    slashCommandsAdmitted: false,
    status: !apply || normalizedAction === "readback"
      ? "readback"
      : uniqueReasonCodes.length === 0
        ? "cleanup_applied"
        : "blocked",
    boardId: board?.board?.id || null,
    configuredLegacyForumChannelId,
    targetForumChannelId,
    action: normalizedAction,
    renameTo,
    admission,
    channelRead,
    mutation,
    reasonCodes: uniqueReasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.mazer.legacy_feedback_forum_cleanup_ready"
        : "discordos.mazer.legacy_feedback_forum_cleanup_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.mazer.legacy_feedback_forum_cleanup",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        action: result.action,
        targetForumChannelId: result.targetForumChannelId || "none",
        channelName: result.channelRead.channel?.name || "none",
        mutationAttempted: result.mutation.attempted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Mazer Legacy Feedback Forum Cleanup",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- status: \`${result.status}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- board: \`${result.boardId || "unknown"}\``,
    `- configured legacy forum: \`${result.configuredLegacyForumChannelId || "none"}\``,
    `- target legacy forum: \`${result.targetForumChannelId || "none"}\``,
    `- channel name: \`${result.channelRead.channel?.name || "none"}\``,
    `- action: \`${result.action}\``,
    `- mutation attempted: \`${result.mutation.attempted ? "true" : "false"}\``,
    `- mutation status: \`${result.mutation.httpStatus || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMazerLegacyFeedbackForumCleanup(options);
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
    CLEANUP_ENV,
    CLEANUP_ENV_VALUE,
    DEFAULT_BOARD_PATH,
    DEFAULT_ARCHIVE_NAME,
    DELETE_CONFIRMATION,
    parseArgs,
    resolveCleanupAdmission,
    readBoardConfig,
    resolveLegacyForumChannelId,
    summarizeChannel,
    isMazerLegacyTarget,
    normalizeAction,
    buildMazerLegacyFeedbackForumCleanup,
    renderMarkdown,
  },
};
