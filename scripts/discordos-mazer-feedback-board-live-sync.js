const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: boardInternals,
} = require("./discordos-mazer-feedback-board");
const {
  _internals: updatePostInternals,
} = require("./discord-update-post");
const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");

const LIVE_SYNC_ENV = "DISCORDOS_MAZER_FEEDBACK_BOARD_SYNC";
const LIVE_SYNC_ENV_VALUE = "enabled";
const DEFAULT_FORUM_NAME = "mazer";
const DEFAULT_FORUM_LABEL = "mazer";
const DEFAULT_PROJECT_FEEDBACK_CATEGORY_CHANNEL_ID = "1508057063874629684";
const DEFAULT_PROJECT_FEEDBACK_ANCHOR_FORUM_CHANNEL_ID = "1504673475489562744";
const DEFAULT_AUTO_ARCHIVE_DURATION = 10080;
const DEFAULT_RECEIPT_PATH = path.resolve(
  process.cwd(),
  "docs",
  "ops",
  "discordos-mazer-feedback-board-live-sync-2026-07-09.md"
);

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

function parseArgs(args) {
  const boardArgs = [];
  const options = {
    allowSync: false,
    apply: false,
    forumChannelId: null,
    receiptFile: DEFAULT_RECEIPT_PATH,
    writeBoard: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--allow-sync") {
      options.allowSync = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === "--forum-channel-id") {
      options.forumChannelId = readValue(args, index, "missing_forum_channel_id_value");
      index += 1;
    } else if (arg === "--receipt-file") {
      options.receiptFile = path.resolve(readValue(args, index, "missing_receipt_file_value"));
      index += 1;
    } else if (arg === "--no-write-board") {
      options.writeBoard = false;
    } else {
      boardArgs.push(arg);
    }
  }

  return {
    ...boardInternals.parseArgs(boardArgs),
    ...options,
  };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeEnvValue(value) {
  return String(value || "")
    .replace(/^\u00EF\u00BB\u00BF/, "")
    .replace(/^\uFEFF/, "")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .trim();
}

function resolveSyncAdmission({ allowSync, env }) {
  const envEnabled = env?.[LIVE_SYNC_ENV] === LIVE_SYNC_ENV_VALUE;
  if (!allowSync && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "sync_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowSync && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "sync_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["mazer_feedback_board_sync_double_guard_missing"],
  };
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

async function fetchGuildChannels({ guildId, token, fetchImpl = fetch }) {
  return discordRequest({
    path: `/guilds/${guildId}/channels`,
    token,
    fetchImpl,
  });
}

async function createForumChannel({
  guildId,
  token,
  parentId = null,
  fetchImpl = fetch,
}) {
  const body = {
    name: DEFAULT_FORUM_NAME,
    type: 15,
    topic: "Mazer feedback board, build cards, and active gameplay planning.",
  };
  if (hasText(parentId)) {
    body.parent_id = parentId;
  }

  return discordRequest({
    path: `/guilds/${guildId}/channels`,
    token,
    method: "POST",
    body,
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

function normalizeThreadTitle(value) {
  return cardContract.normalizeThreadTitle(value);
}

function formatLimitedText(value, maxLength = 280) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatLimitedBullets(items, limit = 1, itemMaxLength = 100) {
  const safeItems = Array.isArray(items) ? items.filter(hasText) : [];
  const lines = safeItems.slice(0, limit).map((item) => `- ${formatLimitedText(item, itemMaxLength)}`);
  const remaining = safeItems.length - lines.length;
  if (remaining > 0) {
    lines.push(`- +${remaining} more tracked in source board config.`);
  }
  return lines;
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

function isMazerForumChannel(channel) {
  return channel?.type === 15 && normalizeThreadTitle(channel.name) === DEFAULT_FORUM_NAME;
}

function isForumChannel(channel) {
  return channel?.type === 15;
}

function buildCardThreadPayload(cardOrSpec) {
  const spec = cardOrSpec?.canonicalTitle ? cardOrSpec : null;
  const card = spec?.card || cardOrSpec;
  const title = spec?.canonicalTitle || card.title;
  const stateLabel = card.state === "completed" ? "done" : "not done";
  const statusLines = [
    `- card id: \`${card.id}\``,
    `- state: \`${card.state}\``,
    `- classification: \`${card.state === "backlog" ? "backlog" : "active"}\``,
  ];
  if (card.state !== "backlog") {
    statusLines.push(
      `- completion marker: \`${card.completionPercent}%\``,
      `- marker: \`${card.markerName}\``,
    );
  }
  if (card.primaryEpicId) {
    statusLines.push(`- primary epic: \`${card.primaryEpicId}\``);
  }
  if (Array.isArray(card.supportingEpicIds) && card.supportingEpicIds.length > 0) {
    statusLines.push(`- supporting epics: \`${card.supportingEpicIds.join(", ")}\``);
  }
  if (Array.isArray(card.dependsOnCardIds) && card.dependsOnCardIds.length > 0) {
    statusLines.push(`- depends on: \`${card.dependsOnCardIds.join(", ")}\``);
  }
  statusLines.push(
    `- done marker: \`${stateLabel}\``,
    `- priority: \`${card.priority}\``,
    `- reaction: \`${card.reactionStatus}\``,
  );
  const relatedCardLines = Array.isArray(card.relatedCardIds) && card.relatedCardIds.length > 0
    ? ["", "**Dependencies / Related Cards**", ...formatLimitedBullets(card.relatedCardIds)]
    : [];
  const content = [
    "# mazer",
    "",
    `**${title}**`,
    "",
    "## Status",
    ...statusLines,
    "",
    "**Purpose**",
    formatLimitedText(card.summary, 160),
    "",
    "**Why This Matters**",
    formatLimitedText(card.whyItMatters, 160),
    "",
    "**Current State**",
    formatLimitedText(card.currentStatus, 320),
    "",
    "**Work Breakdown**",
    ...formatLimitedBullets(card.workBreakdown),
    "",
    "**Next Actions**",
    ...formatLimitedBullets(card.nextActions),
    "",
    "**Acceptance Criteria**",
    ...formatLimitedBullets(card.acceptanceCriteria),
    "",
    "**Proof Plan**",
    ...formatLimitedBullets(card.proofPlan),
    ...relatedCardLines,
    "",
    "_Full reference path, command, and expanded checklist live in the source board config._",
  ].join("\n");

  return {
    name: title,
    auto_archive_duration: DEFAULT_AUTO_ARCHIVE_DURATION,
    message: {
      content,
      allowed_mentions: { parse: [] },
    },
  };
}

function summarizeThread(thread) {
  return {
    id: thread?.id || null,
    name: thread?.name || null,
    parentId: thread?.parent_id || null,
    archived: thread?.thread_metadata?.archived === true,
    messageId: thread?.message?.id || thread?.id || null,
  };
}

async function resolveForumTarget({
  forumChannelId,
  env,
  fetchImpl = fetch,
  createIfMissing = false,
}) {
  const reasonCodes = [];
  const token = normalizeEnvValue(env.DISCORDOS_BOT_TOKEN);
  if (!hasText(token)) {
    return {
      ok: false,
      forumChannelId: forumChannelId || null,
      guildId: null,
      parentId: null,
      created: false,
      reasonCodes: ["bot_token_missing"],
    };
  }

  const explicitMazerForumChannelId = normalizeEnvValue(
    forumChannelId || env.DISCORDOS_MAZER_FORUM_CHANNEL_ID
  );
  if (hasText(explicitMazerForumChannelId)) {
    const channel = await fetchChannel({
      channelId: explicitMazerForumChannelId,
      token,
      fetchImpl,
    });
    if (!channel.ok) {
      return {
        ok: false,
        forumChannelId: explicitMazerForumChannelId,
        guildId: null,
        parentId: null,
        created: false,
        reasonCodes: ["forum_channel_read_failed"],
      };
    }
    if (!isMazerForumChannel(channel.payload)) {
      return {
        ok: false,
        forumChannelId: explicitMazerForumChannelId,
        guildId: channel.payload?.guild_id || null,
        parentId: channel.payload?.parent_id || null,
        created: false,
        reasonCodes: ["mazer_forum_channel_name_or_type_invalid"],
      };
    }
    return {
      ok: true,
      forumChannelId: explicitMazerForumChannelId,
      guildId: channel.payload?.guild_id || null,
      parentId: channel.payload?.parent_id || null,
      created: false,
      reasonCodes,
    };
  }

  const anchorForumChannelId = normalizeEnvValue(
    env.DISCORDOS_PROJECT_FEEDBACK_FORUM_CHANNEL_ID
      || env.DISCORDOS_BUG_REPORT_FORUM_CHANNEL_ID
      || DEFAULT_PROJECT_FEEDBACK_ANCHOR_FORUM_CHANNEL_ID
  );
  const projectFeedbackCategoryChannelId = normalizeEnvValue(
    env.DISCORDOS_PROJECT_FEEDBACK_CATEGORY_CHANNEL_ID
      || DEFAULT_PROJECT_FEEDBACK_CATEGORY_CHANNEL_ID
  );
  const explicitForumChannelId = anchorForumChannelId;
  if (hasText(explicitForumChannelId)) {
    const channel = await fetchChannel({
      channelId: explicitForumChannelId,
      token,
      fetchImpl,
    });
    if (!channel.ok) {
      return {
        ok: false,
        forumChannelId: explicitForumChannelId,
        guildId: null,
        parentId: null,
        created: false,
        reasonCodes: ["forum_channel_read_failed"],
      };
    }
    const guildId = channel.payload?.guild_id || null;
    const parentId = channel.payload?.parent_id || projectFeedbackCategoryChannelId || null;
    if (!guildId) {
      return {
        ok: false,
        forumChannelId: explicitForumChannelId,
        guildId: null,
        parentId,
        created: false,
        reasonCodes: ["forum_channel_guild_id_missing"],
      };
    }
    const guildChannels = await fetchGuildChannels({ guildId, token, fetchImpl });
    if (!guildChannels.ok || !Array.isArray(guildChannels.payload)) {
      return {
        ok: false,
        forumChannelId: null,
        guildId,
        parentId,
        created: false,
        reasonCodes: ["guild_channels_read_failed"],
      };
    }
    const existingMazerForum = guildChannels.payload.find((candidate) =>
      isMazerForumChannel(candidate)
      && (!parentId || candidate.parent_id === parentId)
    );
    if (existingMazerForum?.id) {
      return {
        ok: true,
        forumChannelId: existingMazerForum.id,
        guildId,
        parentId: existingMazerForum.parent_id || parentId,
        created: false,
        reasonCodes,
      };
    }
    if (!createIfMissing) {
      return {
        ok: false,
        forumChannelId: null,
        guildId,
        parentId,
        created: false,
        reasonCodes: ["mazer_forum_channel_missing"],
      };
    }
    const created = await createForumChannel({
      guildId,
      token,
      parentId,
      fetchImpl,
    });
    if (!created.ok || !hasText(created.payload?.id)) {
      return {
        ok: false,
        forumChannelId: null,
        guildId,
        parentId,
        created: false,
        reasonCodes: ["mazer_forum_channel_create_failed"],
      };
    }
    return {
      ok: true,
      forumChannelId: created.payload.id,
      guildId,
      parentId: created.payload.parent_id || parentId,
      created: true,
      reasonCodes,
    };
  }

  const updatesChannelId = normalizeEnvValue(env.DISCORDOS_UPDATES_CHANNEL_ID);
  if (!hasText(updatesChannelId)) {
    return {
      ok: false,
      forumChannelId: null,
      guildId: null,
      parentId: null,
      created: false,
      reasonCodes: ["forum_channel_id_missing", "updates_channel_id_missing"],
    };
  }

  const updatesChannel = await fetchChannel({
    channelId: updatesChannelId,
    token,
    fetchImpl,
  });
  if (!updatesChannel.ok || !hasText(updatesChannel.payload?.guild_id)) {
    return {
      ok: false,
      forumChannelId: null,
      guildId: null,
      parentId: null,
      created: false,
      reasonCodes: ["updates_channel_read_failed"],
    };
  }

  const guildId = updatesChannel.payload.guild_id;
  const guildChannels = await fetchGuildChannels({ guildId, token, fetchImpl });
  if (!guildChannels.ok || !Array.isArray(guildChannels.payload)) {
    return {
      ok: false,
      forumChannelId: null,
      guildId,
      parentId: updatesChannel.payload.parent_id || null,
      created: false,
      reasonCodes: ["guild_channels_read_failed"],
    };
  }

  const existing = guildChannels.payload.find((channel) =>
    isForumChannel(channel)
    && [DEFAULT_FORUM_NAME, DEFAULT_FORUM_LABEL.toLowerCase()].includes(String(channel.name || "").toLowerCase())
  );
  if (existing?.id) {
    return {
      ok: true,
      forumChannelId: existing.id,
      guildId,
      parentId: existing.parent_id || null,
      created: false,
      reasonCodes,
    };
  }

  if (!createIfMissing) {
    return {
      ok: false,
      forumChannelId: null,
      guildId,
      parentId: updatesChannel.payload.parent_id || null,
      created: false,
      reasonCodes: ["mazer_forum_channel_missing"],
    };
  }

  const created = await createForumChannel({
    guildId,
    token,
    parentId: updatesChannel.payload.parent_id || null,
    fetchImpl,
  });
  if (!created.ok || !hasText(created.payload?.id)) {
    return {
      ok: false,
      forumChannelId: null,
      guildId,
      parentId: updatesChannel.payload.parent_id || null,
      created: false,
      reasonCodes: ["mazer_forum_channel_create_failed"],
    };
  }

  return {
    ok: true,
    forumChannelId: created.payload.id,
    guildId,
    parentId: created.payload.parent_id || updatesChannel.payload.parent_id || null,
    created: true,
    reasonCodes,
  };
}

async function listForumThreads({
  forumChannelId,
  guildId,
  token,
  fetchImpl = fetch,
}) {
  const reasonCodes = [];
  const active = await fetchActiveThreads({ guildId, token, fetchImpl });
  const archived = await fetchArchivedThreads({ forumChannelId, token, fetchImpl });
  if (!active.ok) {
    reasonCodes.push("active_threads_read_failed");
  }
  if (!archived.ok) {
    reasonCodes.push("archived_threads_read_failed");
  }

  const activeThreads = (active.payload?.threads || [])
    .filter((thread) => thread.parent_id === forumChannelId);
  const archivedThreads = archived.payload?.threads || [];
  return {
    ok: reasonCodes.length === 0,
    threads: uniqueThreads([...activeThreads, ...archivedThreads]).map(summarizeThread),
    reasonCodes,
  };
}

async function writeSyncedBoard({
  boardPath,
  board,
  forumTarget,
  cardSyncResults,
  fsImpl = fs,
}) {
  const nextBoard = JSON.parse(JSON.stringify(board));
  nextBoard.board.sendsMessages = true;
  nextBoard.board.placement = {
    ...(nextBoard.board.placement || {}),
    channelFamily: "project-feedback",
    forumChannelId: forumTarget.forumChannelId,
    sortKey: "project:mazer",
    displayName: DEFAULT_FORUM_NAME,
  };
  nextBoard.board.liveForumChannelId = forumTarget.forumChannelId;
  nextBoard.board.liveGuildId = forumTarget.guildId;
  nextBoard.board.liveSyncedAt = new Date().toISOString();

  for (const card of nextBoard.cards || []) {
    const synced = cardSyncResults.find((result) => result.cardId === card.id);
    if (!synced?.threadId) {
      continue;
    }
    card.liveThreadId = synced.threadId;
    card.liveMessageId = synced.messageId || synced.threadId;
  }

  await fsImpl.writeFile(boardPath, `${JSON.stringify(nextBoard, null, 2)}\n`, "utf8");
  return nextBoard;
}

async function writeReceipt({
  receiptFile,
  result,
  fsImpl = fs,
}) {
  if (!hasText(receiptFile)) {
    return {
      requested: false,
      written: false,
      path: null,
    };
  }
  await fsImpl.mkdir(path.dirname(receiptFile), { recursive: true });
  const receiptAwareResult = {
    ...result,
    receipt: {
      requested: true,
      written: true,
      path: receiptFile,
    },
  };
  await fsImpl.writeFile(receiptFile, renderMarkdown(receiptAwareResult), "utf8");
  return {
    requested: true,
    written: true,
    path: receiptFile,
  };
}

async function buildMazerFeedbackBoardLiveSync({
  env = process.env,
  fetchImpl = fetch,
  fsImpl = fs,
  allowSync = false,
  apply = false,
  forumChannelId = null,
  receiptFile = DEFAULT_RECEIPT_PATH,
  writeBoard = true,
  ...input
} = {}) {
  const board = await boardInternals.readBoard(input.boardPath || boardInternals.DEFAULT_BOARD_PATH, fsImpl);
  const readModel = boardInternals.buildMazerFeedbackBoardReadModel(board, input);
  const syncAdmission = resolveSyncAdmission({ allowSync, env });
  const reasonCodes = [...readModel.reasonCodes, ...syncAdmission.reasonCodes];
  if (apply && !syncAdmission.admitted) {
    reasonCodes.push("mazer_feedback_board_sync_not_admitted");
  }

  const forumTarget = await resolveForumTarget({
    forumChannelId,
    env,
    fetchImpl,
    createIfMissing: apply && syncAdmission.admitted,
  });
  reasonCodes.push(...forumTarget.reasonCodes);

  let threadInventory = {
    ok: false,
    threads: [],
    reasonCodes: [],
  };
  const cardSyncResults = [];
  const canSync = apply
    && syncAdmission.admitted
    && readModel.ok
    && forumTarget.ok
    && hasText(normalizeEnvValue(env.DISCORDOS_BOT_TOKEN));

  if (forumTarget.ok && hasText(normalizeEnvValue(env.DISCORDOS_BOT_TOKEN)) && hasText(forumTarget.guildId)) {
    threadInventory = await listForumThreads({
      forumChannelId: forumTarget.forumChannelId,
      guildId: forumTarget.guildId,
      token: normalizeEnvValue(env.DISCORDOS_BOT_TOKEN),
      fetchImpl,
    });
    reasonCodes.push(...threadInventory.reasonCodes);
  }

  if (canSync && threadInventory.ok) {
    for (const card of readModel.cards) {
      const spec = {
        ...cardContract.buildCanonicalCardSpec({
          board,
          card,
          sourceWorkflow: "discordos.mazer.feedback_board_live_sync",
        }),
        card,
      };
      const existing = cardContract.findExistingThreadForSpec(threadInventory.threads, spec);
      const upserted = await cardContract.upsertDiscordForumCard({
        spec,
        existingThread: existing,
        forumChannelId: forumTarget.forumChannelId,
        token: normalizeEnvValue(env.DISCORDOS_BOT_TOKEN),
        apply: true,
        fetchImpl,
        buildPayload: buildCardThreadPayload,
      });
      cardSyncResults.push({
        cardId: card.id,
        title: spec.canonicalTitle,
        action: upserted.action === "created" ? "created" : "existing",
        ok: upserted.ok,
        httpStatus: upserted.httpStatus,
        reactionStatus: upserted.reactionResult?.addHttpStatus || upserted.reactionResult?.afterHttpStatus || null,
        reactionReadbackStatus: upserted.reactionResult?.status || null,
        threadId: upserted.threadId,
        messageId: upserted.messageId,
        reasonCodes: upserted.reasonCodes,
      });
      if (!upserted.ok) {
        reasonCodes.push(...upserted.reasonCodes.map((reasonCode) => `mazer_${reasonCode}`));
      }
    }
  }

  const syncedCardCount = cardSyncResults.filter((result) => result.ok).length;
  let boardWrite = {
    attempted: false,
    written: false,
    path: input.boardPath || boardInternals.DEFAULT_BOARD_PATH,
  };
  if (canSync && writeBoard && syncedCardCount === readModel.cards.length) {
    await writeSyncedBoard({
      boardPath: input.boardPath || boardInternals.DEFAULT_BOARD_PATH,
      board,
      forumTarget,
      cardSyncResults,
      fsImpl,
    });
    boardWrite = {
      ...boardWrite,
      attempted: true,
      written: true,
    };
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const result = {
    ok: uniqueReasonCodes.length === 0 && (!apply || syncedCardCount === readModel.cards.length),
    destructive: false,
    sendsMessages: canSync && cardSyncResults.some((resultRow) => resultRow.action === "created" && resultRow.ok),
    writesArtifacts: boardWrite.written,
    callsDiscordApi: forumTarget.ok || canSync || apply,
    slashCommandsAdmitted: false,
    status: !apply
      ? "dry_run"
      : uniqueReasonCodes.length === 0
        ? "live_board_synced"
        : "blocked",
    boardId: readModel.boardId,
    cardCount: readModel.cardCount,
    readyCardCount: readModel.readyCardCount,
    forumTarget,
    syncAdmission,
    discoveredThreadCount: threadInventory.threads.length,
    syncedCardCount,
    createdThreadCount: cardSyncResults.filter((resultRow) => resultRow.action === "created" && resultRow.ok).length,
    existingThreadCount: cardSyncResults.filter((resultRow) => resultRow.action === "existing" && resultRow.ok).length,
    cardSyncResults,
    boardWrite,
    receipt: {
      requested: hasText(receiptFile),
      written: false,
      path: receiptFile || null,
    },
    reasonCodes: uniqueReasonCodes,
  };

  if (apply && result.ok && hasText(receiptFile)) {
    result.receipt = await writeReceipt({ receiptFile, result, fsImpl });
  }

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.mazer.feedback_board_live_sync_ready"
        : "discordos.mazer.feedback_board_live_sync_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.mazer.feedback_board_live_sync",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        sendsMessages: result.sendsMessages,
        cardCount: result.cardCount,
        syncedCardCount: result.syncedCardCount,
        forumChannelId: result.forumTarget.forumChannelId || "none",
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Mazer Feedback Board Live Sync",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- board: \`${result.boardId || "unknown"}\``,
    `- cards: \`${result.cardCount}\``,
    `- ready cards: \`${result.readyCardCount}\``,
    `- sync admission: \`${result.syncAdmission.status}\``,
    `- forum channel id: \`${result.forumTarget.forumChannelId || "none"}\``,
    `- guild id: \`${result.forumTarget.guildId || "none"}\``,
    `- forum created: \`${result.forumTarget.created ? "true" : "false"}\``,
    `- discovered threads: \`${result.discoveredThreadCount}\``,
    `- synced cards: \`${result.syncedCardCount}\``,
    `- created threads: \`${result.createdThreadCount}\``,
    `- existing threads: \`${result.existingThreadCount}\``,
    `- board config written: \`${result.boardWrite.written ? "true" : "false"}\``,
    `- receipt written: \`${result.receipt.written ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const card of result.cardSyncResults) {
    lines.push(`- card ${card.cardId}: \`${card.action}\` thread \`${card.threadId || "none"}\` status \`${card.httpStatus || "none"}\` reaction \`${card.reactionStatus || "none"}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMazerFeedbackBoardLiveSync(options);
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
    LIVE_SYNC_ENV,
    LIVE_SYNC_ENV_VALUE,
    DEFAULT_FORUM_NAME,
    DEFAULT_FORUM_LABEL,
    DEFAULT_PROJECT_FEEDBACK_CATEGORY_CHANNEL_ID,
    DEFAULT_PROJECT_FEEDBACK_ANCHOR_FORUM_CHANNEL_ID,
    DEFAULT_AUTO_ARCHIVE_DURATION,
    DEFAULT_RECEIPT_PATH,
    parseArgs,
    resolveSyncAdmission,
    normalizeEnvValue,
    buildCardThreadPayload,
    resolveForumTarget,
    listForumThreads,
    buildMazerFeedbackBoardLiveSync,
    renderMarkdown,
  },
};
