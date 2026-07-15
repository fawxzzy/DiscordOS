const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");
const {
  _internals: forumProfile,
} = require("./discordos-forum-profile");
const {
  _internals: scanCli,
} = require("./discordos-forum-profile-scan");

const NORMALIZATION_ENV = "DISCORDOS_FORUM_PROFILE_NORMALIZATION";
const NORMALIZATION_ENV_VALUE = "enabled";
const RECEIPT_SCHEMA_VERSION = "discordos.forum-profile-normalization.v1";

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = {
    boardRegistryPath: scanCli.DEFAULT_BOARD_REGISTRY_PATH,
    profileRegistryPath: scanCli.DEFAULT_PROFILE_REGISTRY_PATH,
    outputPath: null,
    allowNormalization: false,
    apply: false,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--registry") {
      options.boardRegistryPath = path.resolve(readValue(args, index, "missing_registry_path"));
      index += 1;
    } else if (arg === "--profiles") {
      options.profileRegistryPath = path.resolve(readValue(args, index, "missing_profiles_path"));
      index += 1;
    } else if (arg === "--output") {
      options.outputPath = path.resolve(readValue(args, index, "missing_output_path"));
      index += 1;
    } else if (arg === "--allow-normalization") options.allowNormalization = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--json") options.json = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (!options.outputPath) throw new Error("output_path_missing");
  return options;
}

function resolveAdmission({ apply, allowNormalization, env }) {
  if (!apply) return { requested: false, admitted: false, status: "dry_run", reasonCodes: [] };
  const envEnabled = env?.[NORMALIZATION_ENV] === NORMALIZATION_ENV_VALUE;
  if (allowNormalization && envEnabled) {
    return { requested: true, admitted: true, status: "normalization_admitted", reasonCodes: [] };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["forum_profile_normalization_double_guard_missing"],
  };
}

function normalizationBlockers(scanReceipt) {
  const blockers = [];
  if (scanReceipt?.denominator?.coverageStatus !== "complete") blockers.push("forum_profile_denominator_incomplete");
  for (const code of scanReceipt?.reasonCodes || []) {
    if (/^(board_registry_|forum_profile_|permission_role_|permission_overwrite_unknown_role$|forum_channel_missing$|stale_forum_identity:|uncovered_live_board:|live_card_readback_incomplete$|orphan_tag_ambiguity:|applied_tag_semantic_ambiguity:)/.test(code)) {
      blockers.push(code);
    }
  }
  return forumProfile.unique(blockers).sort();
}

function tagPayload(forum) {
  const byName = new Map();
  for (const tag of forum.tags.actual) {
    const values = byName.get(tag.name) || [];
    values.push(tag);
    byName.set(tag.name, values);
  }
  const reasonCodes = [];
  const availableTags = forum.tags.rows.filter((row) => row.expected).map((row) => {
    const expected = row.expected;
    const matches = byName.get(expected.name) || [];
    if (matches.length > 1) reasonCodes.push(`forum_tag_name_ambiguous:${forum.boardId}:${expected.name}`);
    const existing = matches.length === 1 ? matches[0] : null;
    return {
      ...(existing?.id ? { id: existing.id } : {}),
      name: expected.name,
      moderated: expected.moderated,
      emoji_id: expected.emojiId,
      emoji_name: expected.emojiName,
    };
  });
  return { availableTags, reasonCodes };
}

function permissionOverwritePayload(roleResolution) {
  const reasonCodes = [...roleResolution.reasonCodes];
  const permissionOverwrites = roleResolution.resolved.map((role) => {
    if (!role.roleId) reasonCodes.push(`permission_role_unknown:${role.semanticKey}`);
    return {
      id: role.roleId,
      type: 0,
      allow: role.expectedAllow,
      deny: role.expectedDeny,
    };
  });
  return { permissionOverwrites, reasonCodes };
}

function normalizableFields(forum) {
  const fields = [];
  if (!forum.structure.checks.find((row) => row.field === "topic")?.exact) fields.push("topic");
  if (!forum.tags.ok) fields.push("available_tags");
  if (!forum.permissions.ok) fields.push("permission_overwrites");
  for (const row of forum.defaults.rows.filter((candidate) => !candidate.exact)) fields.push(row.apiField);
  return fields;
}

function buildNormalizationPlan({ boardRegistry, profileRegistry, scanReceipt, context }) {
  const reasonCodes = normalizationBlockers(scanReceipt);
  const actions = [];
  const internalActions = [];
  const resolvedRegistry = context.resolvedBoardRegistry || boardRegistry;
  for (const forum of scanReceipt.forums || []) {
    const board = resolvedRegistry.boards.find((candidate) => candidate.id === forum.boardId);
    const expected = forumProfile.expectedBoardProfile(board, profileRegistry);
    const tags = tagPayload(forum);
    const roleResolution = context.roleResolutionByProfile.get(forum.permissionProfile) || { resolved: [], reasonCodes: ["permission_profile_resolution_missing"] };
    const permissions = permissionOverwritePayload(roleResolution);
    reasonCodes.push(...tags.reasonCodes, ...permissions.reasonCodes);
    const fields = normalizableFields(forum);
    const defaults = profileRegistry.forumProfiles[forum.forumProfile].defaults;
    const expectedStructure = profileRegistry.boards[forum.boardId];
    const payload = {
      name: expectedStructure.name,
      topic: expectedStructure.topic,
      available_tags: tags.availableTags,
      permission_overwrites: permissions.permissionOverwrites,
      default_reaction_emoji: defaults.defaultReactionEmoji,
      default_sort_order: defaults.defaultSortOrder,
      default_forum_layout: defaults.defaultForumLayout,
      rate_limit_per_user: defaults.rateLimitPerUser,
      flags: defaults.flags,
      nsfw: defaults.nsfw,
    };
    const action = {
      boardId: forum.boardId,
      forumChannelId: forum.forumChannelId,
      action: fields.length > 0 ? "patch_forum_profile" : "no_change",
      fields,
      preservesBoardExceptions: true,
      mutatesCards: false,
      migratesLegacyCards: false,
    };
    actions.push(action);
    internalActions.push({ ...action, payload, expected });
  }
  const uniqueReasonCodes = forumProfile.unique(reasonCodes).sort();
  return {
    ok: uniqueReasonCodes.length === 0,
    status: uniqueReasonCodes.length === 0 ? "plan_ready" : "blocked",
    actionCount: actions.filter((action) => action.action !== "no_change").length,
    unchangedCount: actions.filter((action) => action.action === "no_change").length,
    actions,
    reasonCodes: uniqueReasonCodes,
    internalActions,
    scope: {
      forumProfileNormalization: true,
      cardMutation: false,
      legacyCardMigration: "separate_packet_required",
      activeSourceCompletionSemantics: "separate_packet_required",
      orphanTagCleanup: "separate_packet_required",
      socialsOsAdmission: "separate_owner_lane_required",
    },
  };
}

async function exactReadback({ internalActions, context, fetchImpl }) {
  const rows = [];
  const reasonCodes = [];
  for (const action of internalActions) {
    const response = await cardContract.discordRequest({
      path: `/channels/${action.forumChannelId}`,
      token: context.token,
      fetchImpl,
    });
    if (!response.ok || !response.payload) {
      reasonCodes.push(`forum_profile_readback_failed:${action.boardId}`);
      rows.push({ boardId: action.boardId, forumChannelId: action.forumChannelId, exact: false, reasonCodes: ["forum_profile_readback_failed"] });
      continue;
    }
    const inspected = forumProfile.inspectForumChannel({
      expected: action.expected,
      channel: response.payload,
      roleResolution: context.roleResolutionByProfile.get(action.expected.permissionProfile),
    });
    if (!inspected.ok) reasonCodes.push(`forum_profile_readback_mismatch:${action.boardId}`);
    rows.push({
      boardId: action.boardId,
      forumChannelId: action.forumChannelId,
      exact: inspected.ok,
      structure: inspected.structure,
      tags: { ok: inspected.tags.ok, expectedCount: inspected.tags.expectedCount, actualCount: inspected.tags.actualCount },
      permissions: inspected.permissions,
      defaults: inspected.defaults,
      reasonCodes: inspected.reasonCodes,
    });
  }
  return { ok: reasonCodes.length === 0, status: reasonCodes.length === 0 ? "exact" : "failed", rows, reasonCodes };
}

async function buildForumProfileNormalization({
  boardRegistry,
  profileRegistry,
  allowNormalization = false,
  apply = false,
  env = process.env,
  fetchImpl = fetch,
  scanImpl = forumProfile.buildLiveForumProfileScan,
  scanOptions = {},
  now = () => new Date(),
} = {}) {
  const admission = resolveAdmission({ apply, allowNormalization, env });
  if (apply && !admission.admitted) {
    return {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      generatedAt: now().toISOString(),
      ok: false,
      status: "blocked",
      apply,
      admission,
      mutatesDiscord: false,
      sendsMessages: false,
      redactions: { botToken: "omitted", liveRoleIds: "omitted" },
      scan: null,
      plan: null,
      writes: [],
      readback: null,
      reasonCodes: admission.reasonCodes,
    };
  }

  const scanResult = await scanImpl({ boardRegistry, profileRegistry, env, fetchImpl, now, ...scanOptions });
  scanResult.context.token = forumProfile.text(env?.DISCORDOS_BOT_TOKEN);
  const plan = buildNormalizationPlan({ boardRegistry, profileRegistry, scanReceipt: scanResult.receipt, context: scanResult.context });
  if (!plan.ok || !apply) {
    const status = plan.ok ? "dry_run_ready" : "blocked";
    return {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      generatedAt: now().toISOString(),
      ok: plan.ok,
      status,
      apply: false,
      admission,
      mutatesDiscord: false,
      sendsMessages: false,
      redactions: { botToken: "omitted", liveRoleIds: "omitted" },
      scan: scanResult.receipt,
      plan: { ...plan, internalActions: undefined },
      writes: [],
      readback: null,
      reasonCodes: plan.reasonCodes,
    };
  }

  const writes = [];
  for (const action of plan.internalActions.filter((candidate) => candidate.action === "patch_forum_profile")) {
    const response = await cardContract.discordRequest({
      path: `/channels/${action.forumChannelId}`,
      token: scanResult.context.token,
      method: "PATCH",
      body: action.payload,
      fetchImpl,
    });
    const row = { boardId: action.boardId, forumChannelId: action.forumChannelId, ok: response.ok, status: response.status || null };
    writes.push(row);
    if (!response.ok) break;
  }
  const writeFailed = writes.some((write) => !write.ok);
  const readback = writeFailed ? null : await exactReadback({ internalActions: plan.internalActions, context: scanResult.context, fetchImpl });
  const reasonCodes = [
    ...(writeFailed ? ["forum_profile_write_failed"] : []),
    ...(readback?.reasonCodes || []),
  ];
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    generatedAt: now().toISOString(),
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "normalized" : "partial_failure",
    apply,
    admission,
    mutatesDiscord: writes.length > 0,
    sendsMessages: false,
    redactions: { botToken: "omitted", liveRoleIds: "omitted" },
    scan: scanResult.receipt,
    plan: { ...plan, internalActions: undefined },
    writes,
    readback,
    reasonCodes,
  };
}

function renderMarkdown(receipt) {
  return [
    "# DiscordOS Forum Profile Normalization",
    "",
    `- status: \`${receipt.status}\``,
    `- apply: \`${receipt.apply}\``,
    `- planned changes: \`${receipt.plan?.actionCount || 0}\``,
    `- writes: \`${receipt.writes.length}\``,
    `- exact readback: \`${receipt.readback?.ok === true ? "pass" : receipt.readback ? "fail" : "not_run"}\``,
    `- reason codes: \`${receipt.reasonCodes.join(",") || "none"}\``,
    "- legacy card migration: `separate_packet_required`",
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [boardRegistry, profileRegistry] = await Promise.all([
    forumProfile.readJson(options.boardRegistryPath),
    forumProfile.readJson(options.profileRegistryPath),
  ]);
  const receipt = await buildForumProfileNormalization({
    boardRegistry,
    profileRegistry,
    allowNormalization: options.allowNormalization,
    apply: options.apply,
  });
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, json, "utf8");
  process.stdout.write(options.json ? json : renderMarkdown(receipt));
  process.exitCode = receipt.ok ? 0 : 1;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

module.exports = {
  NORMALIZATION_ENV,
  NORMALIZATION_ENV_VALUE,
  RECEIPT_SCHEMA_VERSION,
  _internals: {
    parseArgs,
    resolveAdmission,
    normalizationBlockers,
    tagPayload,
    permissionOverwritePayload,
    normalizableFields,
    buildNormalizationPlan,
    exactReadback,
    buildForumProfileNormalization,
    renderMarkdown,
  },
};
