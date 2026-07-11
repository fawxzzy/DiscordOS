const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");
const {
  _internals: mazerBoardInternals,
} = require("./discordos-mazer-feedback-board");
const {
  _internals: mazerLiveSyncInternals,
} = require("./discordos-mazer-feedback-board-live-sync");

const RECONCILE_ENV = "DISCORDOS_BOARD_CARD_RECONCILE";
const RECONCILE_ENV_VALUE = "enabled";

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
    boardPath: mazerBoardInternals.DEFAULT_BOARD_PATH,
    forumChannelId: null,
    allowApply: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--board") {
      options.boardPath = path.resolve(readValue(args, index, "missing_board_value"));
      index += 1;
    } else if (arg === "--forum-channel-id") {
      options.forumChannelId = readValue(args, index, "missing_forum_channel_id_value");
      index += 1;
    } else if (arg === "--allow-apply") {
      options.allowApply = true;
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

function resolveAdmission({ allowApply, env }) {
  const envEnabled = env?.[RECONCILE_ENV] === RECONCILE_ENV_VALUE;
  if (!allowApply && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "reconcile_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowApply && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "reconcile_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["board_card_reconcile_double_guard_missing"],
  };
}

async function readBoard(boardPath, fsImpl = fs) {
  const raw = await fsImpl.readFile(boardPath, "utf8");
  return JSON.parse(raw);
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

async function listForumThreads({ forumChannelId, guildId, token, fetchImpl = fetch }) {
  const active = await cardContract.discordRequest({
    path: `/guilds/${guildId}/threads/active`,
    token,
    fetchImpl,
  });
  const archived = await cardContract.discordRequest({
    path: `/channels/${forumChannelId}/threads/archived/public?limit=100`,
    token,
    fetchImpl,
  });
  const reasonCodes = [];
  if (!active.ok) {
    reasonCodes.push("active_threads_read_failed");
  }
  if (!archived.ok) {
    reasonCodes.push("archived_threads_read_failed");
  }
  const seen = new Set();
  const threads = [
    ...((active.payload?.threads || []).filter((thread) => thread.parent_id === forumChannelId)),
    ...(archived.payload?.threads || []),
  ].filter((thread) => {
    if (!thread?.id || seen.has(thread.id)) {
      return false;
    }
    seen.add(thread.id);
    return true;
  }).map(summarizeThread);

  return {
    ok: reasonCodes.length === 0,
    threads,
    reasonCodes,
  };
}

function findDuplicateIdentities(specs) {
  const groups = new Map();
  for (const spec of specs) {
    const key = spec.stableIdentity;
    const list = groups.get(key) || [];
    list.push(spec.cardId);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([identity, cardIds]) => ({ identity, cardIds }));
}

async function inspectCard({ spec, threads, token, apply, fetchImpl }) {
  const existing = cardContract.findExistingThreadForSpec(threads, spec);
  const currentTitle = existing?.name || null;
  const titleRepairRequired = Boolean(existing && cardContract.normalizeThreadTitle(currentTitle) !== cardContract.normalizeThreadTitle(spec.canonicalTitle));
  const targetMessageId = existing?.messageId || spec.existingMessageId || existing?.id || null;
  const reactionEmoji = spec.requiredReactions[0];
  const rowReasonCodes = [];
  let reactionReadback = {
    attempted: false,
    ok: false,
    httpStatus: null,
    present: false,
    reactionRepairRequired: false,
  };

  if (!existing) {
    rowReasonCodes.push("card_thread_missing");
  } else if (!targetMessageId) {
    rowReasonCodes.push("card_starter_message_missing");
  } else {
    const fetched = await cardContract.fetchMessage({
      channelId: existing.id,
      messageId: targetMessageId,
      token,
      fetchImpl,
    });
    const reactions = cardContract.summarizeReactions(fetched.payload);
    const present = cardContract.reactionPresent(reactions, reactionEmoji);
    reactionReadback = {
      attempted: true,
      ok: fetched.ok,
      httpStatus: fetched.status,
      present,
      reactionRepairRequired: fetched.ok && !present,
    };
    if (!fetched.ok) {
      rowReasonCodes.push("card_reaction_readback_failed");
    }
  }

  let titleRepair = { attempted: false, ok: false, httpStatus: null };
  if (apply && existing && titleRepairRequired) {
    const renamed = await cardContract.updateThreadName({
      threadId: existing.id,
      token,
      name: spec.canonicalTitle,
      fetchImpl,
    });
    titleRepair = {
      attempted: true,
      ok: renamed.ok,
      httpStatus: renamed.status,
    };
    if (!renamed.ok) {
      rowReasonCodes.push("card_title_repair_failed");
    }
  }

  let reactionRepair = { attempted: false, ok: false, httpStatus: null };
  if (apply && existing && targetMessageId && reactionReadback.reactionRepairRequired) {
    const ensured = await cardContract.ensureRequiredReaction({
      channelId: existing.id,
      messageId: targetMessageId,
      token,
      emoji: reactionEmoji,
      fetchImpl,
    });
    reactionRepair = {
      attempted: true,
      ok: ensured.ok,
      httpStatus: ensured.addHttpStatus || ensured.afterHttpStatus,
      status: ensured.status,
    };
    rowReasonCodes.push(...ensured.reasonCodes);
  }

  return {
    ok: rowReasonCodes.length === 0 && !titleRepairRequired && !reactionReadback.reactionRepairRequired,
    cardId: spec.cardId,
    stableIdentity: spec.stableIdentity,
    threadId: existing?.id || null,
    messageId: targetMessageId,
    archived: existing?.archived === true,
    currentTitle,
    expectedTitle: spec.canonicalTitle,
    titleRepairRequired,
    reactionTarget: "forum_starter_message",
    requiredReaction: cardContract.formatReactionEmoji(reactionEmoji),
    reactionPresent: reactionReadback.present,
    reactionRepairRequired: reactionReadback.reactionRepairRequired,
    titleRepair,
    reactionRepair,
    reasonCodes: [...new Set(rowReasonCodes)],
  };
}

async function resolveForum({ board, forumChannelId, env, fetchImpl }) {
  const token = mazerLiveSyncInternals.normalizeEnvValue(env.DISCORDOS_BOT_TOKEN);
  const configuredForumId = forumChannelId
    || board?.board?.liveForumChannelId
    || board?.board?.placement?.forumChannelId
    || null;
  const configuredGuildId = board?.board?.liveGuildId || null;
  if (!configuredForumId) {
    return {
      ok: false,
      forumChannelId: null,
      guildId: configuredGuildId,
      reasonCodes: ["forum_channel_id_missing"],
    };
  }
  if (configuredGuildId) {
    return {
      ok: true,
      forumChannelId: configuredForumId,
      guildId: configuredGuildId,
      reasonCodes: [],
    };
  }
  const channel = await cardContract.discordRequest({
    path: `/channels/${configuredForumId}`,
    token,
    fetchImpl,
  });
  return {
    ok: channel.ok && Boolean(channel.payload?.guild_id),
    forumChannelId: configuredForumId,
    guildId: channel.payload?.guild_id || null,
    reasonCodes: channel.ok && channel.payload?.guild_id ? [] : ["forum_channel_read_failed"],
  };
}

async function buildBoardCardReconciliation({
  boardPath = mazerBoardInternals.DEFAULT_BOARD_PATH,
  forumChannelId = null,
  allowApply = false,
  apply = false,
  env = process.env,
  fetchImpl = fetch,
  fsImpl = fs,
} = {}) {
  const board = await readBoard(boardPath, fsImpl);
  const admission = resolveAdmission({ allowApply, env });
  const token = mazerLiveSyncInternals.normalizeEnvValue(env.DISCORDOS_BOT_TOKEN);
  const reasonCodes = [...admission.reasonCodes];
  if (apply && !admission.admitted) {
    reasonCodes.push("board_card_reconcile_apply_not_admitted");
  }
  if (!token) {
    reasonCodes.push("bot_token_missing");
  }

  const specs = (Array.isArray(board.cards) ? board.cards : []).map((card) => ({
    ...cardContract.buildCanonicalCardSpec({
      board,
      card,
      sourceWorkflow: "discordos.board_card_reconciliation",
    }),
    card,
  }));
  const duplicateIdentities = findDuplicateIdentities(specs);
  if (duplicateIdentities.length > 0) {
    reasonCodes.push("duplicate_stable_identities_detected");
  }

  const forum = token
    ? await resolveForum({ board, forumChannelId, env, fetchImpl })
    : { ok: false, forumChannelId: null, guildId: null, reasonCodes: [] };
  reasonCodes.push(...forum.reasonCodes);

  let inventory = { ok: false, threads: [], reasonCodes: [] };
  if (token && forum.ok) {
    inventory = await listForumThreads({
      forumChannelId: forum.forumChannelId,
      guildId: forum.guildId,
      token,
      fetchImpl,
    });
    reasonCodes.push(...inventory.reasonCodes);
  }

  const canInspect = token && forum.ok && inventory.ok;
  const canApply = apply && admission.admitted && canInspect;
  const rows = [];
  if (canInspect) {
    for (const spec of specs) {
      rows.push(await inspectCard({
        spec,
        threads: inventory.threads,
        token,
        apply: canApply,
        fetchImpl,
      }));
    }
  }

  reasonCodes.push(...rows.flatMap((row) => row.reasonCodes));
  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const titleRepairCount = rows.filter((row) => row.titleRepair.attempted && row.titleRepair.ok).length;
  const reactionRepairCount = rows.filter((row) => row.reactionRepair.attempted && row.reactionRepair.ok).length;
  return {
    ok: uniqueReasonCodes.length === 0
      && rows.every((row) => !row.titleRepairRequired && !row.reactionRepairRequired)
      && (!apply || rows.every((row) => row.titleRepairRequired ? row.titleRepair.ok : true))
      && (!apply || rows.every((row) => row.reactionRepairRequired ? row.reactionRepair.ok : true)),
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: Boolean(token),
    status: !apply ? "dry_run" : uniqueReasonCodes.length === 0 ? "reconciled" : "blocked",
    boardId: board?.board?.id || null,
    boardPath,
    forum,
    admission,
    inspectedCardCount: rows.length,
    titleRepairRequiredCount: rows.filter((row) => row.titleRepairRequired).length,
    reactionRepairRequiredCount: rows.filter((row) => row.reactionRepairRequired).length,
    titleRepairCount,
    reactionRepairCount,
    duplicateIdentities,
    skippedCount: rows.filter((row) => row.reasonCodes.includes("card_thread_missing")).length,
    rows,
    reasonCodes: uniqueReasonCodes,
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Board Card Reconciliation",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- status: \`${result.status}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- board: \`${result.boardId || "unknown"}\``,
    `- forum channel id: \`${result.forum.forumChannelId || "none"}\``,
    `- inspected cards: \`${result.inspectedCardCount}\``,
    `- title repairs required: \`${result.titleRepairRequiredCount}\``,
    `- reaction repairs required: \`${result.reactionRepairRequiredCount}\``,
    `- titles repaired: \`${result.titleRepairCount}\``,
    `- reactions repaired: \`${result.reactionRepairCount}\``,
    `- duplicate identities: \`${result.duplicateIdentities.length}\``,
    `- skipped: \`${result.skippedCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const row of result.rows) {
    lines.push(`- card ${row.cardId}: titleRepair=\`${row.titleRepairRequired ? "yes" : "no"}\` reactionRepair=\`${row.reactionRepairRequired ? "yes" : "no"}\` thread=\`${row.threadId || "none"}\` reasons=\`${row.reasonCodes.join(",") || "none"}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardCardReconciliation(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok && options.apply) {
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
    RECONCILE_ENV,
    RECONCILE_ENV_VALUE,
    parseArgs,
    resolveAdmission,
    readBoard,
    listForumThreads,
    findDuplicateIdentities,
    inspectCard,
    resolveForum,
    buildBoardCardReconciliation,
    renderMarkdown,
  },
};
