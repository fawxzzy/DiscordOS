const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");
const {
  _internals: journal,
} = require("./discordos-board-card-journal");

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = { inputPath: null, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      options.inputPath = path.resolve(readValue(args, index, "missing_input_path"));
      index += 1;
    } else if (arg === "--json") options.json = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (!options.inputPath) throw new Error("input_path_missing");
  return options;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCardId(content) {
  return String(content || "").match(/ATLAS-CARD-ID:\s*`([^`]+)`/i)?.[1]?.trim() || null;
}

function parseCardState(content) {
  return String(content || "").match(/^- state:\s*`([^`]+)`/im)?.[1]?.trim().toLowerCase() || null;
}

function hasJournal(messages) {
  return (Array.isArray(messages) ? messages : []).some((message) =>
    /ATLAS-JOURNAL-EVENT-ID:\s*`[^`]+`/i.test(String(message?.content || ""))
  );
}

function inspectThread({ board, thread, starter, messages }) {
  const content = String(starter?.content || "");
  const cardId = parseCardId(content);
  const state = parseCardState(content);
  const archived = thread?.thread_metadata?.archived === true;
  const reasonCodes = [];
  if (!starter) reasonCodes.push("card_starter_message_missing");
  if (!cardId) reasonCodes.push("stable_card_id_missing");
  if (!content.includes(journal.CARD_START) || !content.includes(journal.CARD_END)) {
    reasonCodes.push("canonical_card_body_missing");
  }
  if (!state) reasonCodes.push("canonical_card_state_missing");
  if (!/^- updated:\s*`[^`]+`/im.test(content)) reasonCodes.push("canonical_updated_timestamp_missing");
  if (!hasJournal(messages)) reasonCodes.push("card_journal_history_missing");
  if (board.role === "active") {
    if (state && journal.ACTIVE_STATES.has(state) && archived) reasonCodes.push("active_card_archived");
    if (state === "completed" && !/ATLAS-COMPLETED-CARD:/i.test(content)) reasonCodes.push("completed_card_left_on_active_board");
  }
  if (board.role === "completed") {
    if (state && state !== "completed") reasonCodes.push("completed_board_state_mismatch");
    if (!/original card:/i.test(content)) reasonCodes.push("completed_card_source_link_missing");
  }
  return {
    ok: reasonCodes.length === 0,
    boardId: board.id,
    boardRole: board.role,
    threadId: thread.id,
    title: thread.name || null,
    cardId,
    state,
    archived,
    journalPresent: hasJournal(messages),
    reasonCodes,
  };
}

async function listThreads({ board, guildId, token, fetchImpl = fetch }) {
  const listed = await journal.listForumThreads({
    forumChannelId: board.forumChannelId,
    guildId,
    token,
    fetchImpl,
  });
  return listed;
}

function findDuplicates(rows) {
  const grouped = new Map();
  for (const row of rows.filter((candidate) => candidate.cardId)) {
    const key = row.cardId.toLowerCase();
    const values = grouped.get(key) || [];
    values.push({ boardId: row.boardId, threadId: row.threadId });
    grouped.set(key, values);
  }
  return [...grouped.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([cardId, locations]) => ({ cardId, locations }));
}

async function buildBoardCardConsistency({ payload, env = process.env, fetchImpl = fetch } = {}) {
  const token = text(env?.DISCORDOS_BOT_TOKEN);
  const boards = Array.isArray(payload?.boards) ? payload.boards.map((board) => ({
    id: text(board?.id),
    forumChannelId: text(board?.forumChannelId),
    role: text(board?.role).toLowerCase(),
  })) : [];
  const reasonCodes = [];
  if (!token) reasonCodes.push("discord_bot_token_missing");
  if (boards.length === 0) reasonCodes.push("board_inventory_missing");
  for (const board of boards) {
    if (!board.id) reasonCodes.push("board_id_missing");
    if (!board.forumChannelId) reasonCodes.push("board_forum_channel_id_missing");
    if (!new Set(["active", "completed"]).has(board.role)) reasonCodes.push("board_role_invalid");
  }
  if (reasonCodes.length > 0) {
    return { ok: false, status: "blocked", rows: [], duplicates: [], reasonCodes: [...new Set(reasonCodes)] };
  }

  const rows = [];
  for (const board of boards) {
    const channel = await cardContract.discordRequest({ path: `/channels/${board.forumChannelId}`, token, fetchImpl });
    if (!channel.ok || !channel.payload?.guild_id) {
      reasonCodes.push(`board_forum_read_failed:${board.id}`);
      continue;
    }
    const inventory = await listThreads({ board, guildId: channel.payload.guild_id, token, fetchImpl });
    reasonCodes.push(...inventory.reasonCodes.map((code) => `${code}:${board.id}`));
    for (const thread of inventory.threads) {
      const [starter, messages] = await Promise.all([
        cardContract.fetchMessage({ channelId: thread.id, messageId: thread.id, token, fetchImpl }),
        cardContract.discordRequest({ path: `/channels/${thread.id}/messages?limit=100`, token, fetchImpl }),
      ]);
      if (!starter.ok) reasonCodes.push(`card_starter_read_failed:${thread.id}`);
      if (!messages.ok) reasonCodes.push(`card_journal_read_failed:${thread.id}`);
      rows.push(inspectThread({
        board,
        thread,
        starter: starter.ok ? starter.payload : null,
        messages: messages.ok ? messages.payload : [],
      }));
    }
  }
  const duplicates = findDuplicates(rows);
  if (duplicates.length > 0) reasonCodes.push("duplicate_card_identity_across_boards");
  const driftCounts = {};
  for (const row of rows) {
    for (const code of row.reasonCodes) driftCounts[code] = (driftCounts[code] || 0) + 1;
  }
  return {
    ok: reasonCodes.length === 0 && rows.every((row) => row.ok),
    status: reasonCodes.length === 0 && rows.every((row) => row.ok) ? "consistent" : "drift_detected",
    boardCount: boards.length,
    cardCount: rows.length,
    healthyCardCount: rows.filter((row) => row.ok).length,
    driftedCardCount: rows.filter((row) => !row.ok).length,
    driftCounts,
    duplicates,
    rows,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Board Card Consistency",
    "",
    `- status: \`${result.status}\``,
    `- boards: \`${result.boardCount || 0}\``,
    `- cards: \`${result.cardCount || 0}\``,
    `- healthy: \`${result.healthyCardCount || 0}\``,
    `- drifted: \`${result.driftedCardCount || 0}\``,
  ];
  for (const [code, count] of Object.entries(result.driftCounts || {})) lines.push(`- ${code}: \`${count}\``);
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await fs.readFile(options.inputPath, "utf8"));
  const result = await buildBoardCardConsistency({ payload });
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
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
    parseArgs,
    parseCardId,
    parseCardState,
    hasJournal,
    inspectThread,
    findDuplicates,
    buildBoardCardConsistency,
  },
};
