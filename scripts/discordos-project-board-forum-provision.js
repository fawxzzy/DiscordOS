const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, "..", "config", "discordos-board-registry.json");
const DEFAULT_CATEGORY_ID = "1508057063874629684";
const PROVISION_ENV = "DISCORDOS_PROJECT_BOARD_FORUM_PROVISION";
const PROVISION_ENV_VALUE = "enabled";
const EXPECTED_TARGET_COUNT = 7;

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = {
    registryPath: DEFAULT_REGISTRY_PATH,
    guildId: null,
    categoryId: null,
    allowProvision: false,
    apply: false,
    json: false,
    outputPath: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--registry") {
      options.registryPath = path.resolve(readValue(args, index, "missing_registry_value"));
      index += 1;
    } else if (arg === "--guild-id") {
      options.guildId = readValue(args, index, "missing_guild_id_value");
      index += 1;
    } else if (arg === "--category-id") {
      options.categoryId = readValue(args, index, "missing_category_id_value");
      index += 1;
    } else if (arg === "--allow-provision") {
      options.allowProvision = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--output") {
      options.outputPath = path.resolve(readValue(args, index, "missing_output_value"));
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }
  return options;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveAdmission({ apply, allowProvision, env }) {
  if (!apply) {
    return { requested: false, admitted: false, status: "dry_run", reasonCodes: [] };
  }
  const envEnabled = env?.[PROVISION_ENV] === PROVISION_ENV_VALUE;
  if (allowProvision && envEnabled) {
    return { requested: true, admitted: true, status: "provision_admitted", reasonCodes: [] };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["project_board_forum_provision_double_guard_missing"],
  };
}

async function discordRequest({ path: requestPath, token, method = "GET", body = null, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(`${updatePostInternals.DISCORD_API_BASE}${requestPath}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = typeof response.json === "function" ? await response.json().catch(() => null) : null;
    return { ok: response.ok, status: response.status, payload, errorCode: null };
  } catch {
    return { ok: false, status: 0, payload: null, errorCode: "discord_request_failed" };
  }
}

async function fetchGuildChannels({ guildId, token, fetchImpl = fetch }) {
  return discordRequest({ path: `/guilds/${guildId}/channels`, token, fetchImpl });
}

async function createForumChannel({ guildId, categoryId, token, target, fetchImpl = fetch }) {
  return discordRequest({
    path: `/guilds/${guildId}/channels`,
    token,
    method: "POST",
    body: {
      name: target.forumName,
      type: 15,
      parent_id: categoryId,
      topic: `Project feedback, planning, and governed delivery journal for ${target.project}.`,
    },
    fetchImpl,
  });
}

async function readRegistry(registryPath, fsImpl = fs) {
  return JSON.parse(await fsImpl.readFile(registryPath, "utf8"));
}

function selectProvisionTargets(registry) {
  if (!registry || registry.schemaVersion !== "discordos.board-registry.v1" || !Array.isArray(registry.boards)) {
    throw new Error("project_board_registry_invalid");
  }
  return registry.boards
    .filter((board) => board.required === true
      && board.role === "active"
      && String(board.id || "").endsWith("-active-admission"))
    .map((board) => ({
      boardId: board.id,
      project: board.project,
      forumName: normalizeName(board.forumChannelName || board.stableCardNamespace),
      expectedForumChannelId: board.forumChannelId || null,
      stableCardNamespace: board.stableCardNamespace,
      sourceAdapter: board.sourceAdapter,
    }))
    .sort((left, right) => left.boardId.localeCompare(right.boardId));
}

function summarizeChannel(channel) {
  return channel ? {
    id: channel.id || null,
    name: channel.name || null,
    type: channel.type,
    parentId: channel.parent_id || null,
  } : null;
}

function inspectTargets({ channels, categoryId, targets }) {
  const reasonCodes = [];
  const rows = [];
  const desiredNames = targets.map((target) => target.forumName);
  if (new Set(desiredNames).size !== desiredNames.length) reasonCodes.push("project_board_forum_target_name_duplicate");

  for (const target of targets) {
    const matches = channels.filter((channel) => normalizeName(channel?.name) === target.forumName);
    const exact = matches.filter((channel) => channel?.type === 15 && channel?.parent_id === categoryId);
    const conflicts = matches.filter((channel) => channel?.type !== 15 || channel?.parent_id !== categoryId);
    const rowReasonCodes = [];
    if (exact.length > 1) rowReasonCodes.push("project_board_forum_duplicate_exact_match");
    if (conflicts.length > 0) rowReasonCodes.push("project_board_forum_name_conflict");
    if (exact.length === 1 && target.expectedForumChannelId && exact[0].id !== target.expectedForumChannelId) {
      rowReasonCodes.push("project_board_forum_registry_id_mismatch");
    }
    reasonCodes.push(...rowReasonCodes);
    rows.push({
      ...target,
      existing: exact.length === 1 ? summarizeChannel(exact[0]) : null,
      needsCreate: exact.length === 0 && conflicts.length === 0,
      reasonCodes: rowReasonCodes,
    });
  }
  return { rows, reasonCodes: [...new Set(reasonCodes)] };
}

function exactReadback({ channels, categoryId, targets, expectedIds }) {
  const rows = targets.map((target) => {
    const matches = channels.filter((channel) => channel?.type === 15
      && channel?.parent_id === categoryId
      && normalizeName(channel?.name) === target.forumName);
    const expectedId = expectedIds.get(target.boardId) || null;
    const channel = matches.length === 1 ? matches[0] : null;
    const reasonCodes = [];
    if (matches.length !== 1) reasonCodes.push("project_board_forum_exact_readback_count_mismatch");
    if (channel && expectedId && channel.id !== expectedId) reasonCodes.push("project_board_forum_exact_readback_id_mismatch");
    return {
      boardId: target.boardId,
      project: target.project,
      forumName: target.forumName,
      expectedId,
      channel: summarizeChannel(channel),
      ok: reasonCodes.length === 0,
      reasonCodes,
    };
  });
  return {
    ok: rows.every((row) => row.ok),
    rows,
    reasonCodes: [...new Set(rows.flatMap((row) => row.reasonCodes))],
  };
}

async function buildProjectBoardForumProvision({
  registryPath = DEFAULT_REGISTRY_PATH,
  guildId = null,
  categoryId = null,
  allowProvision = false,
  apply = false,
  env = process.env,
  fetchImpl = fetch,
  fsImpl = fs,
} = {}) {
  const registry = await readRegistry(registryPath, fsImpl);
  const resolvedGuildId = guildId || env.DISCORDOS_GUILD_ID || registry.guildId || null;
  const resolvedCategoryId = categoryId || env.DISCORDOS_PROJECT_FEEDBACK_CATEGORY_CHANNEL_ID || DEFAULT_CATEGORY_ID;
  const token = env.DISCORDOS_BOT_TOKEN || null;
  const admission = resolveAdmission({ apply, allowProvision, env });
  const reasonCodes = [...admission.reasonCodes];
  const targets = selectProvisionTargets(registry);

  if (targets.length !== EXPECTED_TARGET_COUNT) reasonCodes.push("project_board_forum_target_count_mismatch");
  if (!resolvedGuildId) reasonCodes.push("guild_id_missing");
  if (!resolvedCategoryId) reasonCodes.push("project_feedback_category_id_missing");
  if (!token) reasonCodes.push("bot_token_missing");

  if (reasonCodes.length > 0) {
    return {
      ok: false,
      destructive: false,
      sendsMessages: false,
      mutatesDiscord: false,
      status: "blocked",
      admission,
      guildId: resolvedGuildId,
      categoryId: resolvedCategoryId,
      targetCount: targets.length,
      createdCount: 0,
      reusedCount: 0,
      targets,
      readback: null,
      reasonCodes: [...new Set(reasonCodes)],
    };
  }

  const initial = await fetchGuildChannels({ guildId: resolvedGuildId, token, fetchImpl });
  if (!initial.ok || !Array.isArray(initial.payload)) {
    reasonCodes.push("guild_channels_fetch_failed");
    if (initial.errorCode) reasonCodes.push(initial.errorCode);
  }
  const channels = Array.isArray(initial.payload) ? initial.payload : [];
  const category = channels.find((channel) => channel?.id === resolvedCategoryId);
  if (!category || category.type !== 4) reasonCodes.push("project_feedback_category_invalid");

  const inspection = inspectTargets({ channels, categoryId: resolvedCategoryId, targets });
  reasonCodes.push(...inspection.reasonCodes);
  const expectedIds = new Map(inspection.rows
    .filter((row) => row.expectedForumChannelId || row.existing)
    .map((row) => [row.boardId, row.expectedForumChannelId || row.existing.id]));
  const created = [];

  if (apply && admission.admitted && reasonCodes.length === 0) {
    for (const row of inspection.rows.filter((candidate) => candidate.needsCreate)) {
      const response = await createForumChannel({
        guildId: resolvedGuildId,
        categoryId: resolvedCategoryId,
        token,
        target: row,
        fetchImpl,
      });
      if (!response.ok || !response.payload?.id) {
        reasonCodes.push(`project_board_forum_create_failed:${row.boardId}`);
        if (response.errorCode) reasonCodes.push(response.errorCode);
        break;
      }
      expectedIds.set(row.boardId, response.payload.id);
      created.push({ boardId: row.boardId, channel: summarizeChannel(response.payload) });
    }
  }

  let readback = null;
  if (apply && (reasonCodes.length === 0 || created.length > 0)) {
    const finalChannels = await fetchGuildChannels({ guildId: resolvedGuildId, token, fetchImpl });
    if (!finalChannels.ok || !Array.isArray(finalChannels.payload)) {
      reasonCodes.push("project_board_forum_readback_fetch_failed");
      if (finalChannels.errorCode) reasonCodes.push(finalChannels.errorCode);
    } else {
      readback = exactReadback({
        channels: finalChannels.payload,
        categoryId: resolvedCategoryId,
        targets,
        expectedIds,
      });
      if (apply) reasonCodes.push(...readback.reasonCodes);
    }
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const ok = uniqueReasonCodes.length === 0 && (!apply || readback?.ok === true);
  return {
    ok,
    destructive: false,
    sendsMessages: false,
    mutatesDiscord: apply && admission.admitted,
    status: ok ? (apply ? "provisioned" : "dry_run_ready") : "blocked",
    admission,
    guildId: resolvedGuildId,
    categoryId: resolvedCategoryId,
    targetCount: targets.length,
    plannedCreateCount: inspection.rows.filter((row) => row.needsCreate).length,
    createdCount: created.length,
    reusedCount: inspection.rows.filter((row) => row.existing).length,
    targets: inspection.rows,
    created,
    readback,
    reasonCodes: uniqueReasonCodes,
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Project Board Forum Provision",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- status: \`${result.status}\``,
    `- target count: \`${result.targetCount}\``,
    `- planned creates: \`${result.plannedCreateCount ?? 0}\``,
    `- created: \`${result.createdCount}\``,
    `- reused: \`${result.reusedCount}\``,
    `- exact readback: \`${result.readback?.ok === true ? "pass" : result.readback ? "fail" : "not-run"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildProjectBoardForumProvision(options);
    const rendered = options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result);
    if (options.outputPath) {
      await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
      await fs.writeFile(options.outputPath, rendered, "utf8");
    }
    process.stdout.write(rendered);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  _internals: {
    DEFAULT_REGISTRY_PATH,
    DEFAULT_CATEGORY_ID,
    PROVISION_ENV,
    PROVISION_ENV_VALUE,
    EXPECTED_TARGET_COUNT,
    parseArgs,
    normalizeName,
    resolveAdmission,
    discordRequest,
    fetchGuildChannels,
    createForumChannel,
    readRegistry,
    selectProvisionTargets,
    summarizeChannel,
    inspectTargets,
    exactReadback,
    buildProjectBoardForumProvision,
    renderMarkdown,
  },
};
