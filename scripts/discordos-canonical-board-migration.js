const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { _internals: cardContract } = require("./discordos-board-card-contract");
const { _internals: consistency } = require("./discordos-board-card-consistency");
const { _internals: forumProfile } = require("./discordos-forum-profile");
const { _internals: journal } = require("./discordos-board-card-journal");
const { _internals: normalize } = require("./discordos-forum-profile-normalize");
const { _internals: ownerSeed } = require("./discordos-project-board-owner-seed");
const { _internals: provision } = require("./discordos-project-board-forum-provision");
const { _internals: textIntegrity } = require("./discordos-board-text-integrity");

const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, "..", "config", "discordos-board-registry.json");
const DEFAULT_PROFILE_PATH = path.resolve(__dirname, "..", "config", "discordos-forum-profile-registry.json");
const DEFAULT_SOCIALS_EXPORT_PATH = path.resolve(__dirname, "..", "..", "socials-os", "exports", "atlas.project-board.owner-export.v1.json");
const DEFAULT_RUNTIME_ROOT = path.resolve(__dirname, "..", "..", "..", "runtime");
const MIGRATION_ENV = "DISCORDOS_CANONICAL_BOARD_MIGRATION";
const MIGRATION_ENV_VALUE = "enabled";
const RECOVERY_ENV = "DISCORDOS_CANONICAL_BOARD_RECOVERY";
const RECOVERY_ENV_VALUE = "enabled";
const RECEIPT_SCHEMA_VERSION = "discordos.canonical-board-migration.v1";
const SNAPSHOT_SCHEMA_VERSION = "discordos.canonical-board-migration-snapshot.v1";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readValue(args, index, code) {
  const value = args[index + 1];
  if (!text(value)) throw new Error(code);
  return text(value);
}

function parseArgs(args) {
  const options = {
    registryPath: DEFAULT_REGISTRY_PATH,
    profilePath: DEFAULT_PROFILE_PATH,
    socialsExportPath: DEFAULT_SOCIALS_EXPORT_PATH,
    snapshotPath: null,
    outputPath: null,
    allowMigration: false,
    recoverResidual: false,
    allowRecovery: false,
    apply: false,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--registry") options.registryPath = path.resolve(readValue(args, index++, "missing_registry_path"));
    else if (arg === "--profiles") options.profilePath = path.resolve(readValue(args, index++, "missing_profile_path"));
    else if (arg === "--socials-owner-export") options.socialsExportPath = path.resolve(readValue(args, index++, "missing_socials_export_path"));
    else if (arg === "--snapshot-output") options.snapshotPath = path.resolve(readValue(args, index++, "missing_snapshot_path"));
    else if (arg === "--output") options.outputPath = path.resolve(readValue(args, index++, "missing_output_path"));
    else if (arg === "--allow-migration") options.allowMigration = true;
    else if (arg === "--recover-residual") options.recoverResidual = true;
    else if (arg === "--allow-recovery") options.allowRecovery = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--json") options.json = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (!options.snapshotPath) throw new Error("snapshot_output_path_missing");
  if (!options.outputPath) throw new Error("output_path_missing");
  assertRuntimePath(options.snapshotPath);
  assertRuntimePath(options.outputPath);
  return options;
}

function assertRuntimePath(filePath) {
  const relative = path.relative(DEFAULT_RUNTIME_ROOT, path.resolve(filePath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("migration_artifact_must_be_under_atlas_runtime");
  }
}

function resolveAdmission({ apply, allowMigration, env }) {
  if (!apply) return { requested: false, admitted: false, status: "dry_run", reasonCodes: [] };
  if (allowMigration && env?.[MIGRATION_ENV] === MIGRATION_ENV_VALUE) {
    return { requested: true, admitted: true, status: "canonical_migration_admitted", reasonCodes: [] };
  }
  return { requested: true, admitted: false, status: "blocked", reasonCodes: ["canonical_board_migration_double_guard_missing"] };
}

function resolveRecoveryAdmission({ apply, allowRecovery, env }) {
  if (!apply) return { requested: false, admitted: false, status: "dry_run", reasonCodes: [] };
  if (allowRecovery && env?.[RECOVERY_ENV] === RECOVERY_ENV_VALUE) {
    return { requested: true, admitted: true, status: "residual_recovery_admitted", reasonCodes: [] };
  }
  return { requested: true, admitted: false, status: "blocked", reasonCodes: ["canonical_board_recovery_double_guard_missing"] };
}

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function stateTagName(value) {
  return new Map([
    ["intake", "Intake"], ["planning", "Planning"], ["ready", "Ready"], ["opened", "Opened"],
    ["in-progress", "In Progress"], ["in_progress", "In Progress"], ["review", "Review"],
    ["blocked", "Blocked"], ["completed", "Completed"],
  ]).get(text(value).toLowerCase()) || null;
}

function priorityTagName(value) {
  return new Map([["low", "Low"], ["medium", "Medium"], ["high", "High"], ["blocker", "Blocker"]])
    .get(text(value).toLowerCase()) || null;
}

function typeTagName(value) {
  return text(value).toLowerCase() === "bug" ? "Bug" : text(value) ? "Feature" : null;
}

function ownerRecords(ownerExports = []) {
  const records = new Map();
  for (const ownerExport of ownerExports) {
    for (const card of ownerExport?.cards || []) {
      const cardId = text(card?.record?.card_id).toLowerCase();
      if (cardId) records.set(cardId, card);
    }
  }
  return records;
}

function deriveThreadSemantics({ board, thread, starter, ownerRecord = null }) {
  const content = String(starter?.content || "");
  const managed = cardContract.parseCanonicalCardBody(content);
  const disposition = consistency.legacyDisposition(board.id, thread.id, Boolean(managed));
  if (disposition?.classification?.startsWith("retained_")) {
    return {
      ok: true,
      classification: disposition.classification,
      semanticStatus: "semantic_unknown_preserved",
      cardId: null,
      desiredTagNames: [],
      desiredTitle: thread.name,
      managed: false,
      reasonCodes: [],
    };
  }
  const superseded = /ATLAS-SUPERSEDED-CARD:/i.test(content);
  const cardId = text(ownerRecord?.record?.card_id || managed?.id || disposition?.cardId);
  if (!cardId && !superseded) {
    return { ok: false, classification: "unmanaged_unknown", cardId: null, desiredTagNames: [], desiredTitle: thread.name, managed: false, reasonCodes: ["unmanaged_card_semantics_unknown"] };
  }
  const source = ownerRecord?.record || managed || {};
  const desiredTagNames = superseded ? ["Superseded"] : unique([
    typeTagName(source.card_type || source.type || (disposition ? "feature" : null)),
    stateTagName(source.lifecycle || source.state || (disposition ? "blocked" : null)),
    priorityTagName(source.priority || (disposition ? "high" : null)),
    ownerRecord?.relationships?.duplicate_of ? "Duplicate" : null,
  ]);
  const rawTitle = text(ownerRecord?.record?.title) || thread.name;
  const desiredTitle = cardContract.formatCanonicalCardTitle({ board, card: { title: rawTitle } });
  return {
    ok: desiredTagNames.length > 0,
    classification: disposition?.classification || (superseded ? "superseded_record" : "active_managed"),
    semanticStatus: "derived_from_managed_fields_or_owner_export",
    cardId: cardId || null,
    desiredTagNames,
    desiredTitle,
    managed: true,
    reasonCodes: desiredTagNames.length > 5 ? ["applied_tag_limit_exceeded"] : [],
  };
}

function canonicalAvailableTags({ channel, expectedTags, boardId }) {
  const byName = new Map();
  for (const tag of channel?.available_tags || []) {
    const values = byName.get(tag.name) || [];
    values.push(tag);
    byName.set(tag.name, values);
  }
  const reasonCodes = [];
  const availableTags = expectedTags.map((expected) => {
    const matches = byName.get(expected.name) || [];
    if (matches.length > 1) reasonCodes.push(`forum_tag_name_ambiguous:${boardId}:${expected.name}`);
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

function canonicalTagIds(channel) {
  const reasonCodes = [];
  const rows = forumProfile.CANONICAL_TAGS.map(([, , name], index) => {
    const matches = (channel?.available_tags || []).filter((tag) => tag?.name === name);
    if (matches.length !== 1 || !text(matches[0]?.id)) reasonCodes.push(`canonical_tag_id_resolution_failed:${index}:${name}`);
    return { index, name, id: matches.length === 1 ? text(matches[0].id) : null };
  });
  return { ok: reasonCodes.length === 0, rows, byName: new Map(rows.map((row) => [row.name, row.id])), reasonCodes };
}

function forumPatchPayload({ board, channel, profileRegistry, guildRoles, guildId }) {
  const expected = forumProfile.expectedBoardProfile(board, profileRegistry);
  const tags = canonicalAvailableTags({ channel, expectedTags: expected.tags, boardId: board.id });
  const roleResolution = forumProfile.resolvePermissionRoles({
    guildId,
    guildRoles,
    permissionProfile: profileRegistry.permissionProfiles[board.permissionProfile],
  });
  const permissions = normalize.permissionOverwritePayload(roleResolution);
  const defaults = profileRegistry.forumProfiles[board.forumProfile].defaults;
  return {
    payload: {
      name: expected.structure.name,
      topic: expected.structure.topic,
      available_tags: tags.availableTags,
      permission_overwrites: permissions.permissionOverwrites,
      default_reaction_emoji: defaults.defaultReactionEmoji,
      default_sort_order: defaults.defaultSortOrder,
      default_forum_layout: defaults.defaultForumLayout,
      rate_limit_per_user: defaults.rateLimitPerUser,
      flags: defaults.flags,
      nsfw: defaults.nsfw,
    },
    expected,
    reasonCodes: [...tags.reasonCodes, ...permissions.reasonCodes],
  };
}

async function captureSnapshot({ registry, env = process.env, fetchImpl = fetch, now = () => new Date() }) {
  const token = text(env?.DISCORDOS_BOT_TOKEN);
  const reasonCodes = [];
  if (!token) reasonCodes.push("discord_bot_token_missing");
  const channelsRead = token ? await cardContract.discordRequest({ path: `/guilds/${registry.guildId}/channels`, token, fetchImpl }) : { ok: false };
  const rolesRead = token ? await cardContract.discordRequest({ path: `/guilds/${registry.guildId}/roles`, token, fetchImpl }) : { ok: false };
  if (!channelsRead.ok || !Array.isArray(channelsRead.payload)) reasonCodes.push("guild_channels_read_failed");
  if (!rolesRead.ok || !Array.isArray(rolesRead.payload)) reasonCodes.push("guild_roles_read_failed");
  const channels = Array.isArray(channelsRead.payload) ? channelsRead.payload : [];
  const guildRoles = Array.isArray(rolesRead.payload) ? rolesRead.payload : [];
  const resolution = forumProfile.boardRegistryContract.resolveBoardChannelIdentities({ registry, channels });
  const permittedPending = new Set(["board_channel_unresolved:socials-os-active-admission"]);
  reasonCodes.push(...resolution.reasonCodes.filter((code) => !permittedPending.has(code)));
  const forums = [];
  for (const board of (resolution.registry.boards || []).filter((candidate) => candidate.status === "enabled" && candidate.forumChannelId)) {
    const forumRead = await cardContract.discordRequest({ path: `/channels/${board.forumChannelId}`, token, fetchImpl });
    if (!forumRead.ok || !forumRead.payload) {
      reasonCodes.push(`forum_snapshot_read_failed:${board.id}`);
      continue;
    }
    const inventory = await journal.listForumThreads({ forumChannelId: board.forumChannelId, guildId: registry.guildId, token, fetchImpl });
    reasonCodes.push(...inventory.reasonCodes.map((code) => `${code}:${board.id}`));
    const threads = [];
    for (const summary of inventory.threads) {
      const [threadRead, starterRead, messagesRead] = await Promise.all([
        cardContract.discordRequest({ path: `/channels/${summary.id}`, token, fetchImpl }),
        cardContract.fetchMessage({ channelId: summary.id, messageId: summary.id, token, fetchImpl }),
        journal.readThreadMessages({ threadId: summary.id, token, fetchImpl }),
      ]);
      if (!threadRead.ok) reasonCodes.push(`thread_snapshot_read_failed:${summary.id}`);
      if (!starterRead.ok) reasonCodes.push(`starter_snapshot_read_failed:${summary.id}`);
      if (!messagesRead.ok) reasonCodes.push(`${messagesRead.truncated ? "message_snapshot_truncated" : "message_snapshot_read_failed"}:${summary.id}`);
      threads.push({
        thread: threadRead.payload || summary,
        starter: starterRead.payload || null,
        messages: messagesRead.payload || [],
        messagePageCount: messagesRead.pageCount,
        messageHistoryTruncated: messagesRead.truncated,
      });
    }
    forums.push({ boardId: board.id, forum: forumRead.payload, archivedPageCount: inventory.archivedPageCount, threadHistoryTruncated: inventory.truncated, threads });
  }
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: now().toISOString(),
    readOnly: true,
    mutatesDiscord: false,
    exactPreimage: true,
    registry: resolution.registry,
    identityResolution: resolution.rows,
    pendingBoards: resolution.rows.filter((row) => !row.resolved),
    guildRoles,
    forums,
    reasonCodes: unique(reasonCodes).sort(),
  };
  snapshot.sha256 = sha256(snapshot);
  return snapshot;
}

function buildMigrationPlan({ snapshot, profileRegistry, ownerExports = [], enforceLegacyCohorts = true }) {
  const reasonCodes = [...(snapshot.reasonCodes || [])];
  const records = ownerRecords(ownerExports);
  const forumActions = [];
  const threadActions = [];
  for (const forumSnapshot of snapshot.forums || []) {
    const board = snapshot.registry.boards.find((candidate) => candidate.id === forumSnapshot.boardId);
    const patch = forumPatchPayload({
      board,
      channel: forumSnapshot.forum,
      profileRegistry,
      guildRoles: snapshot.guildRoles,
      guildId: snapshot.registry.guildId,
    });
    reasonCodes.push(...patch.reasonCodes);
    forumActions.push({ boardId: board.id, forumChannelId: board.forumChannelId, payload: patch.payload, expected: patch.expected });
    const existingIds = canonicalTagIds({ available_tags: patch.payload.available_tags });
    for (const row of forumSnapshot.threads) {
      const liveCardId = text(cardContract.parseCanonicalCardBody(row.starter?.content)?.id).toLowerCase();
      const semantics = deriveThreadSemantics({ board, thread: row.thread, starter: row.starter, ownerRecord: records.get(liveCardId) || null });
      reasonCodes.push(...semantics.reasonCodes.map((code) => `${code}:${row.thread.id}`));
      const safeAppliedTagIds = semantics.desiredTagNames.map((name) => existingIds.byName.get(name)).filter(Boolean);
      threadActions.push({
        boardId: board.id,
        forumChannelId: board.forumChannelId,
        threadId: row.thread.id,
        originalTitle: row.thread.name,
        originalAppliedTagIds: Array.isArray(row.thread.applied_tags) ? [...row.thread.applied_tags] : [],
        originalArchived: row.thread.thread_metadata?.archived === true,
        originalLocked: row.thread.thread_metadata?.locked === true,
        ...(row.thread.id === consistency.MUSIC_SESH_PHASE_8_THREAD_ID ? { desiredArchived: false, desiredLocked: false } : {}),
        ...semantics,
        safeAppliedTagIds,
      });
    }
  }
  const retainedMusic = threadActions.filter((row) => row.classification === "retained_legacy_history").length;
  const retainedShared = threadActions.filter((row) => row.classification === "retained_unresolved_legacy").length;
  const phase8 = threadActions.filter((row) =>
    row.threadId === consistency.MUSIC_SESH_PHASE_8_THREAD_ID
    && row.cardId === consistency.MUSIC_SESH_PHASE_8_CARD_ID
    && row.managed
  ).length;
  if (enforceLegacyCohorts && snapshot.forums.some((row) => row.boardId === "music-sesh-active")) {
    if (retainedMusic !== 150) reasonCodes.push("music_sesh_retained_legacy_count_mismatch");
    if (phase8 !== 1) reasonCodes.push("music_sesh_phase_8_count_mismatch");
  }
  if (enforceLegacyCohorts && snapshot.forums.some((row) => row.boardId === "legacy-general-feedback") && retainedShared !== 1) {
    reasonCodes.push("shared_intake_retained_legacy_count_mismatch");
  }
  const uniqueReasonCodes = unique(reasonCodes).sort();
  return {
    ok: uniqueReasonCodes.length === 0,
    status: uniqueReasonCodes.length === 0 ? "plan_ready" : "blocked",
    boardDenominator: snapshot.registry.boards.filter((board) => board.required && board.status === "enabled").length,
    capturedForumCount: snapshot.forums.length,
    pendingProvisionBoardIds: snapshot.pendingBoards.map((row) => row.boardId),
    forumActionCount: forumActions.length,
    threadActionCount: threadActions.length,
    activeManagedCount: threadActions.filter((row) => row.managed).length,
    retainedLegacyHistoryCount: retainedMusic,
    retainedSharedIntakeCount: retainedShared,
    phase8ActiveManagedCount: phase8,
    forumActions,
    threadActions,
    reasonCodes: uniqueReasonCodes,
  };
}

function phase8JournalEvent(plan, snapshot) {
  const action = plan.threadActions.find((row) => row.threadId === consistency.MUSIC_SESH_PHASE_8_THREAD_ID);
  if (!action) return null;
  const forum = snapshot.forums.find((row) => row.boardId === action.boardId);
  const row = forum.threads.find((candidate) => candidate.thread.id === action.threadId);
  const existingManaged = cardContract.parseCanonicalCardBody(row?.starter?.content);
  const original = text(existingManaged?.summary || row?.starter?.content) || action.desiredTitle;
  const occurredAt = text(existingManaged?.updatedAt) || snapshot.generatedAt;
  return {
    schemaVersion: "atlas.board-card-journal.v1",
    eventId: "canonical-migration:music-sesh:phase-8:v1",
    occurredAt,
    actor: "discordos.canonical-board-migration",
    card: {
      id: consistency.MUSIC_SESH_PHASE_8_CARD_ID,
      project: "Music Sesh",
      sourceForumChannelId: action.forumChannelId,
      threadId: action.threadId,
      title: action.desiredTitle,
      type: "feature",
      state: "blocked",
      priority: "High",
      owner: "Music Sesh",
      progress: "Blocked",
      summary: original,
      objective: "Preserve the exact Phase 8 source record as the single active managed Music Sesh card.",
      acceptanceCriteria: ["Exact thread identity remains stable", "Phase 8 remains Feature, Blocked, and High until owner evidence changes"],
      discoveries: ["The June cleanup retained this exact Phase 8 record as current source truth."],
      nextActions: ["Resume Phase 8 only from evidence correlated to this exact thread identity."],
      blockers: ["Phase 8 is currently blocked."],
      evidence: [`discord-thread:${action.threadId}`],
    },
    entry: {
      kind: "correction",
      headline: "Classified the retained Phase 8 source as active managed work",
      completed: ["Preserved exact thread identity and legacy starter preimage"],
      discovered: [],
      next: ["Keep future state changes evidence-backed"],
      blockers: ["Phase 8 remains blocked"],
      evidence: [`discord-thread:${action.threadId}`],
    },
    correlation: {
      taskId: null,
      jobId: null,
      branch: null,
      commit: null,
      receipt: sha256(`${consistency.MUSIC_SESH_PHASE_8_THREAD_ID}:${consistency.MUSIC_SESH_PHASE_8_CARD_ID}:canonical-adoption-v1`),
    },
  };
}

async function patchThreadPreservingState({ action, body, token, fetchImpl }) {
  const writes = [];
  const desiredArchived = typeof action.desiredArchived === "boolean" ? action.desiredArchived : action.originalArchived;
  const desiredLocked = typeof action.desiredLocked === "boolean" ? action.desiredLocked : action.originalLocked;
  if (action.originalArchived || action.originalLocked) {
    const opened = await cardContract.discordRequest({ path: `/channels/${action.threadId}`, token, method: "PATCH", body: { archived: false, locked: false }, fetchImpl });
    writes.push({ phase: "temporary_open", ok: opened.ok, status: opened.status });
    if (!opened.ok) return { ok: false, writes, reasonCodes: ["thread_temporary_open_failed"] };
  }
  const patched = await cardContract.discordRequest({ path: `/channels/${action.threadId}`, token, method: "PATCH", body, fetchImpl });
  writes.push({ phase: "patch", ok: patched.ok, status: patched.status });
  let restore = { ok: true };
  if (desiredArchived || desiredLocked) {
    restore = await cardContract.discordRequest({
      path: `/channels/${action.threadId}`,
      token,
      method: "PATCH",
      body: { archived: desiredArchived, locked: desiredLocked },
      fetchImpl,
    });
    writes.push({ phase: "set_archive_lock", ok: restore.ok, status: restore.status });
  }
  const reasonCodes = [];
  if (!patched.ok) reasonCodes.push("thread_patch_failed");
  if (!restore.ok) reasonCodes.push("thread_archive_lock_restore_failed");
  return { ok: reasonCodes.length === 0, writes, reasonCodes };
}

async function applyThreadPhase({ actions, phase, tagIdsByForum = new Map(), token, fetchImpl }) {
  const rows = [];
  const reasonCodes = [];
  for (const action of actions) {
    const body = phase === "preclear"
      ? { applied_tags: action.safeAppliedTagIds }
      : {
          ...(action.managed && action.desiredTitle !== action.originalTitle ? { name: action.desiredTitle } : {}),
          applied_tags: action.desiredTagNames.map((name) => tagIdsByForum.get(action.forumChannelId)?.get(name)).filter(Boolean),
        };
    const currentTags = phase === "preclear" ? action.originalAppliedTagIds : null;
    if (phase === "preclear" && JSON.stringify(currentTags) === JSON.stringify(body.applied_tags)) {
      rows.push({ boardId: action.boardId, threadId: action.threadId, status: "unchanged", ok: true });
      continue;
    }
    const result = await patchThreadPreservingState({ action, body, token, fetchImpl });
    rows.push({ boardId: action.boardId, threadId: action.threadId, status: result.ok ? "patched" : "failed", ok: result.ok, writes: result.writes });
    reasonCodes.push(...result.reasonCodes.map((code) => `${code}:${action.threadId}`));
    if (!result.ok) break;
  }
  return { ok: reasonCodes.length === 0, phase, rows, reasonCodes };
}

async function applyForumProfiles({ plan, token, fetchImpl }) {
  const rows = [];
  const tagIdsByForum = new Map();
  const reasonCodes = [];
  for (const action of plan.forumActions) {
    const write = await cardContract.discordRequest({ path: `/channels/${action.forumChannelId}`, token, method: "PATCH", body: action.payload, fetchImpl });
    if (!write.ok) {
      reasonCodes.push(`forum_profile_write_failed:${action.boardId}`);
      rows.push({ boardId: action.boardId, forumChannelId: action.forumChannelId, ok: false, status: write.status });
      break;
    }
    const readback = await cardContract.discordRequest({ path: `/channels/${action.forumChannelId}`, token, fetchImpl });
    const tags = readback.ok ? canonicalTagIds(readback.payload) : { ok: false, rows: [], reasonCodes: ["forum_profile_readback_failed"] };
    reasonCodes.push(...tags.reasonCodes.map((code) => `${code}:${action.boardId}`));
    rows.push({ boardId: action.boardId, forumChannelId: action.forumChannelId, ok: readback.ok && tags.ok, status: readback.status, canonicalTagIds: tags.rows });
    if (!readback.ok || !tags.ok) break;
    tagIdsByForum.set(action.forumChannelId, tags.byName);
  }
  return { ok: reasonCodes.length === 0 && rows.length === plan.forumActions.length, rows, tagIdsByForum, reasonCodes };
}

async function patchSeededSocialTags({ ownerExport, seedReceipt, registry, tagIdsByForum, token, fetchImpl }) {
  const board = registry.boards.find((candidate) => candidate.id === "socials-os-active-admission");
  const byCardId = new Map((ownerExport.cards || []).map((card) => [text(card.record?.card_id), card]));
  const rows = [];
  const reasonCodes = [];
  for (const result of seedReceipt.results || []) {
    const card = byCardId.get(result.cardId);
    const names = unique([typeTagName(card?.record?.card_type), stateTagName(card?.record?.lifecycle), priorityTagName(card?.record?.priority)]);
    const ids = names.map((name) => tagIdsByForum.get(board.forumChannelId)?.get(name)).filter(Boolean);
    const action = { threadId: result.threadId, boardId: board.id, originalArchived: false, originalLocked: false };
    const canonicalTitle = cardContract.formatCanonicalCardTitle({ board, card: { title: card.record.title } });
    const write = await patchThreadPreservingState({ action, body: { name: canonicalTitle, applied_tags: ids }, token, fetchImpl });
    rows.push({ cardId: result.cardId, threadId: result.threadId, tagNames: names, appliedTagIds: ids, ok: write.ok });
    reasonCodes.push(...write.reasonCodes.map((code) => `${code}:${result.threadId}`));
  }
  return { ok: reasonCodes.length === 0 && rows.length === (ownerExport.cards || []).length, rows, reasonCodes };
}

function comparableManagedSocialCard(card) {
  return {
    id: text(card?.id).toLowerCase(),
    project: text(card?.project),
    type: text(card?.type).toLowerCase(),
    state: text(card?.state).toLowerCase(),
    priority: text(card?.priority),
    owner: text(card?.owner),
    progress: text(card?.progress),
    summary: text(card?.summary),
    objective: text(card?.objective),
    acceptanceCriteria: Array.isArray(card?.acceptanceCriteria) ? card.acceptanceCriteria : [],
    discoveries: Array.isArray(card?.discoveries) ? card.discoveries : [],
    nextActions: Array.isArray(card?.nextActions) ? card.nextActions : [],
    blockers: Array.isArray(card?.blockers) ? card.blockers : [],
  };
}

function replaceManagedCardBlock(existingContent, canonicalManagedBody) {
  const value = String(existingContent || "");
  const start = value.indexOf(journal.CARD_START);
  const end = value.indexOf(journal.CARD_END, start + journal.CARD_START.length);
  const nextStart = value.indexOf(journal.CARD_START, start + journal.CARD_START.length);
  const nextEnd = value.indexOf(journal.CARD_END, end + journal.CARD_END.length);
  if (start < 0 || end <= start || nextStart >= 0 || nextEnd >= 0) return null;
  return `${value.slice(0, start)}${canonicalManagedBody}${value.slice(end + journal.CARD_END.length)}`;
}

function sameSemanticSet(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return left.length === leftSet.size
    && right.length === rightSet.size
    && leftSet.size === rightSet.size
    && [...leftSet].every((value) => rightSet.has(value));
}

function planExistingSocialReconciliation({ socialsForum, seedBatch, socialsOwnerExport, reasonCodes }) {
  const rowsByCardId = new Map();
  for (const row of socialsForum?.threads || []) {
    const cardId = text(cardContract.parseCanonicalCardBody(row.starter?.content)?.id).toLowerCase();
    if (!cardId) continue;
    const rows = rowsByCardId.get(cardId) || [];
    rows.push(row);
    rowsByCardId.set(cardId, rows);
  }

  const tagIds = canonicalTagIds(socialsForum?.forum);
  reasonCodes.push(...tagIds.reasonCodes.map((code) => `${code}:socials-os-active-admission`));
  const availableTagById = new Map((socialsForum?.forum?.available_tags || [])
    .filter((tag) => text(tag?.id))
    .map((tag) => [text(tag.id), text(tag.name)]));
  const canonicalTagNames = new Set(forumProfile.CANONICAL_TAGS.map(([, , name]) => name));
  const cardsById = new Map((socialsOwnerExport?.cards || [])
    .map((card) => [text(card?.record?.card_id).toLowerCase(), card]));
  const bodyActions = [];
  const tagActions = [];
  const journalActions = [];
  const existingCardIds = [];

  for (const event of seedBatch.ok ? seedBatch.events : []) {
    const cardId = text(event.card?.id);
    const normalizedCardId = cardId.toLowerCase();
    const matches = rowsByCardId.get(normalizedCardId) || [];
    if (matches.length === 0) continue;
    existingCardIds.push(cardId);
    if (matches.length !== 1) {
      reasonCodes.push(`residual_socials_identity_duplicate:${normalizedCardId}`);
      continue;
    }
    const row = matches[0];
    const threadId = text(row.thread?.id);
    const starterMessageId = text(row.starter?.id) || threadId;
    if (!threadId || !starterMessageId) {
      reasonCodes.push(`residual_socials_thread_identity_missing:${normalizedCardId}`);
      continue;
    }
    const existingContent = String(row.starter?.content || "");
    const existingManaged = cardContract.parseCanonicalCardBody(existingContent);
    const canonicalManagedBody = journal.buildCanonicalBody(event, "");
    const canonicalManaged = cardContract.parseCanonicalCardBody(canonicalManagedBody);
    const canonicalBody = replaceManagedCardBlock(existingContent, canonicalManagedBody);
    if (!existingManaged || !canonicalManaged || canonicalBody === null) {
      reasonCodes.push(`residual_socials_managed_body_malformed:${normalizedCardId}`);
      continue;
    }
    if (JSON.stringify(comparableManagedSocialCard(existingManaged)) !== JSON.stringify(comparableManagedSocialCard(canonicalManaged))) {
      bodyActions.push({ cardId, threadId, starterMessageId, canonicalBody });
    }

    const currentAppliedTagIds = Array.isArray(row.thread?.applied_tags) ? [...row.thread.applied_tags].map(text).filter(Boolean) : [];
    if (currentAppliedTagIds.length > 5) reasonCodes.push(`residual_socials_applied_tag_limit_exceeded:${normalizedCardId}`);
    if (new Set(currentAppliedTagIds).size !== currentAppliedTagIds.length) reasonCodes.push(`residual_socials_applied_tag_duplicate:${normalizedCardId}`);
    const currentTagNames = currentAppliedTagIds.map((id) => availableTagById.get(id));
    if (currentTagNames.some((name) => !name || !canonicalTagNames.has(name))) {
      reasonCodes.push(`residual_socials_applied_tag_unknown_or_orphan:${normalizedCardId}`);
    }
    const ownerCard = cardsById.get(normalizedCardId);
    const desiredTagNames = unique([
      typeTagName(event.card?.type),
      stateTagName(event.card?.state),
      priorityTagName(event.card?.priority),
      ownerCard?.relationships?.duplicate_of ? "Duplicate" : null,
      ownerCard?.relationships?.superseded_by ? "Superseded" : null,
    ]);
    const desiredAppliedTagIds = desiredTagNames.map((name) => tagIds.byName.get(name)).filter(Boolean);
    if (desiredAppliedTagIds.length !== desiredTagNames.length) {
      reasonCodes.push(`residual_socials_desired_tag_resolution_failed:${normalizedCardId}`);
    } else if (!sameSemanticSet(currentAppliedTagIds, desiredAppliedTagIds)) {
      tagActions.push({
        cardId,
        threadId,
        originalArchived: row.thread?.thread_metadata?.archived === true,
        originalLocked: row.thread?.thread_metadata?.locked === true,
        currentAppliedTagIds,
        desiredTagNames,
        desiredAppliedTagIds,
      });
    }

    if (row.messageHistoryTruncated === true) {
      reasonCodes.push(`residual_socials_journal_history_truncated:${normalizedCardId}`);
      continue;
    }
    const marker = journal.eventMarker(event.eventId);
    const matchingEvents = (row.messages || []).filter((message) => String(message?.content || "").includes(marker));
    if (matchingEvents.length > 1) {
      reasonCodes.push(`residual_socials_journal_event_duplicate:${normalizedCardId}:${event.eventId}`);
    } else if (matchingEvents.length === 0) {
      journalActions.push({ cardId, threadId, eventId: event.eventId, journalBody: journal.buildJournalMessage(event) });
    }
  }

  return { existingCardIds, bodyActions, tagActions, journalActions };
}

function buildResidualRecoveryPlan({ snapshot, socialsOwnerExport, socialsOwnerExportBlobOid }) {
  const reasonCodes = [...(snapshot.reasonCodes || [])];
  const seedBatch = ownerSeed.buildOwnerSeedBatch({
    registry: snapshot.registry,
    ownerExports: [socialsOwnerExport],
    observedBlobOids: [socialsOwnerExportBlobOid],
  });
  reasonCodes.push(...seedBatch.reasonCodes);
  const inspectedIdentityRows = [];
  const titleActions = [];
  const phase8Rows = [];
  let retainedMusicHistoryCount = 0;

  for (const forumSnapshot of snapshot.forums || []) {
    const board = snapshot.registry.boards.find((candidate) => candidate.id === forumSnapshot.boardId);
    if (!board) {
      reasonCodes.push(`residual_board_missing:${forumSnapshot.boardId}`);
      continue;
    }
    for (const row of forumSnapshot.threads || []) {
      const managed = cardContract.parseCanonicalCardBody(row.starter?.content);
      const inspected = consistency.inspectThread({
        board,
        thread: row.thread,
        starter: row.starter,
        messages: row.messages || [],
      });
      if (inspected.cardId) inspectedIdentityRows.push(inspected);
      const threadId = text(row.thread?.id);
      if (forumSnapshot.boardId === "music-sesh-active" && !managed && threadId !== consistency.MUSIC_SESH_PHASE_8_THREAD_ID) {
        retainedMusicHistoryCount += 1;
      }
      if (threadId === consistency.MUSIC_SESH_PHASE_8_THREAD_ID) phase8Rows.push({ board, row, managed });
      if (!managed?.id) continue;
      const canonicalTitle = cardContract.formatCanonicalCardTitle({ board, card: { title: row.thread.name } });
      if (text(row.thread.name) !== canonicalTitle) {
        titleActions.push({
          boardId: board.id,
          threadId,
          cardId: text(managed.id),
          originalTitle: text(row.thread.name),
          canonicalTitle,
        });
      }
    }
  }

  const identityClassification = consistency.classifyIdentities(inspectedIdentityRows);
  reasonCodes.push(...identityClassification.duplicates.map((row) => `residual_managed_identity_duplicate:${row.cardId}`));

  const socialsBoard = snapshot.registry.boards.find((board) => board.id === "socials-os-active-admission");
  const socialsForum = (snapshot.forums || []).find((row) => row.boardId === "socials-os-active-admission");
  if (!socialsBoard?.forumChannelId || !socialsForum) reasonCodes.push("residual_socials_forum_missing");
  const socialIdentities = new Set();
  for (const row of socialsForum?.threads || []) {
    const cardId = text(cardContract.parseCanonicalCardBody(row.starter?.content)?.id).toLowerCase();
    if (cardId) socialIdentities.add(cardId);
  }
  const existingSocials = planExistingSocialReconciliation({
    socialsForum,
    seedBatch,
    socialsOwnerExport,
    reasonCodes,
  });

  const missingSocialEvents = seedBatch.ok
    ? seedBatch.events.filter((event) => !socialIdentities.has(text(event.card?.id).toLowerCase()))
    : [];
  const missingSocialIds = new Set(missingSocialEvents.map((event) => text(event.card?.id).toLowerCase()));
  const missingSocialCards = (socialsOwnerExport?.cards || []).filter((card) => missingSocialIds.has(text(card.record?.card_id).toLowerCase()));
  if (missingSocialCards.length !== missingSocialEvents.length) reasonCodes.push("residual_socials_missing_identity_mapping_failed");
  if (phase8Rows.length !== 1 || text(phase8Rows[0]?.managed?.id).toLowerCase() !== consistency.MUSIC_SESH_PHASE_8_CARD_ID.toLowerCase()) {
    reasonCodes.push("residual_music_sesh_phase_8_identity_mismatch");
  }
  if ((snapshot.forums || []).some((row) => row.boardId === "music-sesh-active") && retainedMusicHistoryCount !== 150) {
    reasonCodes.push("music_sesh_retained_legacy_count_mismatch");
  }
  const phase8 = phase8Rows[0];
  const phase8StateAction = phase8 ? {
    boardId: phase8.board.id,
    threadId: consistency.MUSIC_SESH_PHASE_8_THREAD_ID,
    archived: phase8.row.thread?.thread_metadata?.archived === true,
    locked: phase8.row.thread?.thread_metadata?.locked === true,
    action: phase8.row.thread?.thread_metadata?.archived === true || phase8.row.thread?.thread_metadata?.locked === true
      ? "unarchive_unlock"
      : "unchanged",
  } : null;
  const uniqueReasonCodes = unique(reasonCodes).sort();
  return {
    ok: uniqueReasonCodes.length === 0,
    status: uniqueReasonCodes.length === 0 ? "residual_plan_ready" : "blocked",
    boardDenominator: snapshot.registry.boards.filter((board) => board.required && board.status === "enabled").length,
    scannedForumCount: (snapshot.forums || []).length,
    scannedThreadCount: (snapshot.forums || []).reduce((count, forum) => count + (forum.threads || []).length, 0),
    managedIdentityCount: new Set(inspectedIdentityRows.map((row) => text(row.cardId).toLowerCase())).size,
    linkedLifecyclePairCount: identityClassification.linkedPairs.length,
    linkedLifecyclePairs: identityClassification.linkedPairs,
    trueDuplicateIdentityCount: identityClassification.duplicates.length,
    managedTitleRewriteCount: titleActions.length,
    titleActions,
    phase8StateAction,
    retainedMusicHistoryCount,
    socials: {
      expectedEventCount: seedBatch.eventCount,
      existingIdentityCount: existingSocials.existingCardIds.length,
      existingCardIds: existingSocials.existingCardIds,
      existingBodyUpdateCount: existingSocials.bodyActions.length,
      existingBodyUpdateCardIds: existingSocials.bodyActions.map((action) => action.cardId),
      existingBodyActions: existingSocials.bodyActions,
      existingTagUpdateCount: existingSocials.tagActions.length,
      existingTagUpdateCardIds: existingSocials.tagActions.map((action) => action.cardId),
      existingTagActions: existingSocials.tagActions,
      missingJournalEventCount: existingSocials.journalActions.length,
      missingJournalCardIds: existingSocials.journalActions.map((action) => action.cardId),
      missingJournalEventIds: existingSocials.journalActions.map((action) => action.eventId),
      missingJournalActions: existingSocials.journalActions,
      missingIdentityCount: missingSocialEvents.length,
      missingCardIds: missingSocialEvents.map((event) => event.card.id),
      missingEvents: missingSocialEvents,
      missingCards: missingSocialCards,
    },
    expectedMutations: {
      writes: {
        phase8State: phase8StateAction?.action === "unarchive_unlock" ? 1 : 0,
        managedTitles: titleActions.length,
        existingSocialStarterBodies: existingSocials.bodyActions.length,
        existingSocialTags: existingSocials.tagActions.length,
        missingSocialIdentities: missingSocialEvents.length,
        missingSocialIdentityTags: missingSocialEvents.length,
        total: (phase8StateAction?.action === "unarchive_unlock" ? 1 : 0)
          + titleActions.length
          + existingSocials.bodyActions.length
          + existingSocials.tagActions.length
          + (missingSocialEvents.length * 2),
      },
      messages: {
        existingSocialOwnerEvents: existingSocials.journalActions.length,
        missingSocialOwnerEvents: missingSocialEvents.length,
        total: existingSocials.journalActions.length + missingSocialEvents.length,
      },
    },
    forbiddenReplay: {
      forumProvision: false,
      forumProfileReplacement: false,
      appliedTagPreclear: false,
      fullThreadMigration: false,
    },
    reasonCodes: uniqueReasonCodes,
  };
}

async function applyResidualTitleRewrites({ actions, token, fetchImpl }) {
  const rows = [];
  const reasonCodes = [];
  for (const action of actions) {
    const write = await cardContract.discordRequest({
      path: `/channels/${action.threadId}`,
      token,
      method: "PATCH",
      body: { name: action.canonicalTitle },
      fetchImpl,
    });
    const readback = write.ok
      ? await cardContract.discordRequest({ path: `/channels/${action.threadId}`, token, fetchImpl })
      : { ok: false, status: null, payload: null };
    const exact = readback.ok && text(readback.payload?.name) === action.canonicalTitle;
    rows.push({ ...action, status: write.ok && exact ? "renamed" : "failed", ok: write.ok && exact, writeStatus: write.status, readbackStatus: readback.status });
    if (!write.ok) reasonCodes.push(`residual_managed_title_write_failed:${action.threadId}`);
    else if (!exact) reasonCodes.push(`residual_managed_title_readback_failed:${action.threadId}`);
    if (!write.ok || !exact) break;
  }
  return { ok: reasonCodes.length === 0 && rows.length === actions.length, rows, reasonCodes };
}

async function applyExistingSocialBodyUpdates({ actions, token, fetchImpl }) {
  const rows = [];
  const reasonCodes = [];
  for (const action of actions) {
    const write = await cardContract.updateThreadMessage({
      threadId: action.threadId,
      messageId: action.starterMessageId,
      token,
      message: { content: action.canonicalBody, allowed_mentions: { parse: [] } },
      fetchImpl,
    });
    const readback = write.ok
      ? await cardContract.fetchMessage({ channelId: action.threadId, messageId: action.starterMessageId, token, fetchImpl })
      : { ok: false, status: null, payload: null };
    const exact = readback.ok && String(readback.payload?.content || "") === action.canonicalBody;
    rows.push({ cardId: action.cardId, threadId: action.threadId, status: write.ok && exact ? "patched" : "failed", ok: write.ok && exact });
    if (!write.ok) reasonCodes.push(`residual_socials_body_write_failed:${action.cardId}`);
    else if (!exact) reasonCodes.push(`residual_socials_body_readback_failed:${action.cardId}`);
    if (!write.ok || !exact) break;
  }
  return { ok: reasonCodes.length === 0 && rows.length === actions.length, rows, reasonCodes };
}

async function applyExistingSocialTagUpdates({ actions, token, fetchImpl }) {
  const rows = [];
  const reasonCodes = [];
  for (const action of actions) {
    const write = await patchThreadPreservingState({ action, body: { applied_tags: action.desiredAppliedTagIds }, token, fetchImpl });
    const readback = write.ok
      ? await cardContract.discordRequest({ path: `/channels/${action.threadId}`, token, fetchImpl })
      : { ok: false, status: null, payload: null };
    const appliedTagIds = Array.isArray(readback.payload?.applied_tags) ? readback.payload.applied_tags.map(text).filter(Boolean) : [];
    const exact = readback.ok && sameSemanticSet(appliedTagIds, action.desiredAppliedTagIds);
    rows.push({
      cardId: action.cardId,
      threadId: action.threadId,
      desiredTagNames: action.desiredTagNames,
      desiredAppliedTagIds: action.desiredAppliedTagIds,
      status: write.ok && exact ? "patched" : "failed",
      ok: write.ok && exact,
    });
    if (!write.ok) reasonCodes.push(`residual_socials_tag_write_failed:${action.cardId}`);
    else if (!exact) reasonCodes.push(`residual_socials_tag_readback_failed:${action.cardId}`);
    if (!write.ok || !exact) break;
  }
  return { ok: reasonCodes.length === 0 && rows.length === actions.length, rows, reasonCodes };
}

async function applyExistingSocialJournalEvents({ actions, token, fetchImpl }) {
  const rows = [];
  const reasonCodes = [];
  for (const action of actions) {
    const history = await journal.readThreadMessages({ threadId: action.threadId, token, fetchImpl });
    if (!history.ok || history.truncated === true) {
      reasonCodes.push(`residual_socials_journal_history_read_failed:${action.cardId}`);
      rows.push({ cardId: action.cardId, threadId: action.threadId, eventId: action.eventId, status: "failed", ok: false });
      break;
    }
    const marker = journal.eventMarker(action.eventId);
    const existing = history.payload.filter((message) => String(message?.content || "").includes(marker));
    if (existing.length > 1) {
      reasonCodes.push(`residual_socials_journal_event_duplicate:${action.cardId.toLowerCase()}:${action.eventId}`);
      rows.push({ cardId: action.cardId, threadId: action.threadId, eventId: action.eventId, status: "failed", ok: false });
      break;
    }
    if (existing.length === 1) {
      rows.push({ cardId: action.cardId, threadId: action.threadId, eventId: action.eventId, status: "reused", ok: true, messageId: existing[0].id });
      continue;
    }
    const write = await cardContract.discordRequest({
      path: `/channels/${action.threadId}/messages`,
      token,
      method: "POST",
      body: { content: action.journalBody, allowed_mentions: { parse: [] } },
      fetchImpl,
    });
    const messageId = text(write.payload?.id);
    const readback = write.ok && messageId
      ? await cardContract.fetchMessage({ channelId: action.threadId, messageId, token, fetchImpl })
      : { ok: false, status: null, payload: null };
    const exact = readback.ok && String(readback.payload?.content || "") === action.journalBody;
    rows.push({ cardId: action.cardId, threadId: action.threadId, eventId: action.eventId, status: write.ok && exact ? "created" : "failed", ok: write.ok && exact, messageId: messageId || null });
    if (!write.ok) reasonCodes.push(`residual_socials_journal_write_failed:${action.cardId}`);
    else if (!exact) reasonCodes.push(`residual_socials_journal_readback_failed:${action.cardId}`);
    if (!write.ok || !exact) break;
  }
  return { ok: reasonCodes.length === 0 && rows.length === actions.length, rows, reasonCodes };
}

async function applyPhase8StateRecovery({ action, token, fetchImpl }) {
  if (!action) return { ok: false, status: "blocked", rows: [], reasonCodes: ["residual_music_sesh_phase_8_identity_mismatch"] };
  if (action.action === "unchanged") return { ok: true, status: "unchanged", rows: [{ ...action, status: "unchanged", ok: true }], reasonCodes: [] };
  const write = await cardContract.discordRequest({
    path: `/channels/${consistency.MUSIC_SESH_PHASE_8_THREAD_ID}`,
    token,
    method: "PATCH",
    body: { archived: false, locked: false },
    fetchImpl,
  });
  const readback = write.ok
    ? await cardContract.discordRequest({ path: `/channels/${consistency.MUSIC_SESH_PHASE_8_THREAD_ID}`, token, fetchImpl })
    : { ok: false, status: null, payload: null };
  const exact = readback.ok
    && readback.payload?.thread_metadata?.archived === false
    && readback.payload?.thread_metadata?.locked === false;
  const reasonCodes = [];
  if (!write.ok) reasonCodes.push("residual_music_sesh_phase_8_write_failed");
  else if (!exact) reasonCodes.push("residual_music_sesh_phase_8_readback_failed");
  return {
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "reopened" : "failed",
    rows: [{ ...action, status: reasonCodes.length === 0 ? "reopened" : "failed", ok: reasonCodes.length === 0, writeStatus: write.status, readbackStatus: readback.status }],
    reasonCodes,
  };
}

function publicResidualPlan(plan) {
  return {
    ...plan,
    socials: {
      expectedEventCount: plan.socials.expectedEventCount,
      existingIdentityCount: plan.socials.existingIdentityCount,
      existingCardIds: plan.socials.existingCardIds,
      existingBodyUpdateCount: plan.socials.existingBodyUpdateCount,
      existingBodyUpdateCardIds: plan.socials.existingBodyUpdateCardIds,
      existingTagUpdateCount: plan.socials.existingTagUpdateCount,
      existingTagUpdateCardIds: plan.socials.existingTagUpdateCardIds,
      missingJournalEventCount: plan.socials.missingJournalEventCount,
      missingJournalCardIds: plan.socials.missingJournalCardIds,
      missingJournalEventIds: plan.socials.missingJournalEventIds,
      missingIdentityCount: plan.socials.missingIdentityCount,
      missingCardIds: plan.socials.missingCardIds,
    },
  };
}

async function runResidualBoardRecovery({
  registry,
  profileRegistry,
  socialsOwnerExport,
  socialsOwnerExportBlobOid,
  snapshotPath,
  allowRecovery = false,
  apply = false,
  env = process.env,
  fetchImpl = fetch,
  fsImpl = fs,
  now = () => new Date(),
  captureSnapshotImpl = captureSnapshot,
  journalImpl = journal.buildBoardCardJournal,
  scanImpl = forumProfile.buildLiveForumProfileScan,
} = {}) {
  assertRuntimePath(snapshotPath);
  const admission = resolveRecoveryAdmission({ apply, allowRecovery, env });
  if (apply && !admission.admitted) {
    return { schemaVersion: RECEIPT_SCHEMA_VERSION, mode: "residual_recovery", generatedAt: now().toISOString(), ok: false, status: "blocked", apply, admission, mutatesDiscord: false, sendsMessages: false, reasonCodes: admission.reasonCodes };
  }
  const snapshot = await captureSnapshotImpl({ registry, env, fetchImpl, now });
  await fsImpl.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fsImpl.writeFile(snapshotPath, `${JSON.stringify({ residualPreimage: snapshot }, null, 2)}\n`, "utf8");
  const plan = buildResidualRecoveryPlan({ snapshot, socialsOwnerExport, socialsOwnerExportBlobOid });
  const phases = [];
  const reasonCodes = [...plan.reasonCodes];
  let titleReceipt = null;
  let phase8Receipt = null;
  let socialsBodyReceipt = null;
  let socialsExistingTagReceipt = null;
  let socialsJournalReceipt = null;
  let socialsSeedReceipt = null;
  let socialsTagReceipt = null;

  if (apply && reasonCodes.length === 0) {
    phase8Receipt = await applyPhase8StateRecovery({ action: plan.phase8StateAction, token: text(env.DISCORDOS_BOT_TOKEN), fetchImpl });
    phases.push({ phase: "phase_8_exact_reopen", ok: phase8Receipt.ok, receipt: phase8Receipt });
    reasonCodes.push(...phase8Receipt.reasonCodes);
  }
  if (apply && reasonCodes.length === 0) {
    titleReceipt = await applyResidualTitleRewrites({ actions: plan.titleActions, token: text(env.DISCORDOS_BOT_TOKEN), fetchImpl });
    phases.push({ phase: "managed_title_rewrite", ok: titleReceipt.ok, receipt: titleReceipt });
    reasonCodes.push(...titleReceipt.reasonCodes);
  }
  if (apply && reasonCodes.length === 0) {
    socialsBodyReceipt = await applyExistingSocialBodyUpdates({ actions: plan.socials.existingBodyActions, token: text(env.DISCORDOS_BOT_TOKEN), fetchImpl });
    phases.push({ phase: "socials_existing_body_reconcile", ok: socialsBodyReceipt.ok, receipt: socialsBodyReceipt });
    reasonCodes.push(...socialsBodyReceipt.reasonCodes);
  }
  if (apply && reasonCodes.length === 0) {
    socialsExistingTagReceipt = await applyExistingSocialTagUpdates({ actions: plan.socials.existingTagActions, token: text(env.DISCORDOS_BOT_TOKEN), fetchImpl });
    phases.push({ phase: "socials_existing_tag_reconcile", ok: socialsExistingTagReceipt.ok, receipt: socialsExistingTagReceipt });
    reasonCodes.push(...socialsExistingTagReceipt.reasonCodes);
  }
  if (apply && reasonCodes.length === 0) {
    socialsJournalReceipt = await applyExistingSocialJournalEvents({ actions: plan.socials.missingJournalActions, token: text(env.DISCORDOS_BOT_TOKEN), fetchImpl });
    phases.push({ phase: "socials_existing_journal_reconcile", ok: socialsJournalReceipt.ok, receipt: socialsJournalReceipt });
    reasonCodes.push(...socialsJournalReceipt.reasonCodes);
  }
  if (apply && reasonCodes.length === 0 && plan.socials.missingEvents.length > 0) {
    const payload = { contractVersion: ownerSeed.BATCH_CONTRACT, events: plan.socials.missingEvents };
    socialsSeedReceipt = await journalImpl({
      payload,
      allowApply: true,
      apply: true,
      env: { ...env, [journal.JOURNAL_ENV]: journal.JOURNAL_ENV_VALUE },
      fetchImpl,
      registry: snapshot.registry,
      now,
    });
    phases.push({ phase: "socials_missing_identity_reconcile", ok: socialsSeedReceipt.ok, receipt: socialsSeedReceipt });
    reasonCodes.push(...(socialsSeedReceipt.reasonCodes || []));
  }
  if (apply && reasonCodes.length === 0 && plan.socials.missingEvents.length > 0) {
    const socialsBoard = snapshot.registry.boards.find((board) => board.id === "socials-os-active-admission");
    const socialsForum = snapshot.forums.find((forum) => forum.boardId === "socials-os-active-admission");
    const tagIds = canonicalTagIds(socialsForum.forum);
    if (!tagIds.ok) reasonCodes.push(...tagIds.reasonCodes.map((code) => `${code}:socials-os-active-admission`));
    else {
      socialsTagReceipt = await patchSeededSocialTags({
        ownerExport: { ...socialsOwnerExport, cards: plan.socials.missingCards },
        seedReceipt: socialsSeedReceipt,
        registry: snapshot.registry,
        tagIdsByForum: new Map([[socialsBoard.forumChannelId, tagIds.byName]]),
        token: text(env.DISCORDOS_BOT_TOKEN),
        fetchImpl,
      });
      phases.push({ phase: "socials_missing_identity_tags", ok: socialsTagReceipt.ok, receipt: socialsTagReceipt });
      reasonCodes.push(...socialsTagReceipt.reasonCodes);
    }
  }

  const scanResult = reasonCodes.length === 0
    ? await scanImpl({ boardRegistry: snapshot.registry, profileRegistry, env, fetchImpl, now })
    : null;
  const exactReadback = scanResult?.receipt || scanResult || null;
  if (apply && exactReadback && (!exactReadback.ok || exactReadback.denominator?.requiredBoardCount !== 13 || exactReadback.denominator?.inspectedBoardCount !== 13)) {
    reasonCodes.push("canonical_13_board_exact_readback_failed");
  }
  if (exactReadback) phases.push({ phase: "exact_13_board_scanner", ok: exactReadback.ok === true, receipt: exactReadback });
  const uniqueReasonCodes = unique(reasonCodes).sort();
  const writeCount = (titleReceipt?.rows || []).filter((row) => row.status === "renamed").length
    + (phase8Receipt?.rows || []).filter((row) => row.status === "reopened").length
    + (socialsBodyReceipt?.rows || []).filter((row) => row.status === "patched").length
    + (socialsExistingTagReceipt?.rows || []).filter((row) => row.status === "patched").length
    + (socialsSeedReceipt?.results || []).filter((row) => row.cardAction === "created").length
    + (socialsTagReceipt?.rows || []).filter((row) => row.ok).length;
  const messageCount = (socialsJournalReceipt?.rows || []).filter((row) => row.status === "created").length
    + (socialsSeedReceipt?.results || []).filter((row) => row.journalAction === "created").length;
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    mode: "residual_recovery",
    generatedAt: now().toISOString(),
    ok: uniqueReasonCodes.length === 0,
    status: uniqueReasonCodes.length === 0
      ? apply ? "residual_recovery_applied_and_read_back" : "residual_recovery_dry_run_ready"
      : apply ? "recovery_required" : "blocked",
    apply,
    admission,
    mutatesDiscord: apply && (writeCount > 0 || messageCount > 0),
    sendsMessages: apply && messageCount > 0,
    mutationTruth: {
      writeCount,
      messageCount,
      managedTitleWrites: (titleReceipt?.rows || []).filter((row) => row.status === "renamed").length,
      phase8StateWrites: (phase8Receipt?.rows || []).filter((row) => row.status === "reopened").length,
      socialsExistingBodyWrites: (socialsBodyReceipt?.rows || []).filter((row) => row.status === "patched").length,
      socialsExistingTagWrites: (socialsExistingTagReceipt?.rows || []).filter((row) => row.status === "patched").length,
      socialsExistingJournalMessages: (socialsJournalReceipt?.rows || []).filter((row) => row.status === "created").length,
      socialsCreated: (socialsSeedReceipt?.results || []).filter((row) => row.cardAction === "created").length,
      socialsMissingIdentityJournalMessages: (socialsSeedReceipt?.results || []).filter((row) => row.journalAction === "created").length,
      socialsTagWrites: (socialsTagReceipt?.rows || []).filter((row) => row.ok).length,
      forumProvisionWrites: 0,
      forumProfileWrites: 0,
      preclearWrites: 0,
      retainedMusicHistoryWrites: 0,
    },
    snapshot: { path: snapshotPath, sha256: snapshot.sha256, exactPreimage: true },
    plan: publicResidualPlan(plan),
    phases,
    exactReadback,
    reasonCodes: uniqueReasonCodes,
  };
}

function publicPlan(plan) {
  return {
    ...plan,
    forumActions: plan.forumActions.map((row) => ({ boardId: row.boardId, forumChannelId: row.forumChannelId, action: "replace_canonical_profile" })),
    threadActions: plan.threadActions.map((row) => ({
      boardId: row.boardId,
      threadId: row.threadId,
      cardId: row.cardId,
      classification: row.classification,
      semanticStatus: row.semanticStatus,
      desiredTitle: row.desiredTitle,
      desiredTagNames: row.desiredTagNames,
    })),
  };
}

function buildRecoveryReceipt({ phases, snapshotPath }) {
  return {
    required: true,
    strategy: "recover_forward_from_exact_preimage",
    snapshotPath,
    acceptedTerminalState: false,
    orphanAppliedTagsAccepted: false,
    completedPhases: phases.filter((phase) => phase.ok).map((phase) => phase.phase),
    failedPhase: phases.find((phase) => !phase.ok)?.phase || "preflight",
  };
}

async function runCanonicalBoardMigration({
  registry,
  profileRegistry,
  socialsOwnerExport,
  socialsOwnerExportBlobOid,
  registryPath = DEFAULT_REGISTRY_PATH,
  snapshotPath,
  allowMigration = false,
  apply = false,
  env = process.env,
  fetchImpl = fetch,
  fsImpl = fs,
  now = () => new Date(),
  captureSnapshotImpl = captureSnapshot,
} = {}) {
  assertRuntimePath(snapshotPath);
  const admission = resolveAdmission({ apply, allowMigration, env });
  if (apply && !admission.admitted) return { schemaVersion: RECEIPT_SCHEMA_VERSION, generatedAt: now().toISOString(), ok: false, status: "blocked", apply, admission, mutatesDiscord: false, reasonCodes: admission.reasonCodes };
  const initialSnapshot = await captureSnapshotImpl({ registry, env, fetchImpl, now });
  await fsImpl.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fsImpl.writeFile(snapshotPath, `${JSON.stringify({ preProvision: initialSnapshot }, null, 2)}\n`, "utf8");

  const prospective = structuredClone(initialSnapshot);
  const pendingSocial = prospective.registry.boards.find((board) => board.id === "socials-os-active-admission" && !board.forumChannelId);
  if (pendingSocial) pendingSocial.forumChannelId = "pending-provision-exact-readback";
  const seedBatchPreview = ownerSeed.buildOwnerSeedBatch({
    registry: prospective.registry,
    ownerExports: [socialsOwnerExport],
    observedBlobOids: [socialsOwnerExportBlobOid],
  });
  const initialPlan = buildMigrationPlan({ snapshot: initialSnapshot, profileRegistry, ownerExports: [socialsOwnerExport] });
  if (!apply) {
    const reasonCodes = unique([...initialPlan.reasonCodes, ...seedBatchPreview.reasonCodes]);
    return {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      generatedAt: now().toISOString(),
      ok: reasonCodes.length === 0,
      status: reasonCodes.length === 0 ? "dry_run_ready" : "blocked",
      apply: false,
      admission,
      mutatesDiscord: false,
      sendsMessages: false,
      snapshot: { path: snapshotPath, sha256: initialSnapshot.sha256, exactPreimage: true },
      plan: publicPlan(initialPlan),
      socialsSeed: { status: seedBatchPreview.status, eventCount: seedBatchPreview.eventCount, reasonCodes: seedBatchPreview.reasonCodes },
      dryRunLiveAuthority: "read_only_no_discord_mutation",
      reasonCodes,
    };
  }

  const token = text(env.DISCORDOS_BOT_TOKEN);
  const phases = [];
  const reasonCodes = [...seedBatchPreview.reasonCodes];
  let provisionReceipt = null;
  if (reasonCodes.length === 0) {
    provisionReceipt = await provision.buildProjectBoardForumProvision({
      registryPath,
      allowProvision: true,
      apply: true,
      env: { ...env, [provision.PROVISION_ENV]: provision.PROVISION_ENV_VALUE },
      fetchImpl,
    });
    phases.push({ phase: "socials_provision", ok: provisionReceipt.ok, receipt: provisionReceipt });
    if (!provisionReceipt.ok) reasonCodes.push(...provisionReceipt.reasonCodes);
  }

  const workingSnapshot = reasonCodes.length === 0 ? await captureSnapshotImpl({ registry, env, fetchImpl, now }) : null;
  if (workingSnapshot) {
    await fsImpl.writeFile(snapshotPath, `${JSON.stringify({ preProvision: initialSnapshot, postProvisionPreProfile: workingSnapshot }, null, 2)}\n`, "utf8");
    reasonCodes.push(...workingSnapshot.reasonCodes);
  }
  const plan = workingSnapshot ? buildMigrationPlan({ snapshot: workingSnapshot, profileRegistry, ownerExports: [socialsOwnerExport] }) : initialPlan;
  reasonCodes.push(...plan.reasonCodes);

  let forumApply = null;
  let preclear = null;
  let managedMigration = null;
  let phase8Receipt = null;
  let socialsSeedReceipt = null;
  let socialsTagReceipt = null;
  let exactReadback = null;
  if (reasonCodes.length === 0) {
    preclear = await applyThreadPhase({ actions: plan.threadActions, phase: "preclear", token, fetchImpl });
    phases.push({ phase: "safe_tag_preclear", ok: preclear.ok, receipt: preclear });
    reasonCodes.push(...preclear.reasonCodes);
  }
  if (reasonCodes.length === 0) {
    forumApply = await applyForumProfiles({ plan, token, fetchImpl });
    phases.push({ phase: "canonical_forum_patch", ok: forumApply.ok, receipt: { ...forumApply, tagIdsByForum: undefined } });
    reasonCodes.push(...forumApply.reasonCodes);
  }
  if (reasonCodes.length === 0) {
    const phase8Event = phase8JournalEvent(plan, workingSnapshot);
    phase8Receipt = await journal.buildBoardCardJournal({
      payload: phase8Event,
      allowApply: true,
      apply: true,
      env: { ...env, [journal.JOURNAL_ENV]: journal.JOURNAL_ENV_VALUE },
      fetchImpl,
      registry: workingSnapshot.registry,
      now,
    });
    phases.push({ phase: "phase_8_managed_adoption", ok: phase8Receipt.ok, receipt: phase8Receipt });
    reasonCodes.push(...phase8Receipt.reasonCodes);
  }
  if (reasonCodes.length === 0) {
    managedMigration = await applyThreadPhase({ actions: plan.threadActions, phase: "final", tagIdsByForum: forumApply.tagIdsByForum, token, fetchImpl });
    phases.push({ phase: "managed_title_tag_migration", ok: managedMigration.ok, receipt: managedMigration });
    reasonCodes.push(...managedMigration.reasonCodes);
  }
  if (reasonCodes.length === 0) {
    const batch = ownerSeed.buildOwnerSeedBatch({
      registry: workingSnapshot.registry,
      ownerExports: [socialsOwnerExport],
      observedBlobOids: [socialsOwnerExportBlobOid],
    });
    if (!batch.ok) reasonCodes.push(...batch.reasonCodes);
    else {
      socialsSeedReceipt = await journal.buildBoardCardJournal({
        payload: batch,
        allowApply: true,
        apply: true,
        env: { ...env, [journal.JOURNAL_ENV]: journal.JOURNAL_ENV_VALUE },
        fetchImpl,
        registry: workingSnapshot.registry,
        now,
      });
      phases.push({ phase: "socials_owner_seed", ok: socialsSeedReceipt.ok, receipt: socialsSeedReceipt });
      reasonCodes.push(...socialsSeedReceipt.reasonCodes);
    }
  }
  if (reasonCodes.length === 0) {
    socialsTagReceipt = await patchSeededSocialTags({ ownerExport: socialsOwnerExport, seedReceipt: socialsSeedReceipt, registry: workingSnapshot.registry, tagIdsByForum: forumApply.tagIdsByForum, token, fetchImpl });
    phases.push({ phase: "socials_seed_tag_readback_prep", ok: socialsTagReceipt.ok, receipt: socialsTagReceipt });
    reasonCodes.push(...socialsTagReceipt.reasonCodes);
  }
  if (reasonCodes.length === 0) {
    exactReadback = (await forumProfile.buildLiveForumProfileScan({ boardRegistry: workingSnapshot.registry, profileRegistry, env, fetchImpl, now })).receipt;
    if (!exactReadback.ok || exactReadback.denominator.requiredBoardCount !== 13 || exactReadback.denominator.inspectedBoardCount !== 13) {
      reasonCodes.push("canonical_13_board_exact_readback_failed");
    }
    phases.push({ phase: "exact_13_board_readback", ok: exactReadback.ok, receipt: exactReadback });
  }
  const uniqueReasonCodes = unique(reasonCodes).sort();
  const recovery = uniqueReasonCodes.length === 0 ? null : buildRecoveryReceipt({ phases, snapshotPath });
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    generatedAt: now().toISOString(),
    ok: uniqueReasonCodes.length === 0,
    status: uniqueReasonCodes.length === 0 ? "canonical_13_board_migration_applied_and_read_back" : "recovery_required",
    apply: true,
    admission,
    mutatesDiscord: phases.length > 0,
    sendsMessages: Boolean(phase8Receipt || socialsSeedReceipt),
    snapshot: { path: snapshotPath, preProvisionSha256: initialSnapshot.sha256, postProvisionPreProfileSha256: workingSnapshot?.sha256 || null },
    plan: publicPlan(plan),
    phases,
    exactReadback,
    recovery,
    reasonCodes: uniqueReasonCodes,
  };
}

function renderMarkdown(receipt) {
  return [
    receipt.mode === "residual_recovery"
      ? "# DiscordOS Canonical 13-Board Residual Recovery"
      : "# DiscordOS Canonical 13-Board Migration",
    "",
    `- status: \`${receipt.status}\``,
    `- apply: \`${receipt.apply}\``,
    `- board denominator: \`${receipt.plan?.boardDenominator || 0}\``,
    `- retained Music Sesh history: \`${receipt.plan?.retainedLegacyHistoryCount || 0}\``,
    `- retained Shared Intake: \`${receipt.plan?.retainedSharedIntakeCount || 0}\``,
    `- Socials seed events: \`${receipt.socialsSeed?.eventCount || receipt.phases?.find((row) => row.phase === "socials_owner_seed")?.receipt?.eventCount || 0}\``,
    `- exact 13-board readback: \`${receipt.exactReadback?.ok === true ? "pass" : receipt.exactReadback ? "fail" : "not_run"}\``,
    `- recovery required: \`${receipt.recovery?.required === true}\``,
    `- reason codes: \`${receipt.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [registry, profileRegistry, socialsOwnerExportBytes] = await Promise.all([
    textIntegrity.readUtf8Json(options.registryPath),
    textIntegrity.readUtf8Json(options.profilePath),
    fs.readFile(options.socialsExportPath),
  ]);
  const socialsOwnerExport = await textIntegrity.readUtf8Json(options.socialsExportPath, {
    fsImpl: { readFile: async () => socialsOwnerExportBytes },
  });
  const socialsOwnerExportBlobOid = ownerSeed.gitBlobOid(socialsOwnerExportBytes);
  const receipt = options.recoverResidual
    ? await runResidualBoardRecovery({
      registry,
      profileRegistry,
      socialsOwnerExport,
      socialsOwnerExportBlobOid,
      snapshotPath: options.snapshotPath,
      allowRecovery: options.allowRecovery,
      apply: options.apply,
    })
    : await runCanonicalBoardMigration({
      registry,
      profileRegistry,
      socialsOwnerExport,
      socialsOwnerExportBlobOid,
      registryPath: options.registryPath,
      snapshotPath: options.snapshotPath,
      allowMigration: options.allowMigration,
      apply: options.apply,
    });
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  const output = `${JSON.stringify(receipt, null, 2)}\n`;
  await fs.writeFile(options.outputPath, output, "utf8");
  process.stdout.write(options.json ? output : renderMarkdown(receipt));
  process.exitCode = receipt.ok ? 0 : 1;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

module.exports = {
  MIGRATION_ENV,
  MIGRATION_ENV_VALUE,
  RECOVERY_ENV,
  RECOVERY_ENV_VALUE,
  RECEIPT_SCHEMA_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  _internals: {
    MIGRATION_ENV,
    MIGRATION_ENV_VALUE,
    RECOVERY_ENV,
    RECOVERY_ENV_VALUE,
    DEFAULT_REGISTRY_PATH,
    DEFAULT_PROFILE_PATH,
    DEFAULT_SOCIALS_EXPORT_PATH,
    DEFAULT_RUNTIME_ROOT,
    parseArgs,
    assertRuntimePath,
    resolveAdmission,
    resolveRecoveryAdmission,
    stateTagName,
    priorityTagName,
    typeTagName,
    ownerRecords,
    deriveThreadSemantics,
    canonicalAvailableTags,
    canonicalTagIds,
    forumPatchPayload,
    captureSnapshot,
    buildMigrationPlan,
    phase8JournalEvent,
    patchThreadPreservingState,
    applyThreadPhase,
    applyForumProfiles,
    patchSeededSocialTags,
    comparableManagedSocialCard,
    replaceManagedCardBlock,
    sameSemanticSet,
    planExistingSocialReconciliation,
    buildResidualRecoveryPlan,
    applyResidualTitleRewrites,
    applyExistingSocialBodyUpdates,
    applyExistingSocialTagUpdates,
    applyExistingSocialJournalEvents,
    applyPhase8StateRecovery,
    runResidualBoardRecovery,
    buildRecoveryReceipt,
    runCanonicalBoardMigration,
    renderMarkdown,
  },
};
