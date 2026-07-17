const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { _internals: cardContract } = require("./discordos-board-card-contract");
const { _internals: completedTransfer } = require("./discordos-board-completed-transfer");
const { _internals: currentRepair } = require("./discordos-current-board-drift-repair");
const { _internals: journal } = require("./discordos-board-card-journal");
const { _internals: ownerSeed } = require("./discordos-project-board-owner-seed");
const forumProfileModule = require("./discordos-forum-profile");
const { _internals: forumProfile } = forumProfileModule;

const PLAN_SCHEMA_VERSION = "discordos.current-live-board-reconcile-plan.v1";
const RECEIPT_SCHEMA_VERSION = "discordos.current-live-board-reconcile-receipt.v1";
const SOURCE_SCHEMA_VERSION = "discordos.current-owner-sources.v1";
const EVENT_ID = "discordos-current-live-board-reconcile-2026-07-16";
const RECONCILE_ENV = "DISCORDOS_CURRENT_LIVE_BOARD_RECONCILE";
const RECONCILE_ENV_VALUE = "enabled";
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_BOARD_REGISTRY_PATH = path.join(REPO_ROOT, "config", "discordos-board-registry.json");
const DEFAULT_PROFILE_REGISTRY_PATH = path.join(REPO_ROOT, "config", "discordos-forum-profile-registry.json");
const DEFAULT_SOURCE_REGISTRY_PATH = path.join(REPO_ROOT, "config", "discordos-current-owner-sources.json");
const COMPLETED_BOARD_ID = "shared-completed";
const TARGETED_RECOVERY_TARGETS = Object.freeze({
  "tag-02": Object.freeze({ boardId: "fitness-active", cardId: "FF-RET-004", threadId: "1526112879303196763" }),
  "tag-03": Object.freeze({ boardId: "fitness-active", cardId: "FF-ROUTINE-001", threadId: "1526833783385358407" }),
});
const TARGETED_RECOVERY_OPERATION_IDS = Object.keys(TARGETED_RECOVERY_TARGETS).sort();
const LEGACY_STRUCTURE_PLAN_DIGESTS_WITHOUT_THREAD_STATE = new Set([
  "29d8f714aa16fadb6a8904e527eb5dcf072fd74a7468c425420edd7a8480ead0",
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function objectDigest(value, field = "planDigestSha256") {
  const copy = structuredClone(value);
  delete copy[field];
  return sha256(canonicalJson(copy));
}

function unique(values) {
  return [...new Set(values)];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sameArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function readValue(args, index, code) {
  const value = args[index + 1];
  if (!text(value)) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = {
    mode: "preflight",
    evidencePath: null,
    planPath: null,
    planSha256: null,
    priorPlanPath: null,
    priorPlanSha256: null,
    priorReceiptPath: null,
    priorReceiptSha256: null,
    sourceRegistryPath: DEFAULT_SOURCE_REGISTRY_PATH,
    outputPath: null,
    allowApply: false,
    structureOnly: false,
    json: false,
  };
  let explicitMode = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--generate-plan", "--generate-recovery", "--preflight", "--dry-run", "--apply"].includes(arg)) {
      if (explicitMode) throw new Error("multiple_modes_not_allowed");
      options.mode = arg.slice(2).replace("-", "_");
      explicitMode = true;
    } else if (arg === "--evidence") {
      options.evidencePath = path.resolve(readValue(args, index, "missing_evidence_path"));
      index += 1;
    } else if (arg === "--plan") {
      options.planPath = path.resolve(readValue(args, index, "missing_plan_path"));
      index += 1;
    } else if (arg === "--plan-sha256") {
      options.planSha256 = readValue(args, index, "missing_plan_sha256").toLowerCase();
      index += 1;
    } else if (arg === "--prior-plan") {
      options.priorPlanPath = path.resolve(readValue(args, index, "missing_prior_plan_path"));
      index += 1;
    } else if (arg === "--prior-plan-sha256") {
      options.priorPlanSha256 = readValue(args, index, "missing_prior_plan_sha256").toLowerCase();
      index += 1;
    } else if (arg === "--prior-receipt") {
      options.priorReceiptPath = path.resolve(readValue(args, index, "missing_prior_receipt_path"));
      index += 1;
    } else if (arg === "--prior-receipt-sha256") {
      options.priorReceiptSha256 = readValue(args, index, "missing_prior_receipt_sha256").toLowerCase();
      index += 1;
    } else if (arg === "--owner-sources") {
      options.sourceRegistryPath = path.resolve(readValue(args, index, "missing_owner_sources_path"));
      index += 1;
    } else if (arg === "--output") {
      options.outputPath = path.resolve(readValue(args, index, "missing_output_path"));
      index += 1;
    } else if (arg === "--allow-apply") options.allowApply = true;
    else if (arg === "--structure-only") options.structureOnly = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (options.mode === "generate_plan") {
    if (!options.evidencePath) throw new Error("evidence_path_missing");
    if (!options.outputPath) throw new Error("plan_output_path_missing");
  } else if (options.mode === "generate_recovery") {
    if (!options.priorPlanPath || !/^[a-f0-9]{64}$/.test(options.priorPlanSha256 || "")) throw new Error("trusted_prior_plan_missing_or_invalid");
    if (!options.priorReceiptPath || !/^[a-f0-9]{64}$/.test(options.priorReceiptSha256 || "")) throw new Error("trusted_prior_receipt_missing_or_invalid");
    if (!options.outputPath) throw new Error("plan_output_path_missing");
  } else {
    if (!options.planPath) throw new Error("plan_path_missing");
    if (!/^[a-f0-9]{64}$/.test(options.planSha256 || "")) throw new Error("trusted_plan_sha256_missing_or_invalid");
  }
  if (options.mode === "apply" && !options.outputPath) throw new Error("apply_output_path_missing");
  if (options.structureOnly && options.mode !== "generate_plan") throw new Error("structure_only_generation_only");
  return options;
}

async function readJsonWithBytes(filePath) {
  const bytes = await fs.readFile(filePath);
  return { bytes, value: JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")) };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function gitRevision(ref = "origin/main") {
  return execFileSync("git", ["rev-parse", ref], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function gitBlobOid(bytes) {
  return ownerSeed.gitBlobOid(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "DiscordOS-current-live-reconcile",
    ...(text(token) ? { Authorization: `Bearer ${token.trim()}` } : {}),
  };
}

async function githubJson(apiPath, { token, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`https://api.github.com/${apiPath}`, { headers: githubHeaders(token) });
  if (!response?.ok) throw new Error(`github_read_failed:${response?.status || 0}:${apiPath}`);
  return response.json();
}

function encodedRepoPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

async function readGithubHead(repository, ref, options = {}) {
  const payload = await githubJson(`repos/${repository}/commits/${encodeURIComponent(ref)}`, options);
  if (!/^[a-f0-9]{40}$/.test(payload?.sha || "")) throw new Error(`github_head_invalid:${repository}:${ref}`);
  return payload.sha;
}

async function readGithubFile(repository, commit, filePath, options = {}) {
  const payload = await githubJson(
    `repos/${repository}/contents/${encodedRepoPath(filePath)}?ref=${encodeURIComponent(commit)}`,
    options,
  );
  if (payload?.type !== "file" || !text(payload?.content) || !/^[a-f0-9]{40}$/.test(payload?.sha || "")) {
    throw new Error(`github_file_invalid:${repository}:${filePath}`);
  }
  const bytes = Buffer.from(payload.content.replace(/\s/g, ""), "base64");
  if (gitBlobOid(bytes) !== payload.sha) throw new Error(`github_blob_digest_mismatch:${repository}:${filePath}`);
  return { bytes, blobOid: payload.sha, value: JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")) };
}

function validateSourceRegistry(sourceRegistry, boardRegistry) {
  const reasonCodes = [];
  if (sourceRegistry?.schemaVersion !== SOURCE_SCHEMA_VERSION) reasonCodes.push("owner_source_registry_schema_mismatch");
  const boards = new Map((boardRegistry?.boards || []).map((board) => [board.id, board]));
  const seenBoards = new Set();
  for (const source of sourceRegistry?.ownerExports || []) {
    if (!boards.has(source.boardId)) reasonCodes.push(`owner_source_board_missing:${source.boardId || "unknown"}`);
    if (seenBoards.has(source.boardId)) reasonCodes.push(`owner_source_board_duplicate:${source.boardId}`);
    seenBoards.add(source.boardId);
    if (boards.get(source.boardId)?.sourceAdapter !== source.adapterId) {
      reasonCodes.push(`owner_source_adapter_mismatch:${source.boardId}`);
    }
    if (!text(source.repository) || !text(source.ref) || !text(source.path)) {
      reasonCodes.push(`owner_source_identity_missing:${source.boardId || "unknown"}`);
    }
  }
  return unique(reasonCodes).sort();
}

async function loadOwnerAuthority({
  sourceRegistry,
  boardRegistry,
  token,
  fetchImpl = fetch,
  repoRoot = REPO_ROOT,
} = {}) {
  const reasonCodes = validateSourceRegistry(sourceRegistry, boardRegistry);
  const ownerExports = [];
  const observedBlobOids = [];
  const sources = [];
  const terminalRecords = [];
  const headCache = new Map();
  const resolveHead = async (repository, ref) => {
    const key = `${repository}:${ref}`;
    if (!headCache.has(key)) headCache.set(key, await readGithubHead(repository, ref, { token, fetchImpl }));
    return headCache.get(key);
  };
  for (const source of sourceRegistry?.ownerExports || []) {
    const head = await resolveHead(source.repository, source.ref);
    const file = await readGithubFile(source.repository, head, source.path, { token, fetchImpl });
    const ownerExport = file.value;
    if (ownerExport?.adapter_id !== source.adapterId) reasonCodes.push(`owner_export_adapter_mismatch:${source.boardId}`);
    ownerExports.push(ownerExport);
    observedBlobOids.push(file.blobOid);
    sources.push({
      boardId: source.boardId,
      adapterId: source.adapterId,
      repository: source.repository,
      ref: source.ref,
      repositoryCommit: head,
      path: source.path,
      blobOid: file.blobOid,
      rawSha256: sha256(file.bytes),
      exportId: ownerExport?.export_id || null,
      sourceRevision: ownerExport?.source_revision || null,
      cardCount: Array.isArray(ownerExport?.cards) ? ownerExport.cards.length : null,
    });
    for (const card of ownerExport?.cards || []) {
      if (!["completed", "archived", "closed"].includes(text(card?.record?.lifecycle).toLowerCase())) continue;
      terminalRecords.push({
        boardId: source.boardId,
        adapterId: source.adapterId,
        cardId: text(card?.record?.card_id),
        occurredAt: text(card?.record?.updated_at) || text(ownerExport?.generated_at),
        evidence: [source.repository, head, source.path, file.blobOid, ownerExport?.source_revision].filter(Boolean),
        producerIdentity: `${ownerExport?.export_id || "unknown"}:${card?.idempotency_key || "unknown"}`,
      });
    }
  }
  const ownerBatch = ownerSeed.buildOwnerSeedBatch({ ownerExports, observedBlobOids, registry: boardRegistry });
  reasonCodes.push(...ownerBatch.reasonCodes);

  for (const local of sourceRegistry?.localTerminalSources || []) {
    const absolutePath = path.resolve(repoRoot, local.path);
    const bytes = await fs.readFile(absolutePath);
    const payload = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
    const values = Array.isArray(payload?.[local.collection]) ? payload[local.collection] : [];
    const terminalValues = new Set((local.terminalValues || []).map((value) => text(value).toLowerCase()));
    const blobOid = gitBlobOid(bytes);
    sources.push({
      boardId: local.boardId,
      adapterId: local.adapterId,
      repository: "fawxzzy/DiscordOS",
      ref: "working-tree",
      repositoryCommit: gitRevision("origin/main"),
      path: local.path,
      blobOid,
      rawSha256: sha256(bytes),
      exportId: null,
      sourceRevision: `git-blob:${blobOid}`,
      cardCount: values.length,
    });
    for (const row of values) {
      if (!terminalValues.has(text(row?.[local.terminalField]).toLowerCase())) continue;
      terminalRecords.push({
        boardId: local.boardId,
        adapterId: local.adapterId,
        cardId: text(row?.[local.idField]),
        occurredAt: text(row?.[local.occurredAtField]) || text(payload?.updatedAt),
        evidence: [local.path, `git-blob:${blobOid}`],
        producerIdentity: `${local.path}:${text(row?.[local.idField])}:${blobOid}`,
      });
    }
  }

  const unresolvedRegisteredSources = [];
  for (const source of sourceRegistry?.unresolvedRegisteredSources || []) {
    const head = await resolveHead(source.repository, source.ref);
    unresolvedRegisteredSources.push({ ...source, repositoryCommit: head, disposition: "blocked_owner_artifact_unavailable" });
  }
  const excludedProjects = [];
  for (const source of sourceRegistry?.excludedProjects || []) {
    const head = await resolveHead(source.repository, source.ref);
    const registered = (boardRegistry?.boards || []).filter((board) =>
      text(board.project).toLowerCase() === text(source.project).toLowerCase()
      || text(board.stableCardNamespace).toLowerCase() === text(source.project).toLowerCase()
    );
    if (registered.length > 0) reasonCodes.push(`excluded_project_is_registered:${source.project}`);
    excludedProjects.push({ ...source, repositoryCommit: head, disposition: "excluded_no_registered_board_or_owner_export" });
  }
  if (reasonCodes.length > 0) {
    const error = new Error(`owner_authority_blocked:${unique(reasonCodes).sort().join(",")}`);
    error.reasonCodes = unique(reasonCodes).sort();
    throw error;
  }
  return {
    sources: sources.sort((left, right) => left.boardId.localeCompare(right.boardId) || left.path.localeCompare(right.path)),
    ownerBatch,
    terminalRecords: terminalRecords.sort((left, right) => left.boardId.localeCompare(right.boardId) || left.cardId.localeCompare(right.cardId)),
    unresolvedRegisteredSources,
    excludedProjects,
  };
}

function scanGuardProjection(scan) {
  return {
    schemaVersion: scan?.schemaVersion || null,
    denominator: scan?.denominator || null,
    profileValidation: scan?.profileValidation || null,
    relativeOrder: scan?.relativeOrder || null,
    forums: (scan?.forums || []).map((forum) => ({
      boardId: forum.boardId,
      forumChannelId: forum.forumChannelId,
      forumProfile: forum.forumProfile,
      permissionProfile: forum.permissionProfile,
      structure: forum.structure,
      tags: forum.tags,
      permissions: forum.permissions,
      defaults: forum.defaults,
      lifecycle: forum.lifecycle,
      reasonCodes: forum.reasonCodes,
    })).sort((left, right) => left.boardId.localeCompare(right.boardId)),
    cards: {
      status: scan?.cards?.status || null,
      coverageStatus: scan?.cards?.coverageStatus || null,
      registeredBoardCount: scan?.cards?.registeredBoardCount ?? null,
      enabledBoardCount: scan?.cards?.enabledBoardCount ?? null,
      uncoveredBoardCount: scan?.cards?.uncoveredBoardCount ?? null,
      currentCardCount: scan?.cards?.currentCardCount ?? null,
      totalThreadCount: scan?.cards?.totalThreadCount ?? null,
      retainedLegacyHistoryCount: scan?.cards?.retainedLegacyHistoryCount ?? null,
      healthyCardCount: scan?.cards?.healthyCardCount ?? null,
      driftedCardCount: scan?.cards?.driftedCardCount ?? null,
      supersededRecordCount: scan?.cards?.supersededRecordCount ?? null,
      duplicateStableIdentityCount: scan?.cards?.duplicateStableIdentityCount ?? null,
      actionableTextIntegrityFindingCount: scan?.cards?.actionableTextIntegrityFindingCount ?? null,
      immutableSystemHistoryFindingCount: scan?.cards?.immutableSystemHistoryFindingCount ?? null,
      driftCounts: scan?.cards?.driftCounts || {},
      boardProfiles: scan?.cards?.boardProfiles || [],
      exactReadbackRows: scan?.cards?.exactReadbackRows || [],
      reasonCodes: scan?.cards?.reasonCodes || [],
    },
    reasonCodes: scan?.reasonCodes || [],
  };
}

function currentRows(scan) {
  return (scan?.cards?.exactReadbackRows || []).filter((row) => !row.superseded && !row.retainedLegacyHistory);
}

function currentEventDuplicates(scan) {
  const counts = new Map();
  for (const row of currentRows(scan)) {
    for (const entry of row.journalIntegrityEntries || []) {
      if (text(entry.eventId)) counts.set(entry.eventId, (counts.get(entry.eventId) || 0) + 1);
    }
  }
  return [...counts].filter(([, count]) => count > 1).map(([eventId, count]) => ({ eventId, count }));
}

function journalIdentityProjection(scan) {
  const forumByBoard = new Map((scan?.forums || []).map((forum) => [forum.boardId, forum]));
  return {
    status: scan?.status || null,
    inventorySource: "registry",
    registryPath: DEFAULT_BOARD_REGISTRY_PATH,
    scanStartedAt: scan?.generatedAt || null,
    scanCompletedAt: scan?.generatedAt || null,
    uncoveredBoardCount: scan?.denominator?.uncoveredBoardCount ?? null,
    registeredBoards: (scan?.forums || []).map((forum) => ({
      id: forum.boardId,
      forumChannelId: forum.forumChannelId,
    })),
    rows: (scan?.cards?.exactReadbackRows || []).map((row) => ({
      ...row,
      forumChannelId: row.forumChannelId || forumByBoard.get(row.boardId)?.forumChannelId || null,
    })),
    reasonCodes: scan?.reasonCodes || [],
  };
}

function sourceEventEntry(row, eventId) {
  return (row?.journalIntegrityEntries || []).filter((entry) => entry.eventId === eventId);
}

function ownerEventDesiredTagNames(event) {
  const names = [text(event?.card?.type).toLowerCase() === "bug" ? "Bug" : "Feature"];
  const stateNames = new Map([
    ["intake", "Intake"], ["planning", "Planning"], ["ready", "Ready"], ["opened", "Opened"],
    ["in_progress", "In Progress"], ["review", "Review"], ["blocked", "Blocked"], ["completed", "Completed"],
  ]);
  const priorityNames = new Map([["low", "Low"], ["medium", "Medium"], ["high", "High"], ["blocker", "Blocker"]]);
  if (stateNames.has(text(event?.card?.state).toLowerCase())) names.push(stateNames.get(text(event.card.state).toLowerCase()));
  if (priorityNames.has(text(event?.card?.priority).toLowerCase())) names.push(priorityNames.get(text(event.card.priority).toLowerCase()));
  return names;
}

function forumTagIds(scan, boardId, names) {
  const forum = (scan?.forums || []).find((row) => row.boardId === boardId);
  if (!forum) throw new Error(`forum_missing:${boardId}`);
  return names.map((name) => {
    const matches = (forum.tags?.actual || []).filter((tag) => tag.name === name);
    if (matches.length !== 1) throw new Error(`tag_mapping_not_exact:${boardId}:${name}`);
    return matches[0].id;
  });
}

function semanticRow(scan, boardId, threadId) {
  const profile = (scan?.cards?.boardProfiles || []).find((row) => row.boardId === boardId);
  return (profile?.appliedTagSafety?.semanticRows || []).find((row) => row.threadId === threadId) || null;
}

async function inspectOwnerPreimage({ event, row, env = process.env, fetchImpl = fetch }) {
  if (!row) return { exists: false };
  const token = text(env?.DISCORDOS_BOT_TOKEN);
  if (!token) throw new Error("discord_bot_token_missing");
  const [threadRead, starterRead] = await Promise.all([
    cardContract.discordRequest({ path: `/channels/${row.threadId}`, token, fetchImpl }),
    cardContract.fetchMessage({ channelId: row.threadId, messageId: row.threadId, token, fetchImpl }),
  ]);
  if (!threadRead.ok || !starterRead.ok) throw new Error(`owner_event_preimage_read_failed:${event.eventId}`);
  const body = String(starterRead.payload?.content || "");
  if (sha256(body) !== row.starterContentSha256) throw new Error(`owner_event_scan_preimage_stale:${event.eventId}`);
  const parsed = cardContract.parseCanonicalCardBody(body);
  if (!parsed || parsed.id !== event.card.id) throw new Error(`owner_event_body_identity_mismatch:${event.eventId}`);
  const ownerTime = Date.parse(event.occurredAt);
  const liveTime = Date.parse(parsed.updatedAt);
  if (Number.isFinite(ownerTime) && Number.isFinite(liveTime) && ownerTime < liveTime) {
    throw new Error(`owner_event_older_than_live:${event.eventId}`);
  }
  return {
    exists: true,
    threadId: row.threadId,
    title: String(threadRead.payload?.name || ""),
    body,
    bodySha256: sha256(body),
    appliedTagIds: threadRead.payload?.applied_tags || [],
    archived: threadRead.payload?.thread_metadata?.archived === true,
    locked: threadRead.payload?.thread_metadata?.locked === true,
    reactions: cardContract.summarizeReactions(starterRead.payload),
    parsedUpdatedAt: parsed.updatedAt || null,
  };
}

async function buildOwnerOperations({ authority, scan, boardRegistry, env = process.env, fetchImpl = fetch }) {
  const rows = currentRows(scan);
  const boardsByForum = new Map((boardRegistry?.boards || []).map((board) => [board.forumChannelId, board]));
  const operations = [];
  const unchanged = [];
  const blockedSubsets = [];
  for (const event of authority.ownerBatch.events || []) {
    const board = boardsByForum.get(event.card.sourceForumChannelId);
    if (!board) throw new Error(`owner_event_board_missing:${event.eventId}`);
    const matches = rows.filter((row) => row.boardId === board.id && row.cardId === event.card.id);
    if (matches.length > 1) throw new Error(`owner_event_live_identity_duplicate:${event.eventId}`);
    const row = matches[0] || null;
    const plannedEvent = row
      ? { ...event, card: { ...event.card, threadId: row.threadId } }
      : event;
    const journalBody = journal.buildJournalMessage(plannedEvent);
    const journalSha256 = sha256(journalBody);
    const entries = sourceEventEntry(row, event.eventId);
    if (entries.length > 1) throw new Error(`owner_event_duplicate:${event.eventId}`);
    if (entries.length === 1) {
      if (entries[0].contentSha256 !== journalSha256) {
        blockedSubsets.push({
          kind: "owner_event",
          boardId: board.id,
          cardId: event.card.id,
          eventId: event.eventId,
          reasonCodes: ["owner_event_content_conflict"],
        });
        continue;
      }
      unchanged.push({ boardId: board.id, cardId: event.card.id, threadId: row.threadId, eventId: event.eventId, journalSha256 });
      continue;
    }
    let preimage;
    try {
      preimage = await inspectOwnerPreimage({ event: plannedEvent, row, env, fetchImpl });
    } catch (error) {
      blockedSubsets.push({
        kind: "owner_event",
        boardId: board.id,
        cardId: event.card.id,
        eventId: event.eventId,
        threadId: row?.threadId || null,
        reasonCodes: [text(error?.message) || "owner_event_preimage_blocked"],
      });
      continue;
    }
    operations.push({
      operationId: `owner-${String(operations.length + 1).padStart(2, "0")}`,
      kind: "owner_event",
      boardId: board.id,
      cardId: event.card.id,
      eventId: event.eventId,
      event: plannedEvent,
      journalSha256,
      preimage,
      desiredTagNames: ownerEventDesiredTagNames(event),
      desiredTagIds: forumTagIds(scan, board.id, ownerEventDesiredTagNames(event)),
      requiredReaction: cardContract.getRequiredReactionForCard(plannedEvent.card, board),
    });
  }
  return { operations, unchanged, blockedSubsets };
}

function buildTagOperations({ scan, ownerOperations }) {
  const byThread = new Map();
  const exactRows = currentRows(scan);
  for (const profile of scan?.cards?.boardProfiles || []) {
    const forumChannelId = (scan?.forums || []).find((forum) => forum.boardId === profile.boardId)?.forumChannelId || null;
    if (!forumChannelId) throw new Error(`tag_forum_identity_missing:${profile.boardId}`);
    for (const row of profile?.appliedTagSafety?.semanticRows || []) {
      if (row.exact !== false || row.retainedLegacyHistory) continue;
      if ((row.unknownNames || []).length > 0 || (row.duplicateNames || []).length > 0 || (row.orphanAppliedTagIds || []).length > 0 || row.overLimit) {
        throw new Error(`unsafe_tag_target:${row.threadId}`);
      }
      const exactRow = exactRows.find((candidate) => candidate.boardId === profile.boardId && candidate.threadId === row.threadId);
      if (!exactRow) throw new Error(`tag_exact_row_missing:${row.threadId}`);
      byThread.set(row.threadId, {
        kind: "tag_repair",
        boardId: profile.boardId,
        forumChannelId,
        threadId: row.threadId,
        cardId: row.cardId,
        dependsOnOwnerOperationId: null,
        threadState: { archived: exactRow.archived === true, locked: exactRow.locked === true },
        preimage: { appliedTagNames: row.actualNames, appliedTagIds: forumTagIds(scan, profile.boardId, row.actualNames) },
        postimage: { appliedTagNames: row.expectedNames, appliedTagIds: forumTagIds(scan, profile.boardId, row.expectedNames) },
      });
    }
  }
  for (const owner of ownerOperations) {
    const ownerForumChannelId = (scan?.forums || []).find((forum) => forum.boardId === owner.boardId)?.forumChannelId || null;
    if (!ownerForumChannelId) throw new Error(`tag_forum_identity_missing:${owner.boardId}`);
    if (owner.preimage.exists) {
      const row = semanticRow(scan, owner.boardId, owner.preimage.threadId);
      if (!row) throw new Error(`owner_event_semantic_row_missing:${owner.eventId}`);
      if (sameArray(row.actualNames, owner.desiredTagNames)) {
        byThread.delete(owner.preimage.threadId);
        continue;
      }
      byThread.set(owner.preimage.threadId, {
        kind: "tag_repair",
        boardId: owner.boardId,
        forumChannelId: ownerForumChannelId,
        threadId: owner.preimage.threadId,
        cardId: owner.cardId,
        dependsOnOwnerOperationId: owner.operationId,
        threadState: { archived: owner.preimage.archived === true, locked: owner.preimage.locked === true },
        preimage: { appliedTagNames: row.actualNames, appliedTagIds: forumTagIds(scan, owner.boardId, row.actualNames) },
        postimage: { appliedTagNames: owner.desiredTagNames, appliedTagIds: owner.desiredTagIds },
      });
    } else {
      const key = `pending:${owner.operationId}`;
      byThread.set(key, {
        kind: "tag_repair",
        boardId: owner.boardId,
        forumChannelId: ownerForumChannelId,
        threadId: null,
        cardId: owner.cardId,
        dependsOnOwnerOperationId: owner.operationId,
        threadState: { archived: false, locked: false },
        preimage: { appliedTagNames: [], appliedTagIds: [] },
        postimage: { appliedTagNames: owner.desiredTagNames, appliedTagIds: owner.desiredTagIds },
      });
    }
  }
  return [...byThread.values()]
    .sort((left, right) => left.boardId.localeCompare(right.boardId) || left.cardId.localeCompare(right.cardId))
    .map((operation, index) => ({ ...operation, operationId: `tag-${String(index + 1).padStart(2, "0")}` }));
}

async function buildOrderOperation({ scan, boardRegistry, env = process.env, fetchImpl = fetch }) {
  if (scan?.relativeOrder?.matches === true) return null;
  const forums = [...(scan?.forums || [])].sort((left, right) => left.structure.observedPosition - right.structure.observedPosition);
  const expectedIds = scan?.relativeOrder?.expectedBoardIds || [];
  const forumById = new Map(forums.map((forum) => [forum.boardId, forum]));
  const slots = forums.map((forum) => forum.structure.observedPosition);
  const guildChannels = await currentRepair.inspectGuildChannels({ guildId: boardRegistry.guildId, env, fetchImpl });
  return {
    operationId: "order-01",
    kind: "forum_order_repair",
    guildId: boardRegistry.guildId,
    preimage: forums.map((forum) => ({ boardId: forum.boardId, channelId: forum.forumChannelId, position: forum.structure.observedPosition })),
    postimage: expectedIds.map((boardId, index) => ({ boardId, channelId: forumById.get(boardId)?.forumChannelId || null, position: slots[index] })),
    guildChannelPreimage: guildChannels.map(currentRepair.guildChannelInvariant).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function terminalEventId(record) {
  return `completed:${record.cardId}:owner-${sha256(record.producerIdentity).slice(0, 20)}`;
}

async function buildTransferOperations({ authority, scan, boardRegistry, env = process.env, fetchImpl = fetch }) {
  const rows = currentRows(scan);
  const completedRows = rows.filter((row) => row.boardId === COMPLETED_BOARD_ID);
  const completedBoard = (boardRegistry?.boards || []).find((board) => board.id === COMPLETED_BOARD_ID);
  const operations = [];
  const unchanged = [];
  const blockedSubsets = [];
  for (const record of authority.terminalRecords) {
    const sourceMatches = rows.filter((row) => row.boardId === record.boardId && row.cardId === record.cardId);
    const destinationMatches = completedRows.filter((row) => row.cardId === record.cardId);
    if (sourceMatches.length > 1 || destinationMatches.length > 1) throw new Error(`terminal_identity_duplicate:${record.cardId}`);
    const source = sourceMatches[0] || null;
    const destination = destinationMatches[0] || null;
    if (source && destination) {
      unchanged.push({ boardId: record.boardId, cardId: record.cardId, sourceThreadId: source.threadId, destinationThreadId: destination.threadId });
      continue;
    }
    if (!source) {
      blockedSubsets.push({ boardId: record.boardId, cardId: record.cardId, reason: destination ? "terminal_destination_without_source" : "terminal_owner_record_without_live_source" });
      continue;
    }
    if (source.archived || source.locked) {
      blockedSubsets.push({ boardId: record.boardId, cardId: record.cardId, sourceThreadId: source.threadId, reason: "terminal_source_archived_without_destination" });
      continue;
    }
    const board = (boardRegistry?.boards || []).find((candidate) => candidate.id === record.boardId);
    const enriched = await currentRepair.inspectTransferSource({
      sourceThreadId: source.threadId,
      sourceForumChannelId: board.forumChannelId,
      sourceContentSha256: source.starterContentSha256,
      cardId: record.cardId,
      state: source.state,
    }, { env, fetchImpl });
    if (!enriched.ok) throw new Error(`terminal_source_enrichment_blocked:${record.cardId}:${enriched.reasonCodes.join(",")}`);
    const appliedTagNames = ["Feature", "Completed"];
    operations.push({
      operationId: `transfer-${String(operations.length + 1).padStart(2, "0")}`,
      kind: "completed_transfer",
      source: {
        boardId: record.boardId,
        forumChannelId: board.forumChannelId,
        threadId: source.threadId,
        cardId: record.cardId,
        title: enriched.title,
        content: enriched.sourceContent,
        contentSha256: enriched.sourceContentSha256,
        archived: false,
        locked: false,
        project: enriched.project,
        type: enriched.type,
        state: source.state,
        priority: enriched.priority,
        owner: enriched.owner,
      },
      destination: {
        boardId: COMPLETED_BOARD_ID,
        forumChannelId: completedBoard.forumChannelId,
        stableCardId: record.cardId,
        appliedTagNames,
        appliedTagIds: forumTagIds(scan, COMPLETED_BOARD_ID, appliedTagNames),
      },
      event: {
        eventId: terminalEventId(record),
        occurredAt: record.occurredAt || scan.generatedAt,
        evidence: record.evidence.join(" | "),
      },
      producer: record,
    });
  }
  return { operations, unchanged, blockedSubsets };
}

function planCounts(operations) {
  const count = (kind) => operations.filter((operation) => operation.kind === kind).length;
  return {
    ownerEvents: count("owner_event"),
    tagRepairs: count("tag_repair"),
    forumOrderRepairs: count("forum_order_repair"),
    completedTransfers: count("completed_transfer"),
  };
}

async function buildDeterministicPlan({
  scan,
  evidenceBytes,
  boardRegistry,
  sourceRegistry,
  authority,
  structureOnly = false,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  if (scan?.schemaVersion !== forumProfileModule.SCAN_SCHEMA_VERSION || scan?.readOnly !== true || scan?.mutatesDiscord !== false) {
    throw new Error("current_scan_not_admitted");
  }
  if (scan?.denominator?.coverageStatus !== "complete" || scan?.denominator?.uncoveredBoardCount !== 0) throw new Error("current_scan_coverage_incomplete");
  if (scan?.profileValidation?.ok !== true || scan?.cards?.driftedCardCount !== 0) throw new Error("current_scan_structural_drift_blocked");
  if (scan?.cards?.duplicateStableIdentityCount !== 0 || currentEventDuplicates(scan).length > 0) throw new Error("current_identity_duplicate_blocked");
  if (scan?.cards?.actionableTextIntegrityFindingCount !== 0) throw new Error("current_actionable_text_corruption_blocked");
  for (const profile of scan?.cards?.boardProfiles || []) {
    if ((profile?.appliedTagSafety?.orphanAppliedTagIds || []).length > 0 || (profile?.appliedTagSafety?.ambiguousAppliedTags || []).length > 0) {
      throw new Error(`current_applied_tag_identity_unsafe:${profile.boardId}`);
    }
  }
  const owner = structureOnly
    ? {
        operations: [],
        unchanged: [],
        blockedSubsets: [{
          kind: "owner_event_batch",
          reason: "throughput_guard_deferred_after_owner_journal_composition_failure",
          eventCount: authority.ownerBatch.events.length,
          eventIds: authority.ownerBatch.events.map((event) => event.eventId).sort(),
        }],
      }
    : await buildOwnerOperations({ authority, scan, boardRegistry, env, fetchImpl });
  const tags = buildTagOperations({ scan, ownerOperations: owner.operations });
  const order = await buildOrderOperation({ scan, boardRegistry, env, fetchImpl });
  const transfers = structureOnly
    ? {
        operations: [],
        unchanged: [],
        blockedSubsets: [{
          kind: "completed_transfer_batch",
          reason: "deferred_with_owner_event_follow_up",
          terminalRecordCount: authority.terminalRecords.length,
          producerIdentities: authority.terminalRecords.map((record) => record.producerIdentity).sort(),
        }],
      }
    : await buildTransferOperations({ authority, scan, boardRegistry, env, fetchImpl });
  const operations = [...owner.operations, ...tags, ...(order ? [order] : []), ...transfers.operations];
  const counts = planCounts(operations);
  const ownerCreates = owner.operations.filter((operation) => operation.preimage.exists === false).length;
  const guardProjection = scanGuardProjection(scan);
  const initialCurrentCards = scan.cards.currentCardCount;
  const initialTotalThreads = scan.cards.totalThreadCount;
  const terminalCurrentCards = initialCurrentCards + ownerCreates + transfers.operations.length;
  const terminalTotalThreads = initialTotalThreads + ownerCreates + transfers.operations.length;
  const tagWriteCap = tags.reduce((sum, operation) =>
    sum + (operation.threadState.archived || operation.threadState.locked ? 3 : 1), 0);
  const mutationCap = counts.ownerEvents * 6 + tagWriteCap + counts.forumOrderRepairs + counts.completedTransfers * 12;
  const plan = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    eventId: EVENT_ID,
    generatedAt: scan.generatedAt,
    discordosOriginMain: gitRevision("origin/main"),
    writerBoundary: "discordos-single-logical-writer",
    executionScope: structureOnly ? "structure_only" : "current_live_full",
    evidence: {
      rawSha256: sha256(evidenceBytes),
      canonicalSha256: sha256(canonicalJson(scan)),
      guardProjection,
      guardProjectionSha256: sha256(canonicalJson(guardProjection)),
    },
    ownerAuthority: {
      sources: authority.sources,
      ownerBatchSources: authority.ownerBatch.sources,
      unchangedOwnerEvents: owner.unchanged,
      unchangedCompletedPairs: transfers.unchanged,
      unresolvedRegisteredSources: authority.unresolvedRegisteredSources,
      excludedProjects: authority.excludedProjects,
      blockedSubsets: [...owner.blockedSubsets, ...transfers.blockedSubsets],
    },
    denominator: {
      initial: {
        boards: scan.denominator.requiredBoardCount,
        currentCards: initialCurrentCards,
        totalThreads: initialTotalThreads,
        healthyCards: scan.cards.healthyCardCount,
        retainedLegacyRows: scan.cards.retainedLegacyHistoryCount,
        supersededRows: scan.cards.supersededRecordCount,
        duplicateStableIdentities: scan.cards.duplicateStableIdentityCount,
        duplicateCurrentEventIds: 0,
        actionableTextFindings: scan.cards.actionableTextIntegrityFindingCount,
        immutableSystemHistoryFindings: scan.cards.immutableSystemHistoryFindingCount,
      },
      terminal: {
        boards: scan.denominator.requiredBoardCount,
        currentCards: terminalCurrentCards,
        totalThreads: terminalTotalThreads,
        healthyCards: terminalCurrentCards,
        retainedLegacyRows: scan.cards.retainedLegacyHistoryCount,
        supersededRows: scan.cards.supersededRecordCount,
        duplicateStableIdentities: 0,
        duplicateCurrentEventIds: 0,
        actionableTextFindings: 0,
        orphanAppliedTags: 0,
      },
    },
    operationCounts: counts,
    mutationCap: { logicalOperationCount: operations.length, maxConfirmedDiscordWrites: mutationCap },
    operations,
    rollback: {
      policy: "no_automatic_destructive_rollback_recover_forward_from_exact_preimages",
      ownerCardPreimagesEmbedded: owner.operations.filter((operation) => operation.preimage.exists).length,
      tagPreimagesEmbedded: tags.length,
      guildChannelPreimageEmbedded: Boolean(order),
      transferSourcePreimagesEmbedded: transfers.operations.length,
    },
    historicalCloseout: "frozen_13_board_243_identity_evidence_preserved_not_reused",
    marker: "UNMEASURED",
    nextPacket: structureOnly
      ? "DiscordOS owner-event and completed-transfer blocked follow-up"
      : "FP-DOS-REC-001 DiscordOS Supabase source recovery",
  };
  plan.planDigestSha256 = objectDigest(plan);
  return plan;
}

async function buildTargetedRecoveryPlan({
  priorPlan,
  priorPlanBytes,
  trustedPriorPlanSha256,
  priorReceipt,
  priorReceiptBytes,
  trustedPriorReceiptSha256,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const reasonCodes = [];
  if (sha256(priorPlanBytes) !== trustedPriorPlanSha256) reasonCodes.push("trusted_prior_plan_file_digest_mismatch");
  if (priorPlan?.schemaVersion !== PLAN_SCHEMA_VERSION || priorPlan?.eventId !== EVENT_ID) reasonCodes.push("prior_plan_identity_mismatch");
  if (priorPlan?.executionScope !== "structure_only") reasonCodes.push("prior_plan_scope_mismatch");
  if (priorPlan?.planDigestSha256 !== objectDigest(priorPlan)) reasonCodes.push("prior_plan_digest_mismatch");
  if (sha256(priorReceiptBytes) !== trustedPriorReceiptSha256) reasonCodes.push("trusted_prior_receipt_file_digest_mismatch");
  if (priorReceipt?.schemaVersion !== RECEIPT_SCHEMA_VERSION || priorReceipt?.eventId !== EVENT_ID) reasonCodes.push("prior_receipt_identity_mismatch");
  if (priorReceipt?.status !== "blocked_after_partial_apply" || priorReceipt?.planDigestSha256 !== priorPlan?.planDigestSha256) {
    reasonCodes.push("prior_receipt_plan_or_status_mismatch");
  }
  if (priorReceipt?.discordMutationOutcomesUnknown !== 0 || priorReceipt?.discordMutations !== 16) reasonCodes.push("prior_receipt_write_accounting_mismatch");
  const finalScan = priorReceipt?.reconciliation?.scan;
  if (
    finalScan?.denominator?.inspectedBoardCount !== priorPlan?.denominator?.terminal?.boards
    || finalScan?.cards?.currentCardCount !== priorPlan?.denominator?.terminal?.currentCards
    || finalScan?.cards?.healthyCardCount !== priorPlan?.denominator?.terminal?.healthyCards
    || finalScan?.cards?.driftedCardCount !== 0
    || finalScan?.cards?.duplicateStableIdentityCount !== 0
    || finalScan?.cards?.actionableTextIntegrityFindingCount !== 0
  ) reasonCodes.push("prior_receipt_terminal_denominator_invalid");
  const failed = (priorReceipt?.operationReceipts || []).filter((receipt) => receipt?.ok === false);
  const failedIds = failed.map((receipt) => receipt.operationId).sort();
  if (canonicalJson(failedIds) !== canonicalJson(TARGETED_RECOVERY_OPERATION_IDS)) reasonCodes.push("prior_receipt_failed_operation_set_mismatch");
  for (const receipt of failed) {
    if (
      receipt.kind !== "tag_repair"
      || receipt.status !== "blocked"
      || receipt.writeCount !== 0
      || receipt.writeOutcomeUnknownCount !== 0
      || receipt.httpStatus !== 400
    ) reasonCodes.push(`prior_receipt_failure_not_definitive:${receipt.operationId || "unknown"}`);
  }
  const priorOperations = new Map((priorPlan?.operations || []).map((operation) => [operation.operationId, operation]));
  const operations = [];
  const touchedPreimages = [];
  for (const operationId of TARGETED_RECOVERY_OPERATION_IDS) {
    const priorOperation = priorOperations.get(operationId);
    const expectedTarget = TARGETED_RECOVERY_TARGETS[operationId];
    if (
      !priorOperation
      || priorOperation.kind !== "tag_repair"
      || priorOperation.boardId !== expectedTarget.boardId
      || priorOperation.cardId !== expectedTarget.cardId
      || priorOperation.threadId !== expectedTarget.threadId
    ) {
      reasonCodes.push(`prior_plan_recovery_operation_missing:${operationId}`);
      continue;
    }
    const read = await readPlannedTagRuntime(priorOperation, { env, fetchImpl });
    const threadState = {
      archived: read.payload?.thread_metadata?.archived === true,
      locked: read.payload?.thread_metadata?.locked === true,
    };
    const exact = read.ok
      && read.payload?.parent_id === priorOperation.forumChannelId
      && currentRepair.sameUniqueSet(read.payload?.applied_tags || [], priorOperation.preimage.appliedTagIds)
      && threadState.archived === true
      && threadState.locked === true;
    if (!exact) {
      reasonCodes.push(`targeted_recovery_preimage_mismatch:${operationId}`);
      continue;
    }
    touchedPreimages.push({
      operationId,
      boardId: priorOperation.boardId,
      threadId: priorOperation.threadId,
      cardId: priorOperation.cardId,
      forumChannelId: priorOperation.forumChannelId,
      appliedTagIds: [...read.payload.applied_tags].sort(),
      threadState,
    });
    operations.push({
      ...priorOperation,
      threadState,
      recoveryFrom: {
        priorPlanSha256: trustedPriorPlanSha256,
        priorReceiptSha256: trustedPriorReceiptSha256,
        priorHttpStatus: failed.find((receipt) => receipt.operationId === operationId)?.httpStatus || null,
      },
    });
  }
  if (reasonCodes.length > 0) {
    const error = new Error(`targeted_recovery_plan_blocked:${unique(reasonCodes).sort().join(",")}`);
    error.reasonCodes = unique(reasonCodes).sort();
    throw error;
  }
  const plan = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    eventId: EVENT_ID,
    generatedAt: finalScan.generatedAt,
    discordosOriginMain: priorPlan.discordosOriginMain,
    writerBoundary: "discordos-single-logical-writer",
    executionScope: "targeted_tag_recovery",
    evidence: {
      priorPlanFileSha256: trustedPriorPlanSha256,
      priorPlanDigestSha256: priorPlan.planDigestSha256,
      priorReceiptFileSha256: trustedPriorReceiptSha256,
      touchedPreimages,
      touchedPreimagesSha256: sha256(canonicalJson(touchedPreimages)),
    },
    ownerAuthority: priorPlan.ownerAuthority,
    denominator: priorPlan.denominator,
    operationCounts: planCounts(operations),
    mutationCap: { logicalOperationCount: operations.length, maxConfirmedDiscordWrites: operations.length * 3 },
    operations,
    rollback: {
      policy: "restore_exact_archive_lock_preimage_after_each_target_and_exact_tag_preimage_on_failure",
      ownerCardPreimagesEmbedded: 0,
      tagPreimagesEmbedded: operations.length,
      guildChannelPreimageEmbedded: false,
      transferSourcePreimagesEmbedded: 0,
    },
    historicalCloseout: "frozen_13_board_243_identity_evidence_preserved_not_reused",
    marker: "UNMEASURED",
    nextPacket: "DiscordOS owner-event and completed-transfer blocked follow-up",
  };
  plan.planDigestSha256 = objectDigest(plan);
  return plan;
}

function verifyPlanStructure(plan) {
  const reasonCodes = [];
  if (plan?.schemaVersion !== PLAN_SCHEMA_VERSION) reasonCodes.push("plan_schema_mismatch");
  if (plan?.eventId !== EVENT_ID) reasonCodes.push("plan_event_mismatch");
  if (!["structure_only", "current_live_full", "targeted_tag_recovery"].includes(plan?.executionScope)) reasonCodes.push("plan_execution_scope_invalid");
  if (plan?.planDigestSha256 !== objectDigest(plan)) reasonCodes.push("plan_digest_mismatch");
  const operations = plan?.operations || [];
  if (unique(operations.map((operation) => operation.operationId)).length !== operations.length) reasonCodes.push("plan_operation_id_duplicate");
  if (canonicalJson(plan?.operationCounts || {}) !== canonicalJson(planCounts(operations))) reasonCodes.push("plan_operation_counts_mismatch");
  if (!Number.isInteger(plan?.mutationCap?.maxConfirmedDiscordWrites) || plan.mutationCap.maxConfirmedDiscordWrites < operations.length) {
    reasonCodes.push("plan_mutation_cap_invalid");
  }
  const exactLegacyStructurePlan = plan?.executionScope === "structure_only"
    && LEGACY_STRUCTURE_PLAN_DIGESTS_WITHOUT_THREAD_STATE.has(plan?.planDigestSha256);
  for (const operation of operations) {
    if (!["owner_event", "tag_repair", "forum_order_repair", "completed_transfer"].includes(operation.kind)) {
      reasonCodes.push(`plan_operation_kind_unsupported:${operation.operationId || "unknown"}`);
    }
    if (!exactLegacyStructurePlan && operation.kind === "tag_repair" && (
      typeof operation.threadState?.archived !== "boolean"
      || typeof operation.threadState?.locked !== "boolean"
    )) reasonCodes.push(`plan_tag_thread_state_missing:${operation.operationId || "unknown"}`);
  }
  if (plan?.executionScope === "targeted_tag_recovery") {
    const operationIds = operations.map((operation) => operation.operationId).sort();
    if (canonicalJson(operationIds) !== canonicalJson(TARGETED_RECOVERY_OPERATION_IDS)) {
      reasonCodes.push("targeted_recovery_operation_set_mismatch");
    }
    if (
      plan?.mutationCap?.logicalOperationCount !== TARGETED_RECOVERY_OPERATION_IDS.length
      || plan?.mutationCap?.maxConfirmedDiscordWrites !== TARGETED_RECOVERY_OPERATION_IDS.length * 3
    ) reasonCodes.push("targeted_recovery_mutation_cap_mismatch");
    const evidenceRows = Array.isArray(plan?.evidence?.touchedPreimages) ? plan.evidence.touchedPreimages : [];
    const evidenceIds = evidenceRows.map((row) => row.operationId).sort();
    if (canonicalJson(evidenceIds) !== canonicalJson(TARGETED_RECOVERY_OPERATION_IDS)) {
      reasonCodes.push("targeted_recovery_evidence_set_mismatch");
    }
    if (plan?.evidence?.touchedPreimagesSha256 !== sha256(canonicalJson(evidenceRows))) {
      reasonCodes.push("targeted_recovery_evidence_digest_mismatch");
    }
    const operationById = new Map(operations.map((operation) => [operation.operationId, operation]));
    const evidenceById = new Map(evidenceRows.map((row) => [row.operationId, row]));
    for (const operationId of TARGETED_RECOVERY_OPERATION_IDS) {
      const expectedTarget = TARGETED_RECOVERY_TARGETS[operationId];
      const operation = operationById.get(operationId);
      const evidence = evidenceById.get(operationId);
      if (
        !operation
        || operation.kind !== "tag_repair"
        || operation.boardId !== expectedTarget.boardId
        || operation.cardId !== expectedTarget.cardId
        || operation.threadId !== expectedTarget.threadId
        || operation.threadState?.archived !== true
        || operation.threadState?.locked !== true
      ) reasonCodes.push(`targeted_recovery_target_mismatch:${operationId}`);
      if (
        !evidence
        || evidence.boardId !== expectedTarget.boardId
        || evidence.cardId !== expectedTarget.cardId
        || evidence.threadId !== expectedTarget.threadId
        || evidence.forumChannelId !== operation?.forumChannelId
        || canonicalJson(evidence.threadState) !== canonicalJson(operation?.threadState)
        || !currentRepair.sameUniqueSet(evidence.appliedTagIds || [], operation?.preimage?.appliedTagIds || [])
      ) reasonCodes.push(`targeted_recovery_evidence_mismatch:${operationId}`);
      if (
        operation?.recoveryFrom?.priorPlanSha256 !== plan?.evidence?.priorPlanFileSha256
        || operation?.recoveryFrom?.priorReceiptSha256 !== plan?.evidence?.priorReceiptFileSha256
      ) reasonCodes.push(`targeted_recovery_provenance_mismatch:${operationId}`);
    }
  }
  return unique(reasonCodes).sort();
}

async function buildLiveScan({ env = process.env, fetchImpl = fetch } = {}) {
  const [boardRegistry, profileRegistry] = await Promise.all([
    forumProfile.readJson(DEFAULT_BOARD_REGISTRY_PATH),
    forumProfile.readJson(DEFAULT_PROFILE_REGISTRY_PATH),
  ]);
  return (await forumProfile.buildLiveForumProfileScan({ boardRegistry, profileRegistry, env, fetchImpl })).receipt;
}

function scanTerminalReasonCodes(plan, scan) {
  const expected = plan.denominator.terminal;
  const reasonCodes = [];
  if (scan?.denominator?.requiredBoardCount !== expected.boards || scan?.denominator?.inspectedBoardCount !== expected.boards) reasonCodes.push("terminal_board_denominator_mismatch");
  if (scan?.denominator?.coverageStatus !== "complete" || scan?.denominator?.uncoveredBoardCount !== 0) reasonCodes.push("terminal_board_coverage_mismatch");
  if (scan?.cards?.currentCardCount !== expected.currentCards) reasonCodes.push("terminal_current_card_denominator_mismatch");
  if (scan?.cards?.totalThreadCount !== expected.totalThreads) reasonCodes.push("terminal_total_thread_denominator_mismatch");
  if (scan?.cards?.healthyCardCount !== expected.healthyCards || scan?.cards?.driftedCardCount !== 0) reasonCodes.push("terminal_card_health_mismatch");
  if (scan?.cards?.retainedLegacyHistoryCount !== expected.retainedLegacyRows) reasonCodes.push("terminal_retained_legacy_mismatch");
  if (scan?.cards?.supersededRecordCount !== expected.supersededRows) reasonCodes.push("terminal_superseded_mismatch");
  if (scan?.cards?.duplicateStableIdentityCount !== 0 || currentEventDuplicates(scan).length > 0) reasonCodes.push("terminal_identity_duplicate");
  if (scan?.cards?.actionableTextIntegrityFindingCount !== 0) reasonCodes.push("terminal_actionable_text_corruption");
  if ((scan?.reasonCodes || []).length > 0) reasonCodes.push(...scan.reasonCodes.map((code) => `terminal_scan_reason:${code}`));
  for (const profile of scan?.cards?.boardProfiles || []) {
    if ((profile?.appliedTagSafety?.orphanAppliedTagIds || []).length > 0) reasonCodes.push(`terminal_orphan_tag:${profile.boardId}`);
  }
  return unique(reasonCodes).sort();
}

async function inspectOwnerOperation(operation, scan, { env = process.env, fetchImpl = fetch } = {}) {
  const rows = currentRows(scan).filter((row) => row.boardId === operation.boardId && row.cardId === operation.cardId);
  if (rows.length > 1) return { status: "blocked", reasonCodes: ["owner_operation_identity_duplicate"] };
  const row = rows[0] || null;
  if (!row) {
    return operation.preimage.exists === false
      ? { status: "pending", reasonCodes: [] }
      : { status: "blocked", reasonCodes: ["owner_operation_target_missing"] };
  }
  const entries = sourceEventEntry(row, operation.eventId);
  if (entries.length > 1) return { status: "blocked", reasonCodes: ["owner_operation_event_duplicate"] };
  if (entries.length === 1) {
    if (entries[0].contentSha256 !== operation.journalSha256) return { status: "blocked", reasonCodes: ["owner_operation_event_content_conflict"] };
    const token = text(env?.DISCORDOS_BOT_TOKEN);
    const starter = await cardContract.fetchMessage({ channelId: row.threadId, messageId: row.threadId, token, fetchImpl });
    if (!starter.ok) return { status: "blocked", reasonCodes: ["owner_operation_starter_read_failed"] };
    const content = String(starter.payload?.content || "");
    const expected = journal.buildCanonicalBody(operation.event, content);
    if (content !== expected || row.state !== operation.event.card.state) return { status: "blocked", reasonCodes: ["owner_operation_postimage_mismatch"] };
    return { status: "complete", threadId: row.threadId, reasonCodes: [] };
  }
  if (operation.preimage.exists === false) return { status: "blocked", reasonCodes: ["owner_operation_unplanned_identity_appeared"] };
  if (row.threadId !== operation.preimage.threadId || row.starterContentSha256 !== operation.preimage.bodySha256) {
    return { status: "blocked", reasonCodes: ["owner_operation_preimage_drift"] };
  }
  return { status: "pending", threadId: row.threadId, reasonCodes: [] };
}

async function readPlannedTagRuntime(operation, { env = process.env, fetchImpl = fetch } = {}) {
  const token = text(env?.DISCORDOS_BOT_TOKEN);
  if (!token) return { ok: false, status: 0, payload: null, reasonCodes: ["discord_bot_token_missing"] };
  try {
    const read = await cardContract.discordRequest({ path: `/channels/${operation.threadId}`, token, fetchImpl });
    return {
      ok: read.ok,
      status: read.status,
      payload: read.payload,
      reasonCodes: read.ok ? [] : ["tag_target_read_failed"],
    };
  } catch {
    return { ok: false, status: 0, payload: null, reasonCodes: ["tag_target_read_rejected"] };
  }
}

async function inspectPlannedTagRuntime(operation, { env = process.env, fetchImpl = fetch } = {}) {
  const read = await readPlannedTagRuntime(operation, { env, fetchImpl });
  const actualAppliedTagIds = read.payload?.applied_tags || [];
  const actualThreadState = {
    archived: read.payload?.thread_metadata?.archived === true,
    locked: read.payload?.thread_metadata?.locked === true,
  };
  const forumExact = read.ok && read.payload?.parent_id === operation.forumChannelId;
  const stateExact = read.ok && canonicalJson(actualThreadState) === canonicalJson(operation.threadState);
  const pending = forumExact && stateExact && currentRepair.sameUniqueSet(actualAppliedTagIds, operation.preimage.appliedTagIds);
  const complete = forumExact && stateExact && currentRepair.sameUniqueSet(actualAppliedTagIds, operation.postimage.appliedTagIds);
  const reasonCodes = [...read.reasonCodes];
  if (read.ok && !forumExact) reasonCodes.push("tag_target_forum_mismatch");
  if (read.ok && !stateExact) reasonCodes.push("tag_target_thread_state_drift");
  if (!pending && !complete && read.ok) reasonCodes.push("tag_target_live_preimage_drift");
  return {
    ok: reasonCodes.length === 0,
    operationId: operation.operationId,
    status: complete ? "complete" : pending ? "pending" : "blocked",
    actualAppliedTagIds,
    actualThreadState,
    httpStatus: read.status,
    reasonCodes: unique(reasonCodes).sort(),
  };
}

async function applyPlannedTagRepair(operation, { env = process.env, fetchImpl = fetch } = {}) {
  const before = await inspectPlannedTagRuntime(operation, { env, fetchImpl });
  if (before.status === "complete") {
    return { ok: true, operationId: operation.operationId, status: "already_complete", writeCount: 0, writeOutcomeUnknownCount: 0, readback: before, reasonCodes: [] };
  }
  if (before.status !== "pending") {
    return { ok: false, operationId: operation.operationId, status: "blocked", writeCount: 0, writeOutcomeUnknownCount: 0, readback: before, reasonCodes: before.reasonCodes };
  }
  if (!operation.threadState.archived && !operation.threadState.locked) {
    const applied = await currentRepair.applyTagRepair(operation, { env, fetchImpl });
    const readback = await inspectPlannedTagRuntime(operation, { env, fetchImpl });
    return {
      ...applied,
      ok: applied.ok && readback.status === "complete",
      status: applied.ok && readback.status === "complete" ? applied.status : "blocked",
      readback,
      reasonCodes: unique([...(applied.reasonCodes || []), ...readback.reasonCodes]).sort(),
    };
  }

  const token = text(env?.DISCORDOS_BOT_TOKEN);
  let writeCount = 0;
  let writeOutcomeUnknownCount = 0;
  const write = async (body) => {
    try {
      const result = await cardContract.discordRequest({
        path: `/channels/${operation.threadId}`,
        token,
        method: "PATCH",
        body,
        fetchImpl,
      });
      if (result.ok) writeCount += 1;
      return { ...result, rejected: false };
    } catch {
      writeOutcomeUnknownCount += 1;
      return { ok: false, status: 0, payload: null, rejected: true };
    }
  };
  const reasonCodes = [];
  const reopen = await write({ archived: false, locked: false });
  if (!reopen.ok) reasonCodes.push(reopen.rejected ? "tag_repair_reopen_outcome_unknown" : "tag_repair_reopen_failed");

  let openRead = null;
  let tagWrite = null;
  if (reopen.ok) {
    openRead = await readPlannedTagRuntime(operation, { env, fetchImpl });
    const openExact = openRead.ok
      && openRead.payload?.parent_id === operation.forumChannelId
      && openRead.payload?.thread_metadata?.archived !== true
      && openRead.payload?.thread_metadata?.locked !== true
      && currentRepair.sameUniqueSet(openRead.payload?.applied_tags || [], operation.preimage.appliedTagIds);
    if (!openExact) reasonCodes.push("tag_repair_reopen_readback_failed");
    if (openExact) {
      tagWrite = await write({ applied_tags: operation.postimage.appliedTagIds });
      if (!tagWrite.ok) reasonCodes.push(tagWrite.rejected ? "tag_repair_write_outcome_unknown" : "tag_repair_write_failed");
    }
  }

  let restore = null;
  const restoreRequired = reopen.ok || reopen.rejected;
  if (restoreRequired) {
    const restoreBody = tagWrite?.ok
      ? operation.threadState
      : { applied_tags: operation.preimage.appliedTagIds, ...operation.threadState };
    restore = await write(restoreBody);
    if (!restore.ok) reasonCodes.push(restore.rejected ? "tag_repair_restore_outcome_unknown" : "tag_repair_restore_failed");
  }
  const readback = await inspectPlannedTagRuntime(operation, { env, fetchImpl });
  const expectedFinalTagIds = tagWrite?.ok
    ? operation.postimage.appliedTagIds
    : operation.preimage.appliedTagIds;
  const finalStateExact = canonicalJson(readback.actualThreadState) === canonicalJson(operation.threadState);
  const finalTagsExact = currentRepair.sameUniqueSet(readback.actualAppliedTagIds, expectedFinalTagIds);
  const restorationVerified = Boolean(
    (!restoreRequired || restore?.ok)
    && finalStateExact
    && finalTagsExact
    && readback.reasonCodes.length === 0
  );
  if (tagWrite?.ok && readback.status !== "complete") reasonCodes.push("tag_repair_readback_failed");
  if (!tagWrite?.ok && readback.status !== "pending") reasonCodes.push("tag_repair_rollback_readback_failed");
  reasonCodes.push(...readback.reasonCodes);
  const critical = Boolean(
    (restoreRequired && !restore?.ok)
    || !finalStateExact
    || (!tagWrite?.ok && !finalTagsExact)
  );
  if (critical) reasonCodes.push("critical_tag_target_lifecycle_unresolved");
  const ok = Boolean(
    reopen.ok
    && tagWrite?.ok
    && restore?.ok
    && restorationVerified
    && readback.status === "complete"
    && writeOutcomeUnknownCount === 0
  );
  return {
    ok,
    operationId: operation.operationId,
    status: ok ? "applied" : "blocked",
    ...(critical ? { critical: true, severity: "Critical" } : { critical: false }),
    writeCount,
    writeOutcomeUnknownCount,
    httpStatus: restore && !restore.ok ? restore.status : tagWrite ? tagWrite.status : reopen.status,
    lifecycle: {
      before: operation.threadState,
      reopen,
      openRead,
      restore,
      restorationVerified,
      finalStateExact,
      finalTagsExact,
    },
    readback,
    reasonCodes: unique(reasonCodes).sort(),
  };
}

function admissionFor(mode, allowApply, env = process.env) {
  if (mode !== "apply") return { requested: false, admitted: false, status: "no_write_mode", reasonCodes: [] };
  const reasonCodes = [];
  if (!allowApply) reasonCodes.push("explicit_allow_apply_flag_missing");
  if (env?.[RECONCILE_ENV] !== RECONCILE_ENV_VALUE) reasonCodes.push("current_live_reconcile_env_guard_missing");
  if (env?.[journal.JOURNAL_ENV] !== journal.JOURNAL_ENV_VALUE) reasonCodes.push("board_card_journal_env_guard_missing");
  if (env?.[completedTransfer.TRANSFER_ENV] !== completedTransfer.TRANSFER_ENV_VALUE) reasonCodes.push("board_completed_transfer_env_guard_missing");
  return { requested: true, admitted: reasonCodes.length === 0, status: reasonCodes.length === 0 ? "apply_admitted" : "blocked", reasonCodes };
}

async function preflightPlan({
  plan,
  planBytes,
  trustedPlanSha256,
  boardRegistry,
  sourceRegistry,
  token,
  mode = "preflight",
  allowApply = false,
  env = process.env,
  fetchImpl = fetch,
  currentScanImpl = buildLiveScan,
} = {}) {
  const reasonCodes = verifyPlanStructure(plan);
  if (sha256(planBytes) !== trustedPlanSha256) reasonCodes.push("trusted_plan_file_digest_mismatch");
  const admission = admissionFor(mode, allowApply, env);
  reasonCodes.push(...admission.reasonCodes);
  const authority = await loadOwnerAuthority({ sourceRegistry, boardRegistry, token, fetchImpl });
  if (canonicalJson(authority.sources) !== canonicalJson(plan?.ownerAuthority?.sources || [])) reasonCodes.push("owner_authority_source_drift");
  if (gitRevision("origin/main") !== plan.discordosOriginMain) reasonCodes.push("discordos_origin_main_drift");
  if (plan.executionScope === "targeted_tag_recovery") {
    const tagStatuses = [];
    for (const operation of plan.operations || []) {
      const inspected = await inspectPlannedTagRuntime(operation, { env, fetchImpl });
      tagStatuses.push(inspected);
      reasonCodes.push(...inspected.reasonCodes.map((code) => `${code}:${operation.operationId}`));
    }
    const allComplete = tagStatuses.every((row) => row.status === "complete");
    const isInitial = tagStatuses.every((row) => row.status === "pending");
    return {
      ok: reasonCodes.length === 0,
      status: reasonCodes.length > 0 ? "blocked" : allComplete ? "terminal_postimage" : "preflight_ready",
      admission,
      authority,
      scan: null,
      isInitial,
      allComplete,
      ownerStatuses: [],
      tagStatuses,
      orderStatus: null,
      transferStatuses: [],
      ownerDryRun: null,
      reasonCodes: unique(reasonCodes).sort(),
    };
  }
  const scan = await currentScanImpl({ env, fetchImpl });
  const initialDigest = sha256(canonicalJson(scanGuardProjection(scan)));
  const isInitial = initialDigest === plan?.evidence?.guardProjectionSha256;
  const ownerStatuses = [];
  for (const operation of (plan.operations || []).filter((row) => row.kind === "owner_event")) {
    const inspected = await inspectOwnerOperation(operation, scan, { env, fetchImpl });
    ownerStatuses.push({ operationId: operation.operationId, ...inspected });
    reasonCodes.push(...inspected.reasonCodes.map((code) => `${code}:${operation.operationId}`));
  }
  const ownerStatusById = new Map(ownerStatuses.map((row) => [row.operationId, row]));
  const tagStatuses = [];
  for (const operation of (plan.operations || []).filter((row) => row.kind === "tag_repair")) {
    let threadId = operation.threadId;
    if (!threadId && operation.dependsOnOwnerOperationId) threadId = ownerStatusById.get(operation.dependsOnOwnerOperationId)?.threadId || null;
    if (!threadId && ownerStatusById.get(operation.dependsOnOwnerOperationId)?.status === "pending") {
      tagStatuses.push({ operationId: operation.operationId, status: "pending_dependency" });
      continue;
    }
    if (!threadId) {
      reasonCodes.push(`tag_dependency_unresolved:${operation.operationId}`);
      tagStatuses.push({ operationId: operation.operationId, status: "blocked" });
      continue;
    }
    const inspected = await inspectPlannedTagRuntime({ ...operation, threadId }, { env, fetchImpl });
    tagStatuses.push(inspected);
    reasonCodes.push(...(inspected.reasonCodes || []).map((code) => `${code}:${operation.operationId}`));
  }
  const orderOperation = (plan.operations || []).find((row) => row.kind === "forum_order_repair") || null;
  const orderStatus = orderOperation ? await currentRepair.inspectOrderRuntime(orderOperation, { env, fetchImpl }) : null;
  reasonCodes.push(...(orderStatus?.reasonCodes || []).map((code) => `${code}:order-01`));
  const transferStatuses = [];
  for (const operation of (plan.operations || []).filter((row) => row.kind === "completed_transfer")) {
    const inspected = await currentRepair.inspectTransferRuntime(operation, { env, fetchImpl });
    transferStatuses.push(inspected);
    reasonCodes.push(...(inspected.reasonCodes || []).map((code) => `${code}:${operation.operationId}`));
  }
  const pendingOwnerEvents = (plan.operations || []).filter((operation) =>
    operation.kind === "owner_event" && ownerStatusById.get(operation.operationId)?.status === "pending"
  );
  let ownerDryRun = null;
  if (pendingOwnerEvents.length > 0 && reasonCodes.length === 0) {
    ownerDryRun = await journal.buildBoardCardJournal({
      payload: { schemaVersion: ownerSeed.BATCH_CONTRACT, events: pendingOwnerEvents.map((operation) => operation.event) },
      allowApply: false,
      apply: false,
      env,
      fetchImpl,
      registry: boardRegistry,
      registryPath: DEFAULT_BOARD_REGISTRY_PATH,
      registryScanImpl: async () => journalIdentityProjection(scan),
    });
    if (!ownerDryRun.ok) reasonCodes.push(...ownerDryRun.reasonCodes.map((code) => `owner_dry_run:${code}`));
  }
  const allComplete = ownerStatuses.every((row) => row.status === "complete")
    && tagStatuses.every((row) => row.status === "complete")
    && (!orderStatus || orderStatus.status === "complete")
    && transferStatuses.every((row) => row.status === "complete" && row.complete === true);
  if (!isInitial && !allComplete) reasonCodes.push("live_state_neither_exact_preimage_nor_exact_postimage");
  if (allComplete) reasonCodes.push(...scanTerminalReasonCodes(plan, scan));
  return {
    ok: reasonCodes.length === 0,
    status: reasonCodes.length > 0 ? "blocked" : allComplete ? "terminal_postimage" : "preflight_ready",
    admission,
    authority,
    scan,
    isInitial,
    allComplete,
    ownerStatuses,
    tagStatuses,
    orderStatus,
    transferStatuses,
    ownerDryRun,
    reasonCodes: unique(reasonCodes).sort(),
  };
}

function countedDiscordFetch(fetchImpl = fetch) {
  const state = { confirmedWrites: 0, unknownWriteOutcomes: 0 };
  const wrapped = async (url, init = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    const isDiscordWrite = String(url).startsWith(cardContract.DISCORD_API_BASE) && !["GET", "HEAD"].includes(method);
    try {
      const response = await fetchImpl(url, init);
      if (isDiscordWrite && response?.ok) state.confirmedWrites += 1;
      else if (isDiscordWrite && Number(response?.status) >= 500) state.unknownWriteOutcomes += 1;
      return response;
    } catch (error) {
      if (isDiscordWrite) state.unknownWriteOutcomes += 1;
      throw error;
    }
  };
  return { fetchImpl: wrapped, state };
}

async function runApply({ plan, preflight, boardRegistry, env = process.env, fetchImpl = fetch, currentScanImpl = buildLiveScan }) {
  if (!preflight.ok || preflight.status === "blocked") throw new Error("apply_without_successful_preflight");
  if (preflight.allComplete) {
    return {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      eventId: EVENT_ID,
      ok: true,
      status: "idempotent_replay",
      mode: "apply",
      planDigestSha256: plan.planDigestSha256,
      mutatesDiscord: false,
      discordMutations: 0,
      discordMutationOutcomesUnknown: 0,
      operationReceipts: [],
      reconciliation: plan.executionScope === "targeted_tag_recovery"
        ? { status: "terminal", touchedTagPostimages: preflight.tagStatuses }
        : { status: "terminal", scan: preflight.scan },
      blockedSubsets: plan.ownerAuthority.blockedSubsets,
      reasonCodes: [],
    };
  }
  const counted = countedDiscordFetch(fetchImpl);
  const operationReceipts = [];
  const ownerOperations = plan.operations.filter((operation) => operation.kind === "owner_event");
  const ownerPending = ownerOperations.filter((operation) =>
    preflight.ownerStatuses.find((row) => row.operationId === operation.operationId)?.status === "pending"
  );
  let ownerApply = null;
  if (ownerPending.length > 0) {
    ownerApply = await journal.buildBoardCardJournal({
      payload: { schemaVersion: ownerSeed.BATCH_CONTRACT, events: ownerPending.map((operation) => operation.event) },
      allowApply: true,
      apply: true,
      env,
      fetchImpl: counted.fetchImpl,
      registry: boardRegistry,
      registryPath: DEFAULT_BOARD_REGISTRY_PATH,
      registryScanImpl: async () => journalIdentityProjection(preflight.scan),
    });
    for (let index = 0; index < ownerPending.length; index += 1) {
      operationReceipts.push({ operationId: ownerPending[index].operationId, kind: "owner_event", ...ownerApply.results[index] });
    }
  }
  const ownerResultById = new Map(operationReceipts.filter((row) => row.kind === "owner_event").map((row) => [row.operationId, row]));
  for (const status of preflight.ownerStatuses.filter((row) => row.status === "complete")) {
    operationReceipts.push({ operationId: status.operationId, kind: "owner_event", ok: true, status: "already_complete", threadId: status.threadId });
    ownerResultById.set(status.operationId, operationReceipts.at(-1));
  }

  let criticalTagBarrier = false;
  for (const operation of plan.operations.filter((row) => row.kind === "tag_repair")) {
    if (criticalTagBarrier) {
      operationReceipts.push({
        operationId: operation.operationId,
        kind: operation.kind,
        ok: false,
        status: "not_run",
        writeCount: 0,
        writeOutcomeUnknownCount: 0,
        severity: "Critical",
        reasonCodes: ["prior_target_lifecycle_unresolved"],
      });
      continue;
    }
    const preStatus = preflight.tagStatuses.find((row) => row.operationId === operation.operationId);
    if (preStatus?.status === "complete") {
      operationReceipts.push({ operationId: operation.operationId, kind: operation.kind, ok: true, status: "already_complete", writeCount: 0 });
      continue;
    }
    let threadId = operation.threadId;
    if (operation.dependsOnOwnerOperationId) {
      const ownerResult = ownerResultById.get(operation.dependsOnOwnerOperationId);
      if (!ownerResult?.ok || !ownerResult.threadId) {
        operationReceipts.push({ operationId: operation.operationId, kind: operation.kind, ok: false, status: "blocked", reasonCodes: ["owner_event_dependency_failed"] });
        continue;
      }
      threadId = ownerResult.threadId;
    }
    const receipt = await applyPlannedTagRepair({ ...operation, threadId }, { env, fetchImpl: counted.fetchImpl });
    operationReceipts.push({ ...receipt, kind: operation.kind });
    if (receipt.critical === true) criticalTagBarrier = true;
  }

  for (const operation of ownerPending) {
    const ownerResult = ownerResultById.get(operation.operationId);
    if (!ownerResult?.ok || !ownerResult.threadId) continue;
    if (criticalTagBarrier) {
      operationReceipts.push({
        operationId: `${operation.operationId}-reaction`,
        kind: "owner_reaction",
        ok: false,
        status: "not_run",
        writeCount: 0,
        severity: "Critical",
        reasonCodes: ["prior_target_lifecycle_unresolved"],
      });
      continue;
    }
    const reaction = await cardContract.ensureRequiredReaction({
      channelId: ownerResult.threadId,
      messageId: ownerResult.threadId,
      token: text(env?.DISCORDOS_BOT_TOKEN),
      emoji: operation.requiredReaction,
      fetchImpl: counted.fetchImpl,
    });
    operationReceipts.push({ operationId: `${operation.operationId}-reaction`, kind: "owner_reaction", ok: reaction.ok, status: reaction.status, threadId: ownerResult.threadId, reaction });
  }

  const orderOperation = plan.operations.find((operation) => operation.kind === "forum_order_repair");
  if (orderOperation) {
    if (criticalTagBarrier) {
      operationReceipts.push({ operationId: orderOperation.operationId, kind: orderOperation.kind, ok: false, status: "not_run", writeCount: 0, severity: "Critical", reasonCodes: ["prior_target_lifecycle_unresolved"] });
    } else if (preflight.orderStatus?.status === "complete") {
      operationReceipts.push({ operationId: orderOperation.operationId, kind: orderOperation.kind, ok: true, status: "already_complete", writeCount: 0 });
    } else {
      const receipt = await currentRepair.applyOrderRepair(orderOperation, { env, fetchImpl: counted.fetchImpl });
      operationReceipts.push({ ...receipt, kind: orderOperation.kind });
    }
  }

  for (const operation of plan.operations.filter((row) => row.kind === "completed_transfer")) {
    const status = preflight.transferStatuses.find((row) => row.operationId === operation.operationId);
    if (status?.status === "complete" && status.complete === true) {
      operationReceipts.push({ operationId: operation.operationId, kind: operation.kind, ok: true, status: "already_complete", writeCount: 0 });
      continue;
    }
    if (criticalTagBarrier) {
      operationReceipts.push({
        operationId: operation.operationId,
        kind: operation.kind,
        ok: false,
        status: "not_run",
        writeCount: 0,
        severity: "Critical",
        reasonCodes: ["prior_target_lifecycle_unresolved"],
      });
      continue;
    }
    const receipt = await completedTransfer.buildCompletedBoardTransfer({
      sourceThreadId: operation.source.threadId,
      sourceForumChannelId: operation.source.forumChannelId,
      completedForumChannelId: operation.destination.forumChannelId,
      completedTagIds: operation.destination.appliedTagIds,
      cardId: operation.source.cardId,
      project: operation.source.project,
      type: operation.source.type,
      priority: operation.source.priority,
      owner: operation.source.owner,
      eventId: operation.event.eventId,
      occurredAt: operation.event.occurredAt,
      evidence: operation.event.evidence,
      requireStableIdentity: true,
      sourceContentPreimage: operation.source.content,
      sourceTitlePreimage: operation.source.title,
      repairExactPostimage: true,
      allowApply: true,
      apply: true,
      env,
      fetchImpl: counted.fetchImpl,
    });
    const validation = currentRepair.validateTransferReceipt(operation, receipt);
    operationReceipts.push({ operationId: operation.operationId, kind: operation.kind, ok: validation.ok, status: validation.ok ? receipt.status : "blocked", receipt, validation });
  }

  if (plan.executionScope === "targeted_tag_recovery") {
    const touchedTagPostimages = [];
    const terminalReasons = [];
    for (const operation of plan.operations) {
      const inspected = await inspectPlannedTagRuntime(operation, { env, fetchImpl: counted.fetchImpl });
      touchedTagPostimages.push(inspected);
      if (inspected.status !== "complete") terminalReasons.push(`terminal_tag_incomplete:${operation.operationId}`);
    }
    const operationFailures = operationReceipts.filter((row) => row.ok === false);
    terminalReasons.push(...operationFailures.map((row) => `operation_failed:${row.operationId}`));
    if (operationReceipts.some((row) => row.critical === true)) terminalReasons.push("critical_target_lifecycle_unresolved");
    if (counted.state.confirmedWrites > plan.mutationCap.maxConfirmedDiscordWrites) terminalReasons.push("mutation_cap_exceeded");
    if (counted.state.unknownWriteOutcomes > 0) terminalReasons.push("discord_write_outcome_unknown");
    return {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      eventId: EVENT_ID,
      ok: terminalReasons.length === 0,
      status: terminalReasons.length === 0 ? "applied_and_reconciled" : "blocked_after_partial_apply",
      mode: "apply",
      planDigestSha256: plan.planDigestSha256,
      mutatesDiscord: counted.state.confirmedWrites > 0 || counted.state.unknownWriteOutcomes > 0,
      discordMutations: counted.state.confirmedWrites,
      discordMutationOutcomesUnknown: counted.state.unknownWriteOutcomes,
      mutationCap: plan.mutationCap,
      ownerApply,
      operationReceipts,
      reconciliation: { status: terminalReasons.length === 0 ? "terminal" : "blocked", touchedTagPostimages },
      blockedSubsets: plan.ownerAuthority.blockedSubsets,
      unresolvedRegisteredSources: plan.ownerAuthority.unresolvedRegisteredSources,
      excludedProjects: plan.ownerAuthority.excludedProjects,
      reasonCodes: unique(terminalReasons).sort(),
    };
  }

  const finalScan = await currentScanImpl({ env, fetchImpl: counted.fetchImpl });
  const terminalReasons = scanTerminalReasonCodes(plan, finalScan);
  const postTransferInspections = [];
  for (const operation of plan.operations.filter((row) => row.kind === "completed_transfer")) {
    const inspected = await currentRepair.inspectTransferRuntime(operation, { env, fetchImpl: counted.fetchImpl });
    postTransferInspections.push(inspected);
    if (!inspected.ok || inspected.status !== "complete" || inspected.complete !== true) terminalReasons.push(`terminal_transfer_incomplete:${operation.operationId}`);
  }
  const operationFailures = operationReceipts.filter((row) => row.ok === false);
  if (operationFailures.length > 0) terminalReasons.push(...operationFailures.map((row) => `operation_failed:${row.operationId}`));
  if (counted.state.confirmedWrites > plan.mutationCap.maxConfirmedDiscordWrites) terminalReasons.push("mutation_cap_exceeded");
  if (counted.state.unknownWriteOutcomes > 0) terminalReasons.push("discord_write_outcome_unknown");
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    eventId: EVENT_ID,
    ok: terminalReasons.length === 0,
    status: terminalReasons.length === 0 ? "applied_and_reconciled" : "blocked_after_partial_apply",
    mode: "apply",
    planDigestSha256: plan.planDigestSha256,
    mutatesDiscord: counted.state.confirmedWrites > 0 || counted.state.unknownWriteOutcomes > 0,
    discordMutations: counted.state.confirmedWrites,
    discordMutationOutcomesUnknown: counted.state.unknownWriteOutcomes,
    mutationCap: plan.mutationCap,
    ownerApply,
    operationReceipts,
    reconciliation: { status: terminalReasons.length === 0 ? "terminal" : "blocked", scan: finalScan, transferPostimages: postTransferInspections },
    blockedSubsets: plan.ownerAuthority.blockedSubsets,
    unresolvedRegisteredSources: plan.ownerAuthority.unresolvedRegisteredSources,
    excludedProjects: plan.ownerAuthority.excludedProjects,
    reasonCodes: unique(terminalReasons).sort(),
  };
}

function renderMarkdown(receipt) {
  return [
    "# DiscordOS Current-Live Board Reconciliation",
    "",
    `- status: \`${receipt.status}\``,
    `- mode: \`${receipt.mode}\``,
    `- plan digest: \`${receipt.planDigestSha256 || "none"}\``,
    `- Discord mutations: \`${receipt.discordMutations || 0}\``,
    `- Discord mutation outcomes unknown: \`${receipt.discordMutationOutcomesUnknown || 0}\``,
    `- reason codes: \`${receipt.reasonCodes?.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [boardRegistry, sourceRegistry] = await Promise.all([
    forumProfile.readJson(DEFAULT_BOARD_REGISTRY_PATH),
    forumProfile.readJson(options.sourceRegistryPath),
  ]);
  const githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
  if (options.mode === "generate_recovery") {
    const [priorPlan, priorReceipt] = await Promise.all([
      readJsonWithBytes(options.priorPlanPath),
      readJsonWithBytes(options.priorReceiptPath),
    ]);
    const plan = await buildTargetedRecoveryPlan({
      priorPlan: priorPlan.value,
      priorPlanBytes: priorPlan.bytes,
      trustedPriorPlanSha256: options.priorPlanSha256,
      priorReceipt: priorReceipt.value,
      priorReceiptBytes: priorReceipt.bytes,
      trustedPriorReceiptSha256: options.priorReceiptSha256,
    });
    await writeJson(options.outputPath, plan);
    process.stdout.write(options.json ? `${JSON.stringify(plan, null, 2)}\n` : `plan_ready: ${plan.planDigestSha256}\n`);
    return;
  }
  if (options.mode === "generate_plan") {
    const evidence = await readJsonWithBytes(options.evidencePath);
    const authority = await loadOwnerAuthority({ sourceRegistry, boardRegistry, token: githubToken });
    const plan = await buildDeterministicPlan({
      scan: evidence.value,
      evidenceBytes: evidence.bytes,
      boardRegistry,
      sourceRegistry,
      authority,
      structureOnly: options.structureOnly,
    });
    await writeJson(options.outputPath, plan);
    process.stdout.write(options.json ? `${JSON.stringify(plan, null, 2)}\n` : `plan_ready: ${plan.planDigestSha256}\n`);
    return;
  }
  const planFile = await readJsonWithBytes(options.planPath);
  const preflight = await preflightPlan({
    plan: planFile.value,
    planBytes: planFile.bytes,
    trustedPlanSha256: options.planSha256,
    boardRegistry,
    sourceRegistry,
    token: githubToken,
    mode: options.mode,
    allowApply: options.allowApply,
  });
  if (options.mode !== "apply") {
    const receipt = {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      eventId: EVENT_ID,
      ok: preflight.ok,
      status: preflight.ok ? (options.mode === "dry_run" ? "dry_run_ready" : preflight.status) : "blocked",
      mode: options.mode,
      planDigestSha256: planFile.value.planDigestSha256,
      mutatesDiscord: false,
      discordMutations: 0,
      discordMutationOutcomesUnknown: 0,
      operationCounts: planFile.value.operationCounts,
      runtimePreflight: {
        isInitial: preflight.isInitial,
        allComplete: preflight.allComplete,
        ownerStatuses: preflight.ownerStatuses,
        tagStatuses: preflight.tagStatuses,
        orderStatus: preflight.orderStatus,
        transferStatuses: preflight.transferStatuses,
        ownerDryRun: preflight.ownerDryRun,
      },
      blockedSubsets: planFile.value.ownerAuthority.blockedSubsets,
      reasonCodes: preflight.reasonCodes,
    };
    if (options.outputPath) await writeJson(options.outputPath, receipt);
    process.stdout.write(options.json ? `${JSON.stringify(receipt, null, 2)}\n` : renderMarkdown(receipt));
    if (!receipt.ok) process.exitCode = 1;
    return;
  }
  let receipt;
  if (!preflight.ok) {
    receipt = {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      eventId: EVENT_ID,
      ok: false,
      status: "blocked",
      mode: "apply",
      planDigestSha256: planFile.value.planDigestSha256,
      mutatesDiscord: false,
      discordMutations: 0,
      discordMutationOutcomesUnknown: 0,
      blockedSubsets: planFile.value.ownerAuthority.blockedSubsets,
      reasonCodes: preflight.reasonCodes,
    };
  } else {
    receipt = await runApply({ plan: planFile.value, preflight, boardRegistry });
  }
  await writeJson(options.outputPath, receipt);
  process.stdout.write(options.json ? `${JSON.stringify(receipt, null, 2)}\n` : renderMarkdown(receipt));
  if (!receipt.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  _internals: {
    PLAN_SCHEMA_VERSION,
    RECEIPT_SCHEMA_VERSION,
    SOURCE_SCHEMA_VERSION,
    EVENT_ID,
    RECONCILE_ENV,
    RECONCILE_ENV_VALUE,
    DEFAULT_SOURCE_REGISTRY_PATH,
    sha256,
    canonicalJson,
    objectDigest,
    parseArgs,
    validateSourceRegistry,
    loadOwnerAuthority,
    scanGuardProjection,
    journalIdentityProjection,
    currentEventDuplicates,
    ownerEventDesiredTagNames,
    buildOwnerOperations,
    buildTagOperations,
    buildOrderOperation,
    buildTransferOperations,
    buildDeterministicPlan,
    buildTargetedRecoveryPlan,
    verifyPlanStructure,
    scanTerminalReasonCodes,
    inspectOwnerOperation,
    readPlannedTagRuntime,
    inspectPlannedTagRuntime,
    applyPlannedTagRepair,
    admissionFor,
    preflightPlan,
    countedDiscordFetch,
    runApply,
  },
};
