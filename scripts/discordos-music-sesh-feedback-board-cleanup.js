const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const CLEANUP_ENV = "DISCORDOS_MUSIC_SESH_BOARD_CLEANUP";
const CLEANUP_ENV_VALUE = "enabled";
const DEFAULT_MUSIC_SESH_FORUM_CHANNEL_ID = "1508139160853286942";
const DEFAULT_KEEP_THREAD_ID = "1508141153835421798";
const DEFAULT_KEEP_TITLE_CONTAINS = "Music Sesh Phase 8";

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
    forumChannelId: DEFAULT_MUSIC_SESH_FORUM_CHANNEL_ID,
    keepThreadId: DEFAULT_KEEP_THREAD_ID,
    keepTitleContains: DEFAULT_KEEP_TITLE_CONTAINS,
    allowCleanup: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--forum-channel-id") {
      options.forumChannelId = readValue(args, index, "missing_forum_channel_id_value");
      index += 1;
    } else if (arg === "--keep-thread-id") {
      options.keepThreadId = readValue(args, index, "missing_keep_thread_id_value");
      index += 1;
    } else if (arg === "--keep-title-contains") {
      options.keepTitleContains = readValue(args, index, "missing_keep_title_contains_value");
      index += 1;
    } else if (arg === "--allow-cleanup") {
      options.allowCleanup = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
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
    reasonCodes: ["feedback_board_cleanup_double_guard_missing"],
  };
}

async function discordRequest({
  path,
  token,
  method = "GET",
  body = null,
  fetchImpl = fetch,
  retryCount = 2,
}) {
  const response = await fetchImpl(`${updatePostInternals.DISCORD_API_BASE}${path}`, {
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
  if (response.status === 429 && retryCount > 0) {
    const retryAfterSeconds = Number(payload?.retry_after);
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? Math.ceil(retryAfterSeconds * 1000) + 250
      : 1500;
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    return discordRequest({
      path,
      token,
      method,
      body,
      fetchImpl,
      retryCount: retryCount - 1,
    });
  }
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function fetchForumChannel({ forumChannelId, token, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${forumChannelId}`,
    token,
    fetchImpl,
  });
}

async function fetchActiveThreads({ guildId, token, fetchImpl = fetch }) {
  return discordRequest({
    path: `/guilds/${guildId}/threads/active`,
    token,
    fetchImpl,
  });
}

async function fetchArchivedThreads({ forumChannelId, token, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${forumChannelId}/threads/archived/public?limit=100`,
    token,
    fetchImpl,
  });
}

async function archiveThread({ threadId, token, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${threadId}`,
    token,
    method: "PATCH",
    body: {
      archived: true,
      locked: true,
    },
    fetchImpl,
  });
}

function summarizeThread(thread) {
  return {
    id: thread?.id || null,
    name: thread?.name || null,
    parentId: thread?.parent_id || null,
    archived: thread?.thread_metadata?.archived === true,
    locked: thread?.thread_metadata?.locked === true,
  };
}

function uniqueThreads(threads = []) {
  const seen = new Set();
  return threads.filter((thread) => {
    if (!thread?.id || seen.has(thread.id)) {
      return false;
    }
    seen.add(thread.id);
    return true;
  });
}

function isKeepThread(thread, { keepThreadId, keepTitleContains }) {
  return thread?.id === keepThreadId
    || (hasValue(keepTitleContains) && String(thread?.name || "").includes(keepTitleContains));
}

async function listMusicSeshForumThreads({
  forumChannelId = DEFAULT_MUSIC_SESH_FORUM_CHANNEL_ID,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const reasonCodes = [];
  if (!hasValue(env.DISCORDOS_BOT_TOKEN)) {
    reasonCodes.push("bot_token_missing");
  }
  if (!hasValue(forumChannelId)) {
    reasonCodes.push("forum_channel_id_missing");
  }
  if (reasonCodes.length > 0) {
    return {
      ok: false,
      forumChannelId,
      guildId: null,
      threads: [],
      reasonCodes,
    };
  }

  const channel = await fetchForumChannel({
    forumChannelId,
    token: env.DISCORDOS_BOT_TOKEN,
    fetchImpl,
  });
  if (!channel.ok || !channel.payload?.guild_id) {
    return {
      ok: false,
      forumChannelId,
      guildId: channel.payload?.guild_id || null,
      threads: [],
      reasonCodes: ["forum_channel_read_failed"],
    };
  }

  const active = await fetchActiveThreads({
    guildId: channel.payload.guild_id,
    token: env.DISCORDOS_BOT_TOKEN,
    fetchImpl,
  });
  const archived = await fetchArchivedThreads({
    forumChannelId,
    token: env.DISCORDOS_BOT_TOKEN,
    fetchImpl,
  });
  if (!active.ok) {
    reasonCodes.push("active_threads_read_failed");
  }
  if (!archived.ok) {
    reasonCodes.push("archived_threads_read_failed");
  }

  const activeThreads = (active.payload?.threads || [])
    .filter((thread) => thread.parent_id === forumChannelId);
  const archivedThreads = archived.payload?.threads || [];
  const threads = uniqueThreads([...activeThreads, ...archivedThreads]).map(summarizeThread);

  return {
    ok: reasonCodes.length === 0,
    forumChannelId,
    guildId: channel.payload.guild_id,
    threads,
    reasonCodes,
  };
}

async function buildMusicSeshFeedbackBoardCleanup({
  env = process.env,
  fetchImpl = fetch,
  forumChannelId = DEFAULT_MUSIC_SESH_FORUM_CHANNEL_ID,
  keepThreadId = DEFAULT_KEEP_THREAD_ID,
  keepTitleContains = DEFAULT_KEEP_TITLE_CONTAINS,
  allowCleanup = false,
  apply = false,
} = {}) {
  const admission = resolveCleanupAdmission({ allowCleanup, env });
  const listed = await listMusicSeshForumThreads({ forumChannelId, env, fetchImpl });
  const reasonCodes = [...admission.reasonCodes, ...listed.reasonCodes];
  const activeThreads = listed.threads.filter((thread) => !thread.archived);
  const keepThreads = activeThreads.filter((thread) => isKeepThread(thread, { keepThreadId, keepTitleContains }));
  const cleanupCandidates = activeThreads.filter((thread) => !isKeepThread(thread, { keepThreadId, keepTitleContains }));
  if (keepThreads.length !== 1) {
    reasonCodes.push("phase_8_keep_thread_not_unique");
  }
  if (apply && !admission.admitted) {
    reasonCodes.push("feedback_board_cleanup_not_admitted");
  }

  const archiveResults = [];
  const canApply = apply
    && admission.admitted
    && listed.ok
    && keepThreads.length === 1
    && hasValue(env.DISCORDOS_BOT_TOKEN);
  if (canApply) {
    for (const thread of cleanupCandidates) {
      const archived = await archiveThread({
        threadId: thread.id,
        token: env.DISCORDOS_BOT_TOKEN,
        fetchImpl,
      });
      archiveResults.push({
        threadId: thread.id,
        name: thread.name,
        ok: archived.ok,
        httpStatus: archived.status,
      });
      if (!archived.ok) {
        reasonCodes.push("feedback_board_thread_archive_failed");
      }
    }
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const result = {
    ok: uniqueReasonCodes.length === 0,
    destructive: true,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: canApply || listed.threads.length > 0,
    slashCommandsAdmitted: false,
    status: !apply
      ? "dry_run"
      : uniqueReasonCodes.length === 0
        ? "cleanup_applied"
        : "blocked",
    forumChannelId,
    keepThreadId,
    keepTitleContains,
    admission,
    activeThreadCount: activeThreads.length,
    keepThreadCount: keepThreads.length,
    cleanupCandidateCount: cleanupCandidates.length,
    archivedCount: archiveResults.filter((resultRow) => resultRow.ok).length,
    keepThreads,
    cleanupCandidates,
    archiveResults,
    reasonCodes: uniqueReasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.feedback_board_cleanup_ready"
        : "discordos.music_sesh.feedback_board_cleanup_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.feedback_board_cleanup",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        activeThreadCount: result.activeThreadCount,
        keepThreadCount: result.keepThreadCount,
        cleanupCandidateCount: result.cleanupCandidateCount,
        archivedCount: result.archivedCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Feedback Board Cleanup",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- active threads before cleanup: \`${result.activeThreadCount}\``,
    `- keep threads: \`${result.keepThreadCount}\``,
    `- cleanup candidates: \`${result.cleanupCandidateCount}\``,
    `- archived: \`${result.archivedCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshFeedbackBoardCleanup(options);
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
    DEFAULT_MUSIC_SESH_FORUM_CHANNEL_ID,
    DEFAULT_KEEP_THREAD_ID,
    DEFAULT_KEEP_TITLE_CONTAINS,
    parseArgs,
    resolveCleanupAdmission,
    summarizeThread,
    uniqueThreads,
    isKeepThread,
    listMusicSeshForumThreads,
    buildMusicSeshFeedbackBoardCleanup,
    renderMarkdown,
  },
};
