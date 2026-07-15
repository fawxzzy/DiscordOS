const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_VERSION = "discordos.board-registry.v1";
const ALLOWED_ROLES = new Set(["active", "completed", "legacy"]);
const ALLOWED_STATUSES = new Set(["enabled", "blocked"]);
const ALLOWED_CARD_STATES = new Set([
  "intake",
  "planning",
  "ready",
  "opened",
  "in_progress",
  "review",
  "blocked",
  "completed",
  "archived",
  "closed",
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values.map(text).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

function boardSummary(board) {
  return {
    id: text(board?.id),
    project: text(board?.project),
    required: board?.required === true,
    forumChannelId: text(board?.forumChannelId) || null,
    forumChannelName: text(board?.forumChannelName) || null,
    channelIdentityResolution: text(board?.channelIdentityResolution) || "exact_id",
    role: text(board?.role).toLowerCase(),
    forumProfile: text(board?.forumProfile),
    permissionProfile: text(board?.permissionProfile),
    sourceAdapter: text(board?.sourceAdapter),
    stableCardNamespace: text(board?.stableCardNamespace),
    lifecycleNormalizationPolicy: text(board?.lifecycleNormalizationPolicy),
    reactionPolicy: text(board?.reactionPolicy),
    journalPolicy: text(board?.journalPolicy),
    completionDestination: text(board?.completionDestination) || null,
    encodingPolicy: text(board?.encodingPolicy),
    status: text(board?.status).toLowerCase(),
    blockerCodes: Array.isArray(board?.blockers)
      ? board.blockers.map((blocker) => text(blocker?.code)).filter(Boolean)
      : [],
  };
}

function resolveBoardChannelIdentities({ registry, channels }) {
  const resolvedRegistry = structuredClone(registry);
  const categoryId = text(registry?.discovery?.forumCategoryChannelId);
  const rows = [];
  const reasonCodes = [];
  for (const board of resolvedRegistry.boards || []) {
    const mode = text(board?.channelIdentityResolution) || "exact_id";
    if (text(board?.forumChannelId)) {
      rows.push({ boardId: text(board.id), mode: "exact_id", forumChannelId: text(board.forumChannelId), resolved: true });
      continue;
    }
    if (mode !== "exact_name_under_category") {
      reasonCodes.push(`board_channel_identity_resolution_invalid:${text(board?.id) || "missing"}`);
      continue;
    }
    const name = text(board?.forumChannelName).toLowerCase();
    const matches = (channels || []).filter((channel) => channel?.type === 15
      && text(channel?.parent_id) === categoryId
      && text(channel?.name).toLowerCase() === name);
    if (matches.length !== 1) {
      reasonCodes.push(`${matches.length === 0 ? "board_channel_unresolved" : "board_channel_ambiguous"}:${text(board.id)}`);
      rows.push({ boardId: text(board.id), mode, forumChannelId: null, resolved: false, matchCount: matches.length });
      continue;
    }
    board.forumChannelId = text(matches[0].id);
    rows.push({ boardId: text(board.id), mode, forumChannelId: text(matches[0].id), resolved: true, matchCount: 1 });
  }
  return { ok: reasonCodes.length === 0, registry: resolvedRegistry, rows, reasonCodes };
}

function validateBoardRegistry(registry, { repoRoot = path.resolve(__dirname, ".."), fileExists = fs.existsSync } = {}) {
  const reasonCodes = [];
  const boards = Array.isArray(registry?.boards) ? registry.boards : [];
  const adapters = registry?.sourceAdapters && typeof registry.sourceAdapters === "object"
    ? registry.sourceAdapters
    : {};
  const lifecyclePolicies = registry?.lifecycleNormalizationPolicies && typeof registry.lifecycleNormalizationPolicies === "object"
    ? registry.lifecycleNormalizationPolicies
    : {};
  const reactionPolicies = registry?.reactionPolicies && typeof registry.reactionPolicies === "object"
    ? registry.reactionPolicies
    : {};
  const journalPolicies = registry?.journalPolicies && typeof registry.journalPolicies === "object"
    ? registry.journalPolicies
    : {};
  const encodingPolicies = registry?.encodingPolicies && typeof registry.encodingPolicies === "object"
    ? registry.encodingPolicies
    : {};

  if (registry?.schemaVersion !== SCHEMA_VERSION) reasonCodes.push("board_registry_schema_version_invalid");
  if (!text(registry?.guildId)) reasonCodes.push("board_registry_guild_id_missing");
  if (!text(registry?.discovery?.forumCategoryChannelId)) reasonCodes.push("board_registry_forum_category_missing");
  const forumProfileRegistry = text(registry?.forumProfileRegistry);
  if (!forumProfileRegistry) reasonCodes.push("board_registry_forum_profile_registry_missing");
  else if (!fileExists(path.resolve(repoRoot, forumProfileRegistry))) {
    reasonCodes.push("board_registry_forum_profile_registry_not_found");
  }
  if (boards.length === 0) reasonCodes.push("board_registry_empty");

  for (const [policyId, policy] of Object.entries(lifecyclePolicies)) {
    if (!Array.isArray(policy?.allowedStates) || policy.allowedStates.length === 0) {
      reasonCodes.push(`lifecycle_policy_states_missing:${policyId}`);
      continue;
    }
    for (const state of policy.allowedStates) {
      if (!ALLOWED_CARD_STATES.has(text(state).toLowerCase())) {
        reasonCodes.push(`lifecycle_policy_state_invalid:${policyId}:${text(state) || "missing"}`);
      }
    }
  }

  for (const [adapterId, adapter] of Object.entries(adapters)) {
    const configPath = text(adapter?.configPath);
    if (configPath && !fileExists(path.resolve(repoRoot, configPath))) {
      reasonCodes.push(`source_adapter_config_missing:${adapterId}`);
    }
  }

  for (const duplicate of duplicateValues(boards.map((board) => board?.id))) {
    reasonCodes.push(`duplicate_board_id:${duplicate}`);
  }
  for (const duplicate of duplicateValues(boards.map((board) => board?.forumChannelId))) {
    reasonCodes.push(`duplicate_board_channel_id:${duplicate}`);
  }
  for (const duplicate of duplicateValues(boards.map((board) => board?.stableCardNamespace))) {
    reasonCodes.push(`duplicate_stable_card_namespace:${duplicate}`);
  }

  const boardById = new Map(boards.map((board) => [text(board?.id).toLowerCase(), board]));
  for (const board of boards) {
    const id = text(board?.id) || "missing";
    const role = text(board?.role).toLowerCase();
    const status = text(board?.status).toLowerCase();
    const requiredFields = [
      "id",
      "project",
      "ownershipScope",
      "forumProfile",
      "permissionProfile",
      "sourceAdapter",
      "stableCardNamespace",
      "lifecycleNormalizationPolicy",
      "reactionPolicy",
      "journalPolicy",
      "encodingPolicy",
    ];
    for (const field of requiredFields) {
      if (!text(board?.[field])) reasonCodes.push(`board_field_missing:${id}:${field}`);
    }
    if (board?.required !== true && board?.required !== false) reasonCodes.push(`board_required_invalid:${id}`);
    if (!ALLOWED_ROLES.has(role)) reasonCodes.push(`board_role_invalid:${id}`);
    if (!ALLOWED_STATUSES.has(status)) reasonCodes.push(`board_status_invalid:${id}`);
    if (!Object.hasOwn(adapters, text(board?.sourceAdapter))) reasonCodes.push(`board_source_adapter_missing:${id}`);
    if (!Object.hasOwn(lifecyclePolicies, text(board?.lifecycleNormalizationPolicy))) {
      reasonCodes.push(`board_lifecycle_policy_missing:${id}`);
    }
    if (!Object.hasOwn(reactionPolicies, text(board?.reactionPolicy))) reasonCodes.push(`board_reaction_policy_missing:${id}`);
    if (!Object.hasOwn(journalPolicies, text(board?.journalPolicy))) reasonCodes.push(`board_journal_policy_missing:${id}`);
    if (!Object.hasOwn(encodingPolicies, text(board?.encodingPolicy))) reasonCodes.push(`board_encoding_policy_missing:${id}`);

    if (status === "enabled") {
      if (!text(board?.forumChannelId) && text(board?.channelIdentityResolution) !== "exact_name_under_category") {
        reasonCodes.push(`enabled_board_channel_missing:${id}`);
      }
      if (!text(board?.forumChannelName)) reasonCodes.push(`enabled_board_channel_name_missing:${id}`);
      if (text(board?.sourceAdapter) === "unadmitted-v1") reasonCodes.push(`enabled_board_adapter_unadmitted:${id}`);
      if (Array.isArray(board?.blockers) && board.blockers.length > 0) reasonCodes.push(`enabled_board_has_blockers:${id}`);
    }
    if (status === "blocked") {
      if (!Array.isArray(board?.blockers) || board.blockers.length === 0) {
        reasonCodes.push(`blocked_board_reason_missing:${id}`);
      } else {
        for (const blocker of board.blockers) {
          if (!text(blocker?.code) || !text(blocker?.reason) || !text(blocker?.evidence)) {
            reasonCodes.push(`blocked_board_evidence_incomplete:${id}`);
          }
        }
      }
    }

    const destinationId = text(board?.completionDestination).toLowerCase();
    if (role === "completed") {
      if (destinationId) reasonCodes.push(`completed_board_destination_invalid:${id}`);
    } else if (!destinationId) {
      reasonCodes.push(`board_completion_destination_missing:${id}`);
    } else {
      const destination = boardById.get(destinationId);
      if (!destination) reasonCodes.push(`board_completion_destination_unknown:${id}`);
      else if (text(destination.role).toLowerCase() !== "completed") reasonCodes.push(`board_completion_destination_role_invalid:${id}`);
    }

    const relationships = board?.relationships || {};
    for (const relationshipId of [...(relationships.replaces || []), ...(relationships.replacedBy || [])]) {
      if (!boardById.has(text(relationshipId).toLowerCase())) reasonCodes.push(`board_relationship_target_unknown:${id}`);
    }
  }

  const activeOwnership = new Map();
  for (const board of boards.filter((candidate) =>
    text(candidate?.status).toLowerCase() === "enabled"
    && new Set(["active", "legacy"]).has(text(candidate?.role).toLowerCase())
  )) {
    const scope = text(board?.ownershipScope).toLowerCase();
    if (!scope) continue;
    const owner = activeOwnership.get(scope);
    if (owner) reasonCodes.push(`overlapping_board_ownership:${scope}:${text(owner.id)}:${text(board.id)}`);
    else activeOwnership.set(scope, board);
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  return {
    ok: uniqueReasonCodes.length === 0,
    status: uniqueReasonCodes.length === 0 ? "valid" : "invalid",
    boardCount: boards.length,
    requiredBoardCount: boards.filter((board) => board?.required === true).length,
    enabledBoardCount: boards.filter((board) => text(board?.status).toLowerCase() === "enabled").length,
    blockedBoardCount: boards.filter((board) => text(board?.status).toLowerCase() === "blocked").length,
    boards: boards.map(boardSummary),
    reasonCodes: uniqueReasonCodes,
  };
}

module.exports = {
  SCHEMA_VERSION,
  _internals: {
    ALLOWED_ROLES,
    ALLOWED_STATUSES,
    ALLOWED_CARD_STATES,
    text,
    duplicateValues,
    boardSummary,
    resolveBoardChannelIdentities,
    validateBoardRegistry,
  },
};
