const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");
const {
  _internals: journal,
} = require("./discordos-board-card-journal");

const CLEANUP_ENV = "DISCORDOS_BOARD_ENCODING_CLEANUP";
const CLEANUP_ENV_VALUE = "enabled";
const THREAD_NAME_CHANGE_MESSAGE_TYPE = 4;

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
  const envEnabled = env?.[CLEANUP_ENV] === CLEANUP_ENV_VALUE;
  if (!allowApply && !envEnabled) return { requested: false, admitted: false, reasonCodes: [] };
  if (allowApply && envEnabled) return { requested: true, admitted: true, reasonCodes: [] };
  return { requested: true, admitted: false, reasonCodes: ["board_encoding_cleanup_double_guard_missing"] };
}

function comparable(value) {
  return journal.repairMojibakeText(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function classifyMessage({ message, thread, botUserId }) {
  const runs = journal.findMojibakeRuns(message?.content);
  if (runs.length === 0) return { suspicious: false, eligible: false, reasonCodes: [] };
  const reasonCodes = [];
  if (message?.id === thread?.id) reasonCodes.push("encoding_cleanup_starter_message_protected");
  if (message?.type !== THREAD_NAME_CHANGE_MESSAGE_TYPE) reasonCodes.push("encoding_cleanup_non_rename_message_protected");
  if (message?.author?.bot !== true || message?.author?.id !== botUserId) {
    reasonCodes.push("encoding_cleanup_non_bot_message_protected");
  }
  if (journal.findMojibakeRuns(thread?.name).length > 0) reasonCodes.push("encoding_cleanup_current_title_not_clean");
  if (comparable(message?.content) !== comparable(thread?.name)) {
    reasonCodes.push("encoding_cleanup_title_mismatch");
  }
  return {
    suspicious: true,
    eligible: reasonCodes.length === 0,
    repairedText: journal.repairMojibakeText(message?.content),
    runs,
    reasonCodes,
  };
}

async function buildBoardEncodingCleanup({
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
  if (apply && !admission.admitted) reasonCodes.push("board_encoding_cleanup_not_admitted");
  if (reasonCodes.length > 0) {
    return { ok: false, status: "blocked", apply, admission, candidateCount: 0, deletedCount: 0, rows: [], reasonCodes };
  }

  const bot = await cardContract.discordRequest({ path: "/users/@me", token, fetchImpl });
  if (!bot.ok || !bot.payload?.id || bot.payload?.bot !== true) {
    return {
      ok: false,
      status: "blocked",
      apply,
      admission,
      candidateCount: 0,
      deletedCount: 0,
      rows: [],
      reasonCodes: ["discord_bot_identity_read_failed"],
    };
  }

  const rows = [];
  for (const board of payload?.boards || []) {
    const channel = await cardContract.discordRequest({ path: `/channels/${board.forumChannelId}`, token, fetchImpl });
    if (!channel.ok || !channel.payload?.guild_id) {
      reasonCodes.push(`board_read_failed:${board.id}`);
      continue;
    }
    const inventory = await journal.listForumThreads({
      forumChannelId: board.forumChannelId,
      guildId: channel.payload.guild_id,
      token,
      fetchImpl,
    });
    reasonCodes.push(...inventory.reasonCodes.map((code) => `${code}:${board.id}`));
    for (const thread of inventory.threads) {
      const messages = await cardContract.discordRequest({
        path: `/channels/${thread.id}/messages?limit=100`,
        token,
        fetchImpl,
      });
      if (!messages.ok || !Array.isArray(messages.payload)) {
        reasonCodes.push(`message_history_read_failed:${thread.id}`);
        continue;
      }
      for (const message of messages.payload) {
        const classification = classifyMessage({ message, thread, botUserId: bot.payload.id });
        if (!classification.suspicious) continue;
        const row = {
          ok: classification.eligible,
          boardId: board.id,
          threadId: thread.id,
          messageId: message.id,
          eligible: classification.eligible,
          action: classification.eligible ? (apply ? "delete" : "would_delete") : "protected",
          deleted: false,
          readbackDeleted: false,
          runs: classification.runs,
          reasonCodes: [...classification.reasonCodes],
        };
        if (apply && classification.eligible) {
          const deleted = await cardContract.discordRequest({
            path: `/channels/${thread.id}/messages/${message.id}`,
            token,
            method: "DELETE",
            fetchImpl,
          });
          if (!deleted.ok || deleted.status !== 204) row.reasonCodes.push("encoding_cleanup_delete_failed");
          else {
            row.deleted = true;
            const readback = await cardContract.fetchMessage({
              channelId: thread.id,
              messageId: message.id,
              token,
              fetchImpl,
            });
            row.readbackDeleted = !readback.ok && readback.status === 404;
            if (!row.readbackDeleted) row.reasonCodes.push("encoding_cleanup_delete_readback_failed");
          }
        }
        row.ok = row.reasonCodes.length === 0;
        rows.push(row);
      }
    }
  }

  for (const row of rows) reasonCodes.push(...row.reasonCodes.map((code) => `${code}:${row.messageId}`));
  const candidateCount = rows.filter((row) => row.eligible).length;
  const deletedCount = rows.filter((row) => row.deleted && row.readbackDeleted).length;
  const ok = reasonCodes.length === 0 && rows.every((row) => row.ok);
  return {
    ok,
    status: ok ? (rows.length === 0 ? "clean" : apply ? "cleaned" : "dry_run") : "blocked",
    apply,
    admission,
    candidateCount,
    deletedCount,
    rows,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Encoding Cleanup",
    "",
    `- status: \`${result.status}\``,
    `- apply: \`${result.apply}\``,
    `- candidates: \`${result.candidateCount || 0}\``,
    `- deleted: \`${result.deletedCount || 0}\``,
    `- reason codes: \`${result.reasonCodes.join(", ") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await fs.readFile(options.inputPath, "utf8"));
  const result = await buildBoardEncodingCleanup({
    payload,
    allowApply: options.allowApply,
    apply: options.apply,
  });
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
    CLEANUP_ENV,
    CLEANUP_ENV_VALUE,
    THREAD_NAME_CHANGE_MESSAGE_TYPE,
    parseArgs,
    resolveAdmission,
    comparable,
    classifyMessage,
    buildBoardEncodingCleanup,
  },
};
