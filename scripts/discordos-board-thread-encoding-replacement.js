const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");
const {
  _internals: journal,
} = require("./discordos-board-card-journal");

const REPLACEMENT_ENV = "DISCORDOS_BOARD_THREAD_ENCODING_REPLACEMENT";
const REPLACEMENT_ENV_VALUE = "enabled";
const THREAD_NAME_CHANGE_MESSAGE_TYPE = 4;
const REPLACEMENT_MARKER = "ATLAS-ENCODING-REPLACEMENT-OF";
const SUPERSEDED_MARKER = "ATLAS-SUPERSEDED-CARD";

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = { inputPath: null, json: false, allowApply: false, apply: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      options.inputPath = path.resolve(readValue(args, index, "missing_input_path"));
      index += 1;
    } else if (arg === "--json") options.json = true;
    else if (arg === "--allow-apply") options.allowApply = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (!options.inputPath) throw new Error("input_path_missing");
  return options;
}

function resolveAdmission({ allowApply, env }) {
  const envEnabled = env?.[REPLACEMENT_ENV] === REPLACEMENT_ENV_VALUE;
  if (!allowApply && !envEnabled) return { requested: false, admitted: false, reasonCodes: [] };
  if (allowApply && envEnabled) return { requested: true, admitted: true, reasonCodes: [] };
  return { requested: true, admitted: false, reasonCodes: ["board_thread_replacement_double_guard_missing"] };
}

function comparable(value) {
  return journal.repairMojibakeText(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function parseCardId(content) {
  return String(content || "").match(/ATLAS-CARD-ID:\s*`([^`]+)`/i)?.[1]?.trim() || null;
}

function parseReplacementOf(content) {
  return String(content || "").match(/ATLAS-ENCODING-REPLACEMENT-OF:\s*`([0-9]+)`/i)?.[1] || null;
}

function hasSupersededMarker(content) {
  return /ATLAS-SUPERSEDED-CARD:\s*`[0-9]+`/i.test(String(content || ""));
}

function classifySource({ thread, starter, messages, botUserId }) {
  const content = String(starter?.content || "");
  if (parseReplacementOf(content) || hasSupersededMarker(content)) {
    return { candidate: false, reasonCodes: [] };
  }
  const suspicious = (Array.isArray(messages) ? messages : []).filter((message) =>
    journal.findMojibakeRuns(message?.content).length > 0
  );
  if (suspicious.length === 0) return { candidate: false, reasonCodes: [] };
  const reasonCodes = [];
  if (!starter || !parseCardId(content)) reasonCodes.push("replacement_source_card_id_missing");
  if (!content.includes(journal.CARD_START) || !content.includes(journal.CARD_END)) {
    reasonCodes.push("replacement_source_canonical_body_missing");
  }
  if (journal.findMojibakeRuns(thread?.name).length > 0) reasonCodes.push("replacement_source_title_not_clean");
  if (journal.findMojibakeRuns(content).length > 0) reasonCodes.push("replacement_source_starter_not_clean");
  for (const message of suspicious) {
    if (message?.type !== THREAD_NAME_CHANGE_MESSAGE_TYPE) reasonCodes.push("replacement_source_non_rename_corruption");
    if (message?.author?.bot !== true || message?.author?.id !== botUserId) {
      reasonCodes.push("replacement_source_non_bot_corruption");
    }
    if (comparable(message?.content) !== comparable(thread?.name)) {
      reasonCodes.push("replacement_source_rename_mismatch");
    }
  }
  return {
    candidate: true,
    eligible: reasonCodes.length === 0,
    cardId: parseCardId(content),
    corruptedMessageIds: suspicious.map((message) => message.id),
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function buildReplacementStarter(content, sourceThreadId) {
  const marker = `${REPLACEMENT_MARKER}: \`${sourceThreadId}\``;
  if (String(content || "").includes(marker)) return String(content || "");
  let next = String(content || "").replace(
    /(ATLAS-CARD-ID:\s*`[^`]+`)/i,
    `$1\n${marker}`
  );
  if (next.length <= 2000) return next;
  const suffix = `\n${journal.CARD_END}`;
  const end = next.lastIndexOf(journal.CARD_END);
  const withoutEnd = end >= 0 ? next.slice(0, end).trimEnd() : next;
  return `${withoutEnd.slice(0, 2000 - suffix.length - 4).trimEnd()}...${suffix}`;
}

function buildReplacementJournal({ guildId, sourceThreadId }) {
  return [
    `ATLAS-JOURNAL-EVENT-ID: \`encoding-replacement:${sourceThreadId}:v1\``,
    "## Encoding-safe card thread replacement",
    "- kind: `migration`",
    "- state: `completed`",
    "- actor: `discordos_ops`",
    "",
    "## Completed",
    "- Replaced a thread whose immutable Discord rename history contained malformed text.",
    `- Preserved the original thread as archived history: https://discord.com/channels/${guildId}/${sourceThreadId}`,
    "",
    "## Next",
    "- Continue all card progress journaling in this replacement thread.",
  ].join("\n");
}

function buildSupersededBody({ guildId, replacementThreadId }) {
  return [
    `${SUPERSEDED_MARKER}: \`${replacementThreadId}\``,
    "# Archived encoding-corrupt card history",
    "",
    "This thread is retained only as immutable historical evidence.",
    `Continue work in the clean replacement: https://discord.com/channels/${guildId}/${replacementThreadId}`,
  ].join("\n");
}

function archivedTitle(value) {
  return `Archived encoding record - ${journal.repairMojibakeText(value)}`.slice(0, 100).trim();
}

async function readBoardDetails({ board, token, fetchImpl }) {
  const channel = await cardContract.discordRequest({ path: `/channels/${board.forumChannelId}`, token, fetchImpl });
  if (!channel.ok || !channel.payload?.guild_id) {
    return { ok: false, guildId: null, details: [], reasonCodes: [`board_read_failed:${board.id}`] };
  }
  const inventory = await journal.listForumThreads({
    forumChannelId: board.forumChannelId,
    guildId: channel.payload.guild_id,
    token,
    fetchImpl,
  });
  const details = [];
  for (const thread of inventory.threads) {
    const [starter, messages] = await Promise.all([
      cardContract.fetchMessage({ channelId: thread.id, messageId: thread.id, token, fetchImpl }),
      cardContract.discordRequest({ path: `/channels/${thread.id}/messages?limit=100`, token, fetchImpl }),
    ]);
    details.push({
      thread,
      starter: starter.ok ? starter.payload : null,
      messages: messages.ok && Array.isArray(messages.payload) ? messages.payload : [],
      readOk: starter.ok && messages.ok,
    });
  }
  return {
    ok: inventory.ok && details.every((detail) => detail.readOk),
    guildId: channel.payload.guild_id,
    details,
    reasonCodes: [
      ...inventory.reasonCodes.map((code) => `${code}:${board.id}`),
      ...details.filter((detail) => !detail.readOk).map((detail) => `thread_read_failed:${detail.thread.id}`),
    ],
  };
}

async function postMessage({ threadId, content, token, fetchImpl }) {
  return cardContract.discordRequest({
    path: `/channels/${threadId}/messages`,
    token,
    method: "POST",
    body: { content, allowed_mentions: { parse: [] } },
    fetchImpl,
  });
}

async function replaceSource({ board, guildId, source, existingReplacement, token, fetchImpl }) {
  const reasonCodes = [];
  let replacementThreadId = existingReplacement?.thread?.id || null;
  let replacementMessageId = replacementThreadId;
  let created = false;
  if (!replacementThreadId) {
    const payload = {
      name: source.thread.name,
      auto_archive_duration: 10080,
      applied_tags: source.thread.appliedTags,
      message: {
        content: buildReplacementStarter(source.starter.content, source.thread.id),
        allowed_mentions: { parse: [] },
      },
    };
    const result = await cardContract.createForumThread({
      forumChannelId: board.forumChannelId,
      token,
      payload,
      fetchImpl,
    });
    replacementThreadId = result.payload?.id || null;
    replacementMessageId = result.payload?.message?.id || replacementThreadId;
    created = result.ok && Boolean(replacementThreadId);
    if (!created) reasonCodes.push("encoding_replacement_thread_create_failed");
  }
  if (!replacementThreadId) {
    return { ok: false, created, replacementThreadId: null, sourceRetired: false, reasonCodes };
  }

  const marker = `ATLAS-JOURNAL-EVENT-ID: \`encoding-replacement:${source.thread.id}:v1\``;
  const history = await cardContract.discordRequest({
    path: `/channels/${replacementThreadId}/messages?limit=100`,
    token,
    fetchImpl,
  });
  const journalExists = history.ok && Array.isArray(history.payload)
    && history.payload.some((message) => String(message?.content || "").includes(marker));
  let journalMessageId = history.payload?.find((message) => String(message?.content || "").includes(marker))?.id || null;
  if (!history.ok) reasonCodes.push("encoding_replacement_history_read_failed");
  else if (!journalExists) {
    const posted = await postMessage({
      threadId: replacementThreadId,
      content: buildReplacementJournal({ guildId, sourceThreadId: source.thread.id }),
      token,
      fetchImpl,
    });
    journalMessageId = posted.payload?.id || null;
    if (!posted.ok || !journalMessageId) reasonCodes.push("encoding_replacement_journal_create_failed");
  }

  const replacementStarter = await cardContract.fetchMessage({
    channelId: replacementThreadId,
    messageId: replacementMessageId,
    token,
    fetchImpl,
  });
  if (!replacementStarter.ok
    || parseReplacementOf(replacementStarter.payload?.content) !== source.thread.id
    || parseCardId(replacementStarter.payload?.content) !== parseCardId(source.starter.content)) {
    reasonCodes.push("encoding_replacement_starter_readback_failed");
  }

  if (source.thread.archived) {
    const reopened = await journal.setThreadState?.({
      threadId: source.thread.id,
      archived: false,
      locked: false,
      token,
      fetchImpl,
    });
    if (!reopened?.ok) {
      const fallback = await cardContract.discordRequest({
        path: `/channels/${source.thread.id}`,
        token,
        method: "PATCH",
        body: { archived: false, locked: false },
        fetchImpl,
      });
      if (!fallback.ok) reasonCodes.push("encoding_source_reopen_failed");
    }
  }

  const superseded = await cardContract.updateThreadMessage({
    threadId: source.thread.id,
    messageId: source.thread.id,
    token,
    message: {
      content: buildSupersededBody({ guildId, replacementThreadId }),
      allowed_mentions: { parse: [] },
    },
    fetchImpl,
  });
  if (!superseded.ok) reasonCodes.push("encoding_source_supersede_failed");

  const renamed = await cardContract.updateThreadName({
    threadId: source.thread.id,
    token,
    name: archivedTitle(source.thread.name),
    fetchImpl,
  });
  if (!renamed.ok) reasonCodes.push("encoding_source_archive_rename_failed");

  const archived = await cardContract.discordRequest({
    path: `/channels/${source.thread.id}`,
    token,
    method: "PATCH",
    body: { archived: true, locked: true },
    fetchImpl,
  });
  if (!archived.ok) reasonCodes.push("encoding_source_archive_failed");

  const [sourceReadback, replacementJournal] = await Promise.all([
    cardContract.fetchMessage({ channelId: source.thread.id, messageId: source.thread.id, token, fetchImpl }),
    journalMessageId
      ? cardContract.fetchMessage({ channelId: replacementThreadId, messageId: journalMessageId, token, fetchImpl })
      : Promise.resolve({ ok: false }),
  ]);
  const sourceRetired = sourceReadback.ok
    && String(sourceReadback.payload?.content || "").includes(`${SUPERSEDED_MARKER}: \`${replacementThreadId}\``)
    && archived.ok;
  if (!sourceRetired) reasonCodes.push("encoding_source_retirement_readback_failed");
  if (!replacementJournal.ok || !String(replacementJournal.payload?.content || "").includes(marker)) {
    reasonCodes.push("encoding_replacement_journal_readback_failed");
  }
  return {
    ok: reasonCodes.length === 0,
    created,
    replacementThreadId,
    sourceRetired,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

async function buildBoardThreadEncodingReplacement({
  payload,
  allowApply = false,
  apply = false,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const token = String(env?.DISCORDOS_BOT_TOKEN || "").trim();
  const admission = resolveAdmission({ allowApply, env });
  const reasonCodes = [...admission.reasonCodes];
  if (!token) reasonCodes.push("discord_bot_token_missing");
  if (apply && !admission.admitted) reasonCodes.push("board_thread_replacement_not_admitted");
  if (reasonCodes.length > 0) {
    return { ok: false, status: "blocked", apply, candidateCount: 0, replacedCount: 0, rows: [], reasonCodes };
  }

  const bot = await cardContract.discordRequest({ path: "/users/@me", token, fetchImpl });
  if (!bot.ok || !bot.payload?.id || bot.payload?.bot !== true) {
    return { ok: false, status: "blocked", apply, candidateCount: 0, replacedCount: 0, rows: [], reasonCodes: ["discord_bot_identity_read_failed"] };
  }

  const rows = [];
  for (const board of payload?.boards || []) {
    const inventory = await readBoardDetails({ board, token, fetchImpl });
    reasonCodes.push(...inventory.reasonCodes);
    const replacements = new Map(
      inventory.details
        .map((detail) => [parseReplacementOf(detail.starter?.content), detail])
        .filter(([sourceId]) => sourceId)
    );
    for (const source of inventory.details) {
      const classification = classifySource({
        thread: source.thread,
        starter: source.starter,
        messages: source.messages,
        botUserId: bot.payload.id,
      });
      if (!classification.candidate) continue;
      const row = {
        ok: classification.eligible,
        boardId: board.id,
        sourceThreadId: source.thread.id,
        cardId: classification.cardId,
        corruptedMessageCount: classification.corruptedMessageIds.length,
        eligible: classification.eligible,
        action: classification.eligible ? (apply ? "replace" : "would_replace") : "blocked",
        replacementThreadId: replacements.get(source.thread.id)?.thread?.id || null,
        created: false,
        sourceRetired: false,
        reasonCodes: [...classification.reasonCodes],
      };
      if (apply && classification.eligible) {
        const result = await replaceSource({
          board,
          guildId: inventory.guildId,
          source,
          existingReplacement: replacements.get(source.thread.id) || null,
          token,
          fetchImpl,
        });
        row.ok = result.ok;
        row.replacementThreadId = result.replacementThreadId;
        row.created = result.created;
        row.sourceRetired = result.sourceRetired;
        row.reasonCodes.push(...result.reasonCodes);
      }
      rows.push(row);
    }
  }
  for (const row of rows) reasonCodes.push(...row.reasonCodes.map((code) => `${code}:${row.sourceThreadId}`));
  const candidateCount = rows.filter((row) => row.eligible).length;
  const replacedCount = rows.filter((row) => row.ok && row.sourceRetired).length;
  const ok = reasonCodes.length === 0 && rows.every((row) => row.ok);
  return {
    ok,
    status: ok ? (rows.length === 0 ? "clean" : apply ? "replaced" : "dry_run") : "blocked",
    apply,
    candidateCount,
    replacedCount,
    rows,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await fs.readFile(options.inputPath, "utf8"));
  const result = await buildBoardThreadEncodingReplacement({
    payload,
    allowApply: options.allowApply,
    apply: options.apply,
  });
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.status}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  _internals: {
    REPLACEMENT_ENV,
    REPLACEMENT_ENV_VALUE,
    parseArgs,
    resolveAdmission,
    comparable,
    parseCardId,
    parseReplacementOf,
    hasSupersededMarker,
    classifySource,
    buildReplacementStarter,
    buildReplacementJournal,
    buildSupersededBody,
    archivedTitle,
    buildBoardThreadEncodingReplacement,
  },
};
