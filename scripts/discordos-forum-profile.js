const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");
const {
  _internals: boardRegistryContract,
} = require("./discordos-board-registry");
const {
  _internals: textIntegrity,
} = require("./discordos-board-text-integrity");

const PROFILE_SCHEMA_VERSION = "discordos.forum-profile-registry.v1";
const SCAN_SCHEMA_VERSION = "discordos.forum-profile-scan.v1";
const FORUM_CHANNEL_TYPE = 15;
const PERMISSION_BITS = Object.freeze({
  ViewChannel: 1024n,
  SendMessages: 2048n,
});
const CANONICAL_TAGS = Object.freeze([
  ["type.bug", "type", "Bug"],
  ["type.feature", "type", "Feature"],
  ["state.intake", "state", "Intake"],
  ["state.planning", "state", "Planning"],
  ["state.ready", "state", "Ready"],
  ["state.opened", "state", "Opened"],
  ["state.in_progress", "state", "In Progress"],
  ["state.review", "state", "Review"],
  ["state.blocked", "state", "Blocked"],
  ["state.completed", "state", "Completed"],
  ["priority.low", "priority", "Low"],
  ["priority.medium", "priority", "Medium"],
  ["priority.high", "priority", "High"],
  ["priority.blocker", "priority", "Blocker"],
  ["outcome.duplicate", "outcome", "Duplicate"],
  ["outcome.withdrawn", "outcome", "Withdrawn"],
  ["record.superseded", "record", "Superseded"],
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizedDecimal(value) {
  try {
    return BigInt(value == null || value === "" ? 0 : value).toString();
  } catch {
    return null;
  }
}

function permissionMask(names) {
  let result = 0n;
  for (const name of Array.isArray(names) ? names : []) {
    if (!Object.hasOwn(PERMISSION_BITS, name)) throw new Error(`permission_name_unknown:${name}`);
    result |= PERMISSION_BITS[name];
  }
  return result.toString();
}

function permissionNames(value) {
  let remaining;
  try {
    remaining = BigInt(value == null || value === "" ? 0 : value);
  } catch {
    return { names: [], unknownBits: "invalid" };
  }
  const names = [];
  for (const [name, bit] of Object.entries(PERMISSION_BITS)) {
    if ((remaining & bit) === bit) {
      names.push(name);
      remaining &= ~bit;
    }
  }
  return { names, unknownBits: remaining.toString() };
}

function validateProfileRegistry(profileRegistry, boardRegistry) {
  const reasonCodes = [];
  const boardValidation = boardRegistryContract.validateBoardRegistry(boardRegistry);
  reasonCodes.push(...boardValidation.reasonCodes);
  if (profileRegistry?.schemaVersion !== PROFILE_SCHEMA_VERSION) reasonCodes.push("forum_profile_schema_version_invalid");
  if (profileRegistry?.boardRegistrySchemaVersion !== boardRegistry?.schemaVersion) {
    reasonCodes.push("forum_profile_board_registry_schema_mismatch");
  }
  if (text(profileRegistry?.category?.channelId) !== text(boardRegistry?.discovery?.forumCategoryChannelId)) {
    reasonCodes.push("forum_profile_category_id_mismatch");
  }
  if (profileRegistry?.category?.type !== 4) reasonCodes.push("forum_profile_category_type_invalid");
  if (profileRegistry?.tagTaxonomy?.maxAppliedTags !== 5) reasonCodes.push("forum_profile_max_applied_tags_invalid");

  const tags = Array.isArray(profileRegistry?.tagTaxonomy?.orderedTags)
    ? profileRegistry.tagTaxonomy.orderedTags
    : [];
  if (tags.length !== CANONICAL_TAGS.length) reasonCodes.push("forum_profile_tag_taxonomy_count_invalid");
  for (let index = 0; index < CANONICAL_TAGS.length; index += 1) {
    const [semanticKey, group, name] = CANONICAL_TAGS[index];
    const actual = tags[index] || {};
    if (actual.semanticKey !== semanticKey || actual.group !== group || actual.name !== name) {
      reasonCodes.push(`forum_profile_tag_taxonomy_order_invalid:${index}`);
    }
    if (actual.emoji !== null) reasonCodes.push(`forum_profile_tag_emoji_invalid:${semanticKey}`);
  }
  if (new Set(tags.map((tag) => text(tag?.semanticKey))).size !== tags.length) {
    reasonCodes.push("forum_profile_tag_semantic_key_duplicate");
  }
  if (profileRegistry?.tagTaxonomy?.moderationRule?.type !== "moderated") {
    reasonCodes.push("forum_profile_type_moderation_rule_invalid");
  }
  if (profileRegistry?.titlePolicy?.id !== cardContract.CANONICAL_TITLE_POLICY
    || profileRegistry?.titlePolicy?.style !== "plain_work_outcome") {
    reasonCodes.push("forum_profile_title_policy_invalid");
  }
  for (const group of ["state", "priority", "outcome", "record"]) {
    if (profileRegistry?.tagTaxonomy?.moderationRule?.[group] !== "moderated") {
      reasonCodes.push(`forum_profile_moderation_rule_invalid:${group}`);
    }
  }

  const permissionProfiles = profileRegistry?.permissionProfiles || {};
  const forumProfiles = profileRegistry?.forumProfiles || {};
  const boardProfiles = profileRegistry?.boards || {};
  const enabledRequiredBoards = (boardRegistry?.boards || []).filter((board) => board?.required === true && board?.status === "enabled");
  if (Object.keys(boardProfiles).length !== enabledRequiredBoards.length) reasonCodes.push("forum_profile_board_denominator_mismatch");

  const orders = [];
  for (const board of enabledRequiredBoards) {
    const boardId = text(board?.id);
    const expected = boardProfiles[boardId];
    const forumProfile = forumProfiles[text(board?.forumProfile)];
    const permissionProfile = permissionProfiles[text(board?.permissionProfile)];
    if (!expected) reasonCodes.push(`forum_profile_board_missing:${boardId}`);
    if (!forumProfile) reasonCodes.push(`forum_profile_reference_unknown:${boardId}`);
    if (!permissionProfile) reasonCodes.push(`permission_profile_reference_unknown:${boardId}`);
    if (forumProfile && forumProfile.permissionProfile !== board.permissionProfile) {
      reasonCodes.push(`permission_profile_reference_mismatch:${boardId}`);
    }
    if (expected) {
      if (expected.name !== board.forumChannelName) reasonCodes.push(`forum_profile_board_name_mismatch:${boardId}`);
      if (expected.parentChannelId !== boardRegistry.discovery.forumCategoryChannelId) {
        reasonCodes.push(`forum_profile_board_parent_mismatch:${boardId}`);
      }
      if (expected.type !== FORUM_CHANNEL_TYPE) reasonCodes.push(`forum_profile_board_type_invalid:${boardId}`);
      if (!Number.isInteger(expected.order) || expected.order < 0) reasonCodes.push(`forum_profile_board_order_invalid:${boardId}`);
      else orders.push(expected.order);
      if (!Array.isArray(expected.exceptions)) reasonCodes.push(`forum_profile_board_exceptions_missing:${boardId}`);
      if (!text(expected.positionNormalization)) reasonCodes.push(`forum_profile_position_disposition_missing:${boardId}`);
    }
  }
  const ordered = [...orders].sort((left, right) => left - right);
  if (ordered.some((value, index) => value !== index)) reasonCodes.push("forum_profile_board_order_not_contiguous");

  for (const [profileId, permissionProfile] of Object.entries(permissionProfiles)) {
    const roles = Array.isArray(permissionProfile?.roles) ? permissionProfile.roles : [];
    if (roles.length === 0) reasonCodes.push(`permission_profile_roles_missing:${profileId}`);
    for (const role of roles) {
      try {
        permissionMask(role.allow);
        permissionMask(role.deny);
      } catch (error) {
        reasonCodes.push(text(error?.message));
      }
    }
  }

  if (textIntegrity.inspectObjectText(profileRegistry).length > 0) reasonCodes.push("forum_profile_text_integrity_failed");
  return {
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "valid" : "invalid",
    boardCount: enabledRequiredBoards.length,
    tagCount: tags.length,
    reasonCodes: unique(reasonCodes).sort(),
  };
}

function expectedTags(profileRegistry, forumProfileId) {
  const profile = profileRegistry.forumProfiles[forumProfileId];
  return profileRegistry.tagTaxonomy.orderedTags.map((tag) => ({
    semanticKey: tag.semanticKey,
    group: tag.group,
    name: tag.name,
    moderated: tag.group === "type" ? profile.typeTagsModerated === true : true,
    emojiId: tag.emoji?.id || null,
    emojiName: tag.emoji?.name || null,
  }));
}

function expectedBoardProfile(board, profileRegistry) {
  const declared = profileRegistry.boards[board.id];
  const forumProfile = profileRegistry.forumProfiles[board.forumProfile];
  return {
    boardId: board.id,
    project: board.project,
    forumChannelId: board.forumChannelId,
    forumProfile: board.forumProfile,
    permissionProfile: board.permissionProfile,
    structure: {
      name: declared.name,
      topic: declared.topic,
      parentChannelId: declared.parentChannelId,
      type: declared.type,
      order: declared.order,
      positionNormalization: declared.positionNormalization,
    },
    tags: expectedTags(profileRegistry, board.forumProfile),
    defaults: forumProfile.defaults,
    lifecycle: forumProfile.lifecycle,
    exceptions: declared.exceptions,
  };
}

function resolvePermissionRoles({ guildId, guildRoles, permissionProfile }) {
  const reasonCodes = [];
  const resolved = [];
  for (const role of permissionProfile.roles || []) {
    let matches = [];
    if (role.resolution === "guild_everyone") {
      matches = [{ id: guildId, name: "@everyone" }];
    } else if (role.resolution === "exact_guild_role_name") {
      matches = (guildRoles || []).filter((candidate) => candidate?.name === role.roleName);
    } else {
      reasonCodes.push(`permission_role_resolution_unknown:${role.semanticKey}`);
    }
    if (matches.length === 0) reasonCodes.push(`permission_role_unknown:${role.semanticKey}`);
    if (matches.length > 1) reasonCodes.push(`permission_role_ambiguous:${role.semanticKey}`);
    resolved.push({
      semanticKey: role.semanticKey,
      roleName: role.roleName,
      roleId: matches.length === 1 ? matches[0].id : null,
      expectedAllow: permissionMask(role.allow),
      expectedDeny: permissionMask(role.deny),
      allowPermissions: role.allow,
      denyPermissions: role.deny,
      resolutionStatus: matches.length === 1 ? "resolved" : matches.length === 0 ? "unknown" : "ambiguous",
    });
  }
  return { ok: reasonCodes.length === 0, resolved, reasonCodes };
}

function inspectPermissionOverwrites(channel, roleResolution) {
  const actual = Array.isArray(channel?.permission_overwrites) ? channel.permission_overwrites : [];
  const expectedRoleIds = new Set(roleResolution.resolved.map((role) => role.roleId).filter(Boolean));
  const unknownOverwriteCount = actual.filter((overwrite) => overwrite?.type !== 0 || !expectedRoleIds.has(overwrite?.id)).length;
  const reasonCodes = [...roleResolution.reasonCodes];
  if (unknownOverwriteCount > 0) reasonCodes.push("permission_overwrite_unknown_role");
  const roles = roleResolution.resolved.map((role) => {
    const overwrite = actual.find((candidate) => candidate?.type === 0 && candidate?.id === role.roleId);
    const actualAllow = overwrite ? normalizedDecimal(overwrite.allow) : null;
    const actualDeny = overwrite ? normalizedDecimal(overwrite.deny) : null;
    const exact = Boolean(overwrite)
      && actualAllow === role.expectedAllow
      && actualDeny === role.expectedDeny;
    if (!overwrite) reasonCodes.push(`permission_overwrite_missing:${role.semanticKey}`);
    else if (!exact) reasonCodes.push(`permission_overwrite_mismatch:${role.semanticKey}`);
    return {
      semanticKey: role.semanticKey,
      roleName: role.roleName,
      resolutionStatus: role.resolutionStatus,
      present: Boolean(overwrite),
      exact,
      expected: {
        allowPermissions: role.allowPermissions,
        denyPermissions: role.denyPermissions,
      },
      actual: overwrite ? {
        allowPermissions: permissionNames(actualAllow).names,
        denyPermissions: permissionNames(actualDeny).names,
        allowUnknownBits: permissionNames(actualAllow).unknownBits,
        denyUnknownBits: permissionNames(actualDeny).unknownBits,
      } : null,
    };
  });
  return {
    ok: reasonCodes.length === 0,
    roles,
    unknownOverwriteCount,
    roleIdsRedacted: true,
    reasonCodes: unique(reasonCodes),
  };
}

function normalizeActualTag(tag) {
  return {
    id: text(tag?.id) || null,
    name: text(tag?.name),
    moderated: tag?.moderated === true,
    emojiId: text(tag?.emoji_id) || null,
    emojiName: text(tag?.emoji_name) || null,
  };
}

function inspectTags(channel, expected) {
  const actual = (Array.isArray(channel?.available_tags) ? channel.available_tags : []).map(normalizeActualTag);
  const rows = [];
  const reasonCodes = [];
  const count = Math.max(expected.length, actual.length);
  for (let index = 0; index < count; index += 1) {
    const expectedTag = expected[index] || null;
    const actualTag = actual[index] || null;
    const exact = Boolean(expectedTag && actualTag)
      && expectedTag.name === actualTag.name
      && expectedTag.moderated === actualTag.moderated
      && expectedTag.emojiId === actualTag.emojiId
      && expectedTag.emojiName === actualTag.emojiName;
    if (!exact) reasonCodes.push(`forum_tag_order_or_definition_mismatch:${index}`);
    rows.push({ index, expected: expectedTag, actual: actualTag, exact });
  }
  return {
    ok: reasonCodes.length === 0,
    expectedCount: expected.length,
    actualCount: actual.length,
    rows,
    actual,
    reasonCodes,
  };
}

function inspectDefaults(channel, expected) {
  const fields = [
    ["defaultReactionEmoji", "default_reaction_emoji"],
    ["defaultSortOrder", "default_sort_order"],
    ["defaultForumLayout", "default_forum_layout"],
    ["rateLimitPerUser", "rate_limit_per_user"],
    ["flags", "flags"],
    ["nsfw", "nsfw"],
  ];
  const rows = fields.map(([contractField, apiField]) => {
    const expectedValue = expected[contractField];
    const actualValue = channel?.[apiField] ?? null;
    return { contractField, apiField, expected: expectedValue, actual: actualValue, exact: expectedValue === actualValue };
  });
  return {
    ok: rows.every((row) => row.exact),
    rows,
    reasonCodes: rows.filter((row) => !row.exact).map((row) => `forum_default_mismatch:${row.contractField}`),
  };
}

function inspectForumChannel({ expected, channel, roleResolution }) {
  if (!channel) {
    return {
      ok: false,
      boardId: expected.boardId,
      project: expected.project,
      forumChannelId: expected.forumChannelId,
      forumProfile: expected.forumProfile,
      permissionProfile: expected.permissionProfile,
      structure: null,
      tags: { ok: false, expectedCount: expected.tags.length, actualCount: 0, rows: [], actual: [], reasonCodes: ["forum_channel_missing"] },
      permissions: { ok: false, roles: [], unknownOverwriteCount: 0, roleIdsRedacted: true, reasonCodes: ["forum_channel_missing"] },
      defaults: { ok: false, rows: [], reasonCodes: ["forum_channel_missing"] },
      lifecycle: expected.lifecycle,
      exceptions: expected.exceptions,
      reasonCodes: ["forum_channel_missing"],
    };
  }
  const structureChecks = [
    { field: "id", expected: expected.forumChannelId, actual: channel.id, exact: channel.id === expected.forumChannelId },
    { field: "name", expected: expected.structure.name, actual: channel.name ?? null, exact: channel.name === expected.structure.name },
    { field: "topic", expected: expected.structure.topic, actual: channel.topic ?? null, exact: channel.topic === expected.structure.topic },
    { field: "parentChannelId", expected: expected.structure.parentChannelId, actual: channel.parent_id ?? null, exact: channel.parent_id === expected.structure.parentChannelId },
    { field: "type", expected: expected.structure.type, actual: channel.type ?? null, exact: channel.type === expected.structure.type },
  ];
  const structureReasonCodes = structureChecks.filter((row) => !row.exact).map((row) => `forum_structure_mismatch:${row.field}`);
  if (!structureChecks.find((row) => row.field === "name")?.exact
    || !structureChecks.find((row) => row.field === "parentChannelId")?.exact
    || !structureChecks.find((row) => row.field === "type")?.exact) {
    structureReasonCodes.push(`stale_forum_identity:${expected.boardId}`);
  }
  const tags = inspectTags(channel, expected.tags);
  const permissions = inspectPermissionOverwrites(channel, roleResolution);
  const defaults = inspectDefaults(channel, expected.defaults);
  const reasonCodes = unique([...structureReasonCodes, ...tags.reasonCodes, ...permissions.reasonCodes, ...defaults.reasonCodes]);
  return {
    ok: reasonCodes.length === 0,
    boardId: expected.boardId,
    project: expected.project,
    forumChannelId: expected.forumChannelId,
    forumProfile: expected.forumProfile,
    permissionProfile: expected.permissionProfile,
    structure: {
      ok: structureReasonCodes.length === 0,
      checks: structureChecks,
      observedPosition: Number.isInteger(channel.position) ? channel.position : null,
      expectedRelativeOrder: expected.structure.order,
      positionNormalization: expected.structure.positionNormalization,
      reasonCodes: structureReasonCodes,
    },
    tags,
    permissions,
    defaults,
    lifecycle: expected.lifecycle,
    exceptions: expected.exceptions,
    reasonCodes,
  };
}

function lifecycleInspection(profileId, row) {
  if (row?.retainedLegacyHistory) return { status: "retained_legacy_preserved", ok: true, reasonCodes: [] };
  if (new Set(["community-intake-v1", "legacy-active-v1"]).has(profileId)) {
    return { status: "not_applicable_deferred", ok: true, reasonCodes: [] };
  }
  let expected = null;
  if (row.superseded) expected = { archived: true, locked: true, kind: "superseded_record" };
  else if (profileId === "project-active-v1" && row.completedThreadIdLink) {
    expected = { archived: true, locked: true, kind: "completed_source_state_pending" };
  } else if (profileId === "project-active-v1") {
    expected = { archived: false, locked: false, kind: "active_card" };
  } else if (profileId === "shared-completed-v1") {
    expected = { archived: "not_applicable_discord_auto_archive_allowed", locked: false, kind: "completed_record" };
  }
  if (!expected) return { status: "not_applicable", ok: true, reasonCodes: [] };
  const reasonCodes = [];
  if (typeof expected.archived === "boolean" && row.archived !== expected.archived) {
    reasonCodes.push(`archive_expectation_mismatch:${expected.kind}`);
  }
  if (row.locked !== expected.locked) reasonCodes.push(`lock_expectation_mismatch:${expected.kind}`);
  if (profileId === "shared-completed-v1" && !row.superseded && row.state !== "completed") {
    reasonCodes.push("completed_record_state_mismatch");
  }
  return {
    status: reasonCodes.length === 0 ? "matches" : "drifted",
    ok: reasonCodes.length === 0,
    expected,
    actual: { archived: row.archived === true, locked: row.locked === true, state: row.state || null },
    reasonCodes,
  };
}

function canonicalAppliedTagNames(row) {
  if (row?.retainedLegacyHistory) return [];
  if (row?.superseded) return ["Superseded"];
  const names = [];
  if (row?.type) names.push(text(row.type).toLowerCase() === "bug" ? "Bug" : "Feature");
  const states = new Map([
    ["intake", "Intake"], ["planning", "Planning"], ["ready", "Ready"],
    ["opened", "Opened"], ["in_progress", "In Progress"], ["review", "Review"],
    ["blocked", "Blocked"], ["completed", "Completed"],
  ]);
  const state = text(row?.state).toLowerCase();
  if (states.has(state)) names.push(states.get(state));
  const priorities = new Map([["low", "Low"], ["medium", "Medium"], ["high", "High"], ["blocker", "Blocker"]]);
  const priority = text(row?.priority).toLowerCase();
  if (priorities.has(priority)) names.push(priorities.get(priority));
  return names;
}

function buildCardProfileSummary({ consistency, forums, maxAppliedTags = 5 }) {
  const reasonCodes = [];
  const forumByBoard = new Map(forums.map((forum) => [forum.boardId, forum]));
  const boardProfiles = [];
  for (const forum of forums) {
    const rows = (consistency?.rows || []).filter((row) => row.boardId === forum.boardId);
    const managedRows = rows.filter((row) => !row.retainedLegacyHistory);
    const retainedRows = rows.filter((row) => row.retainedLegacyHistory);
    const availableTagById = new Map(forum.tags.actual.filter((tag) => tag.id).map((tag) => [tag.id, tag]));
    const expectedTagNames = new Set(forum.tags.rows.map((row) => row.expected?.name).filter(Boolean));
    const appliedTagIds = unique(rows.flatMap((row) => row.appliedTagIds || [])).sort();
    const orphanAppliedTagIds = appliedTagIds.filter((id) => !availableTagById.has(id));
    const ambiguousAppliedTags = appliedTagIds.filter((id) => {
      const tag = availableTagById.get(id);
      return tag && !expectedTagNames.has(tag.name);
    }).map((id) => ({ tagId: id, observedName: availableTagById.get(id)?.name || null }));
    if (orphanAppliedTagIds.length > 0) reasonCodes.push(`orphan_tag_ambiguity:${forum.boardId}`);
    if (ambiguousAppliedTags.length > 0) reasonCodes.push(`applied_tag_semantic_ambiguity:${forum.boardId}`);
    const overAppliedTagRows = rows.filter((row) => (row.appliedTagIds || []).length > maxAppliedTags).map((row) => ({
      threadId: row.threadId,
      cardId: row.cardId,
      appliedTagCount: row.appliedTagIds.length,
    }));
    if (overAppliedTagRows.length > 0) reasonCodes.push(`applied_tag_limit_exceeded:${forum.boardId}`);
    const semanticRows = rows.map((row) => {
      const expectedNames = canonicalAppliedTagNames(row);
      const actualNames = (row.appliedTagIds || []).map((id) => availableTagById.get(id)?.name || null);
      const exact = expectedNames.length === actualNames.length
        && expectedNames.every((name, index) => name === actualNames[index]);
      return { threadId: row.threadId, cardId: row.cardId, retainedLegacyHistory: row.retainedLegacyHistory === true, expectedNames, actualNames, exact };
    });
    if (semanticRows.some((row) => !row.exact)) reasonCodes.push(`card_tag_semantic_mismatch:${forum.boardId}`);
    const lifecycleRows = rows.map((row) => ({
      threadId: row.threadId,
      cardId: row.cardId,
      ...lifecycleInspection(forum.forumProfile, row),
    }));
    if (lifecycleRows.some((row) => !row.ok)) reasonCodes.push(`lifecycle_archive_lock_drift:${forum.boardId}`);
    boardProfiles.push({
      boardId: forum.boardId,
      cardCount: managedRows.filter((row) => !row.superseded).length,
      retainedLegacyHistoryCount: retainedRows.length,
      supersededCount: rows.filter((row) => row.superseded).length,
      healthyCount: managedRows.filter((row) => !row.superseded && row.ok).length,
      driftedCount: managedRows.filter((row) => !row.ok).length,
      managedStarterCount: managedRows.filter((row) => row.starterContentSha256 && !row.reasonCodes?.includes("canonical_card_body_missing")).length,
      journaledCount: managedRows.filter((row) => row.journalPresent).length,
      appliedTagSafety: {
        ok: orphanAppliedTagIds.length === 0 && ambiguousAppliedTags.length === 0 && semanticRows.every((row) => row.exact),
        appliedTagIds,
        orphanAppliedTagIds,
        ambiguousAppliedTags,
        maxAppliedTags,
        overAppliedTagRows,
        semanticRows,
      },
      lifecycle: {
        status: lifecycleRows.some((row) => !row.ok) ? "drifted" : "matches_or_not_applicable",
        rows: lifecycleRows,
      },
    });
  }
  const exactReadbackRows = (consistency?.rows || []).map((row) => ({
    boardId: row.boardId,
    threadId: row.threadId,
    cardId: row.cardId,
    superseded: row.superseded === true,
    retainedLegacyHistory: row.retainedLegacyHistory === true,
    legacyClassification: row.legacyClassification || null,
    semanticStatus: row.semanticStatus || null,
    type: row.type || null,
    state: row.state || null,
    priority: row.priority || null,
    archived: row.archived === true,
    locked: row.locked === true,
    starterContentSha256: row.starterContentSha256 || null,
    journalIntegrityEntries: row.journalIntegrityEntries || [],
    reasonCodes: row.reasonCodes || [],
  }));
  return {
    status: consistency?.status || "blocked",
    coverageStatus: consistency?.coverageStatus || "not_evaluated",
    registeredBoardCount: consistency?.registeredBoardCount || 0,
    enabledBoardCount: consistency?.enabledBoardCount || 0,
    uncoveredBoardCount: consistency?.uncoveredBoardCount || 0,
    currentCardCount: consistency?.cardCount || 0,
    totalThreadCount: consistency?.totalThreadCount || 0,
    retainedLegacyHistoryCount: consistency?.retainedLegacyHistoryCount || 0,
    healthyCardCount: consistency?.healthyCardCount || 0,
    driftedCardCount: consistency?.driftedCardCount || 0,
    supersededRecordCount: consistency?.supersededRecordCount || 0,
    duplicateStableIdentityCount: Array.isArray(consistency?.duplicates) ? consistency.duplicates.length : 0,
    actionableTextIntegrityFindingCount: consistency?.actionableTextIntegrityFindingCount || 0,
    immutableSystemHistoryFindingCount: consistency?.immutableSystemHistoryFindingCount || 0,
    driftCounts: consistency?.driftCounts || {},
    boardProfiles,
    exactReadbackRows,
    reasonCodes: unique(reasonCodes),
  };
}

function isBlockingReason(code) {
  return /^(board_registry_|board_channel_(?:unresolved|ambiguous):|forum_profile_|permission_role_|guild_channels_read_failed$|guild_roles_read_failed$|discord_bot_token_missing$|forum_channel_missing$|stale_forum_identity:|uncovered_live_board:|live_card_readback_incomplete$)/.test(code);
}

async function buildLiveForumProfileScan({
  boardRegistry,
  profileRegistry,
  env = process.env,
  fetchImpl = fetch,
  consistencyImpl,
  channels: suppliedChannels,
  guildRoles: suppliedRoles,
  consistency: suppliedConsistency,
  now = () => new Date(),
} = {}) {
  const validation = validateProfileRegistry(profileRegistry, boardRegistry);
  if (!validation.ok) {
    const requiredBoardCount = (boardRegistry?.boards || []).filter((board) => board?.required === true && board?.status === "enabled").length;
    return {
      receipt: {
        schemaVersion: SCAN_SCHEMA_VERSION,
        generatedAt: now().toISOString(),
        ok: false,
        status: "blocked",
        readOnly: true,
        mutatesDiscord: false,
        sendsMessages: false,
        redactions: { botToken: "omitted", liveRoleIds: "omitted" },
        denominator: {
          requiredBoardCount,
          enabledBoardCount: requiredBoardCount,
          inspectedBoardCount: 0,
          uncoveredBoardCount: 0,
          coverageStatus: "blocked",
          uncoveredBoards: [],
        },
        profileValidation: validation,
        relativeOrder: {
          normalization: "not_applicable_preserve_declared_relative_order",
          matches: false,
          expectedBoardIds: [],
          observedBoardIds: [],
        },
        forums: [],
        cards: {
          status: "blocked",
          coverageStatus: "not_evaluated",
          registeredBoardCount: 0,
          enabledBoardCount: 0,
          uncoveredBoardCount: 0,
          currentCardCount: 0,
          healthyCardCount: 0,
          driftedCardCount: 0,
          supersededRecordCount: 0,
          duplicateStableIdentityCount: 0,
          actionableTextIntegrityFindingCount: 0,
          immutableSystemHistoryFindingCount: 0,
          driftCounts: {},
          boardProfiles: [],
          exactReadbackRows: [],
          reasonCodes: [],
        },
        markerCandidate: profileRegistry?.markerCandidate || null,
        deferredDecisions: profileRegistry?.deferredDecisions || null,
        reasonCodes: validation.reasonCodes,
      },
      context: { channels: [], guildRoles: [], consistency: null, roleResolutionByProfile: new Map(), expectedOrder: [] },
    };
  }
  const token = text(env?.DISCORDOS_BOT_TOKEN);
  const reasonCodes = [...validation.reasonCodes];
  if (!token && !suppliedChannels) reasonCodes.push("discord_bot_token_missing");
  let channels = suppliedChannels || null;
  let guildRoles = suppliedRoles || null;
  let consistency = suppliedConsistency || null;

  if (reasonCodes.length === 0 && !channels) {
    const channelsRead = await cardContract.discordRequest({
      path: `/guilds/${boardRegistry.guildId}/channels`, token, fetchImpl,
    });
    if (!channelsRead.ok || !Array.isArray(channelsRead.payload)) reasonCodes.push("guild_channels_read_failed");
    else channels = channelsRead.payload;
  }
  if (reasonCodes.length === 0 && !guildRoles) {
    const rolesRead = await cardContract.discordRequest({
      path: `/guilds/${boardRegistry.guildId}/roles`, token, fetchImpl,
    });
    if (!rolesRead.ok || !Array.isArray(rolesRead.payload)) reasonCodes.push("guild_roles_read_failed");
    else guildRoles = rolesRead.payload;
  }
  if (reasonCodes.length === 0 && !consistency) {
    const buildConsistency = consistencyImpl || require("./discordos-board-card-consistency")._internals.buildBoardCardConsistency;
    consistency = await buildConsistency({ registry: boardRegistry, env, fetchImpl });
  }
  channels ||= [];
  guildRoles ||= [];
  consistency ||= { status: "blocked", coverageStatus: "not_evaluated", rows: [], reasonCodes: ["live_card_readback_incomplete"] };
  if (consistency.status === "blocked" || consistency.coverageStatus !== "complete") reasonCodes.push("live_card_readback_incomplete");

  const identityResolution = boardRegistryContract.resolveBoardChannelIdentities({ boardRegistry, registry: boardRegistry, channels });
  reasonCodes.push(...identityResolution.reasonCodes);
  const resolvedBoardRegistry = identityResolution.registry;
  const enabledBoards = (resolvedBoardRegistry?.boards || []).filter((board) => board.required === true && board.status === "enabled");
  const roleResolutionByProfile = new Map();
  for (const permissionProfileId of unique(enabledBoards.map((board) => board.permissionProfile))) {
    const resolution = resolvePermissionRoles({
      guildId: boardRegistry.guildId,
      guildRoles,
      permissionProfile: profileRegistry.permissionProfiles[permissionProfileId],
    });
    roleResolutionByProfile.set(permissionProfileId, resolution);
    reasonCodes.push(...resolution.reasonCodes);
  }

  const channelById = new Map(channels.map((channel) => [text(channel?.id), channel]));
  const forums = enabledBoards.map((board) => inspectForumChannel({
    expected: expectedBoardProfile(board, profileRegistry),
    channel: channelById.get(board.forumChannelId),
    roleResolution: roleResolutionByProfile.get(board.permissionProfile) || { resolved: [], reasonCodes: ["permission_profile_resolution_missing"] },
  }));
  reasonCodes.push(...forums.flatMap((forum) => forum.reasonCodes));

  const categoryId = profileRegistry.category.channelId;
  const excludedIds = new Set((boardRegistry.discovery.excludedForumChannelIds || []).map((entry) => entry.channelId));
  const registeredIds = new Set(enabledBoards.map((board) => board.forumChannelId));
  const uncovered = channels.filter((channel) => channel?.type === FORUM_CHANNEL_TYPE
    && channel?.parent_id === categoryId
    && !excludedIds.has(channel.id)
    && !registeredIds.has(channel.id))
    .map((channel) => ({ channelId: channel.id, channelName: channel.name || null }));
  reasonCodes.push(...uncovered.map((channel) => `uncovered_live_board:${channel.channelId}`));

  const observedOrder = forums.filter((forum) => forum.structure?.observedPosition != null)
    .sort((left, right) => left.structure.observedPosition - right.structure.observedPosition)
    .map((forum) => forum.boardId);
  const expectedOrder = [...enabledBoards].sort((left, right) =>
    profileRegistry.boards[left.id].order - profileRegistry.boards[right.id].order
  ).map((board) => board.id);
  const relativeOrderMatches = observedOrder.length === expectedOrder.length
    && observedOrder.every((boardId, index) => boardId === expectedOrder[index]);
  if (!relativeOrderMatches) reasonCodes.push("forum_relative_order_mismatch");

  const cards = buildCardProfileSummary({
    consistency,
    forums,
    maxAppliedTags: profileRegistry.tagTaxonomy.maxAppliedTags,
  });
  reasonCodes.push(...cards.reasonCodes);
  if (consistency.status === "drift_detected") reasonCodes.push("card_contract_drift_detected");
  const uniqueReasonCodes = unique(reasonCodes).sort();
  const blocked = uniqueReasonCodes.some(isBlockingReason);
  const status = blocked ? "blocked" : uniqueReasonCodes.length > 0 ? "drift_detected" : "consistent";
  const receipt = {
    schemaVersion: SCAN_SCHEMA_VERSION,
    generatedAt: now().toISOString(),
    ok: status === "consistent",
    status,
    readOnly: true,
    mutatesDiscord: false,
    sendsMessages: false,
    redactions: { botToken: "omitted", liveRoleIds: "omitted" },
    denominator: {
      requiredBoardCount: enabledBoards.length,
      enabledBoardCount: enabledBoards.length,
      inspectedBoardCount: forums.length,
      uncoveredBoardCount: uncovered.length,
      coverageStatus: uncovered.length === 0 && forums.length === enabledBoards.length ? "complete" : "blocked",
      uncoveredBoards: uncovered,
    },
    profileValidation: validation,
    relativeOrder: {
      normalization: "not_applicable_preserve_declared_relative_order",
      matches: relativeOrderMatches,
      expectedBoardIds: expectedOrder,
      observedBoardIds: observedOrder,
    },
    forums,
    cards,
    markerCandidate: profileRegistry.markerCandidate,
    deferredDecisions: profileRegistry.deferredDecisions,
    reasonCodes: uniqueReasonCodes,
  };
  return {
    receipt,
      context: { channels, guildRoles, consistency, roleResolutionByProfile, expectedOrder, resolvedBoardRegistry, identityResolution: identityResolution.rows },
  };
}

async function readJson(filePath) {
  return textIntegrity.readUtf8Json(filePath);
}

module.exports = {
  PROFILE_SCHEMA_VERSION,
  SCAN_SCHEMA_VERSION,
  FORUM_CHANNEL_TYPE,
  PERMISSION_BITS,
  CANONICAL_TAGS,
  _internals: {
    CANONICAL_TAGS,
    text,
    unique,
    normalizedDecimal,
    permissionMask,
    permissionNames,
    validateProfileRegistry,
    expectedTags,
    expectedBoardProfile,
    resolvePermissionRoles,
    inspectPermissionOverwrites,
    normalizeActualTag,
    inspectTags,
    inspectDefaults,
    inspectForumChannel,
    lifecycleInspection,
    canonicalAppliedTagNames,
    buildCardProfileSummary,
    isBlockingReason,
    buildLiveForumProfileScan,
    readJson,
    boardRegistryContract,
  },
};
