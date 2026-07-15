const path = require("node:path");
const crypto = require("node:crypto");
const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");
const {
  _internals: journal,
} = require("./discordos-board-card-journal");
const {
  _internals: boardRegistry,
} = require("./discordos-board-registry");
const {
  _internals: textIntegrity,
} = require("./discordos-board-text-integrity");

const MUSIC_SESH_PHASE_8_THREAD_ID = "1508141153835421798";
const MUSIC_SESH_PHASE_8_CARD_ID = "music-sesh-phase-8-cross-service-room-sync-simple-controls";

function legacyDisposition(boardId, threadId, managed) {
  if (managed) return null;
  if (boardId === "music-sesh-active" && threadId === MUSIC_SESH_PHASE_8_THREAD_ID) {
    return { classification: "active_managed_candidate", cardId: MUSIC_SESH_PHASE_8_CARD_ID };
  }
  if (boardId === "music-sesh-active") return { classification: "retained_legacy_history", cardId: null };
  if (boardId === "legacy-general-feedback") return { classification: "retained_unresolved_legacy", cardId: null };
  return null;
}

const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, "..", "config", "discordos-board-registry.json");
const FORUM_CHANNEL_TYPE = 15;
const NON_DELETABLE_SYSTEM_MESSAGE_TYPES = new Set([1, 2, 3, 4, 5, 21]);

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = { inputPath: null, registryPath: null, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      options.inputPath = path.resolve(readValue(args, index, "missing_input_path"));
      index += 1;
    } else if (arg === "--registry") {
      options.registryPath = path.resolve(readValue(args, index, "missing_registry_path"));
      index += 1;
    } else if (arg === "--json") options.json = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (options.inputPath && options.registryPath) throw new Error("input_and_registry_mutually_exclusive");
  if (!options.inputPath && !options.registryPath) options.registryPath = DEFAULT_REGISTRY_PATH;
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function journalIntegrityEntries(messages) {
  return (Array.isArray(messages) ? messages : []).flatMap((message) => {
    const eventId = String(message?.content || "").match(/ATLAS-JOURNAL-EVENT-ID:\s*`([^`]+)`/i)?.[1]?.trim();
    return eventId ? [{ eventId, contentSha256: sha256(message.content) }] : [];
  }).sort((left, right) => left.eventId.localeCompare(right.eventId));
}

function inspectTextSurface({
  boardId,
  threadId,
  messageId = null,
  messageType = null,
  messageAuthorId = null,
  messageAuthorBot = null,
  surface,
  value,
}) {
  const classification = textIntegrity.classifyText(String(value || ""));
  return classification.findings.map((finding) => ({
    boardId,
    threadId,
    messageId,
    surface,
    messageType,
    messageAuthorId,
    messageAuthorBot,
    nonDeletableSystemMessage: Number.isInteger(messageType)
      && NON_DELETABLE_SYSTEM_MESSAGE_TYPES.has(messageType),
    pattern: finding.pattern,
    start: finding.start,
    end: finding.end,
    text: finding.text,
    codePoints: finding.codePoints,
    ...(finding.decodedText ? {
      decodedText: finding.decodedText,
      decodedCodePoints: finding.decodedCodePoints,
    } : {}),
  }));
}

function inspectThreadTextIntegrity({ board, thread, starter, messages }) {
  const findings = [
    ...inspectTextSurface({
      boardId: board.id,
      threadId: thread.id,
      surface: "title",
      value: thread?.name,
    }),
    ...inspectTextSurface({
      boardId: board.id,
      threadId: thread.id,
      messageId: starter?.id || thread.id,
      surface: "starter",
      value: starter?.content,
    }),
  ];
  for (const message of Array.isArray(messages) ? messages : []) {
    findings.push(...inspectTextSurface({
      boardId: board.id,
      threadId: thread.id,
      messageId: message?.id || null,
      messageType: Number.isInteger(message?.type) ? message.type : null,
      messageAuthorId: message?.author?.id || null,
      messageAuthorBot: message?.author?.bot === true,
      surface: "journal",
      value: message?.content,
    }));
  }
  const patternCounts = {};
  const surfaceCounts = {};
  for (const finding of findings) {
    patternCounts[finding.pattern] = (patternCounts[finding.pattern] || 0) + 1;
    surfaceCounts[finding.surface] = (surfaceCounts[finding.surface] || 0) + 1;
  }
  return {
    ok: findings.length === 0,
    findingCount: findings.length,
    patternCounts,
    surfaceCounts,
    findings,
  };
}

function inspectThread({ board, thread, starter, messages }) {
  const content = String(starter?.content || "");
  const supersededThreadId = content.match(/ATLAS-SUPERSEDED-CARD:\s*`([0-9]+)`/i)?.[1] || null;
  const inspectedTextIntegrity = inspectThreadTextIntegrity({ board, thread, starter, messages });
  const immutableSystemHistoryFindings = supersededThreadId
    ? inspectedTextIntegrity.findings.filter((finding) => finding.nonDeletableSystemMessage)
    : [];
  const actionableFindings = inspectedTextIntegrity.findings.filter((finding) =>
    !supersededThreadId || !finding.nonDeletableSystemMessage
  );
  const textIntegrityResult = {
    ...inspectedTextIntegrity,
    ok: actionableFindings.length === 0,
    actionableFindingCount: actionableFindings.length,
    actionableFindings,
    immutableSystemHistoryFindingCount: immutableSystemHistoryFindings.length,
    immutableSystemHistoryFindings,
  };
  const textReasonCodes = [];
  if (actionableFindings.some((finding) => finding.surface === "title")) textReasonCodes.push("card_title_encoding_corrupt");
  if (actionableFindings.some((finding) => finding.surface === "starter")) textReasonCodes.push("card_starter_encoding_corrupt");
  if (actionableFindings.some((finding) => finding.surface === "journal")) textReasonCodes.push("card_history_encoding_corrupt");
  if (supersededThreadId) {
    const archived = thread?.thread_metadata?.archived === true;
    const locked = thread?.thread_metadata?.locked === true;
    const reasonCodes = [...textReasonCodes];
    if (!archived) reasonCodes.push("superseded_card_not_archived");
    return {
      ok: reasonCodes.length === 0,
      boardId: board.id,
      boardRole: board.role,
      threadId: thread.id,
      title: thread.name || null,
      cardId: null,
      state: "superseded",
      archived,
      locked,
      appliedTagIds: Array.isArray(thread?.applied_tags) ? [...thread.applied_tags] : [],
      superseded: true,
      supersededThreadId,
      completedThreadIdLink: null,
      sourceThreadIdLink: null,
      journalPresent: hasJournal(messages),
      starterContentSha256: starter ? sha256(content) : null,
      journalIntegrityEntries: journalIntegrityEntries(messages),
      textIntegrity: textIntegrityResult,
      reasonCodes,
    };
  }
  const cardId = parseCardId(content);
  const state = parseCardState(content);
  const parsedCard = journal.parseManagedCardBody(content);
  const disposition = legacyDisposition(board.id, thread.id, Boolean(parsedCard));
  const autonomy = journal.evaluateAutonomyAdmission({
    ...(parsedCard || {}),
    title: thread?.name || "",
  });
  const archived = thread?.thread_metadata?.archived === true;
  const locked = thread?.thread_metadata?.locked === true;
  const completedThreadIdLink = content.match(/ATLAS-COMPLETED-CARD:\s*https:\/\/discord\.com\/channels\/[^/]+\/([0-9]+)/i)?.[1] || null;
  if (disposition?.classification?.startsWith("retained_")) {
    return {
      ok: true,
      boardId: board.id,
      boardRole: board.role,
      threadId: thread.id,
      title: thread.name || null,
      cardId: null,
      state: null,
      priority: null,
      owner: null,
      archived,
      locked,
      appliedTagIds: Array.isArray(thread?.applied_tags) ? [...thread.applied_tags] : [],
      completedThreadIdLink: null,
      sourceThreadIdLink: null,
      journalPresent: hasJournal(messages),
      starterContentSha256: starter ? sha256(content) : null,
      journalIntegrityEntries: journalIntegrityEntries(messages),
      autonomy,
      superseded: false,
      retainedLegacyHistory: true,
      legacyClassification: disposition.classification,
      semanticStatus: "semantic_unknown_preserved",
      textIntegrity: textIntegrityResult,
      retainedReasonCodes: textReasonCodes,
      reasonCodes: [],
    };
  }
  const reasonCodes = [];
  if (!starter) reasonCodes.push("card_starter_message_missing");
  if (!cardId) reasonCodes.push("stable_card_id_missing");
  if (!content.includes(journal.CARD_START) || !content.includes(journal.CARD_END)) {
    reasonCodes.push("canonical_card_body_missing");
  }
  if (!state) reasonCodes.push("canonical_card_state_missing");
  if (!/^- updated:\s*`[^`]+`/im.test(content)) reasonCodes.push("canonical_updated_timestamp_missing");
  if (!hasJournal(messages)) reasonCodes.push("card_journal_history_missing");
  const canonicalTitle = cardContract.formatCanonicalCardTitle({ board, card: { title: thread?.name || "" } });
  if (cardContract.normalizeThreadTitle(canonicalTitle) !== cardContract.normalizeThreadTitle(thread?.name || "")) {
    reasonCodes.push("canonical_card_title_mismatch");
  }
  if (state === journal.AUTONOMOUS_EXECUTION_STATE && !autonomy.admitted) {
    reasonCodes.push("ready_card_autonomy_contract_incomplete");
  }
  reasonCodes.push(...textReasonCodes);
  if (board.role === "active") {
    if (state && journal.ACTIVE_STATES.has(state) && archived && !completedThreadIdLink) {
      reasonCodes.push("active_card_archived");
    }
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
    cardId: cardId || disposition?.cardId || null,
    state,
    type: parsedCard?.type || null,
    priority: parsedCard?.priority || null,
    owner: parsedCard?.owner || null,
    archived,
    locked,
    appliedTagIds: Array.isArray(thread?.applied_tags) ? [...thread.applied_tags] : [],
    completedThreadIdLink,
    sourceThreadIdLink: content.match(/original card:\s*https:\/\/discord\.com\/channels\/[^/]+\/([0-9]+)/i)?.[1] || null,
    journalPresent: hasJournal(messages),
    starterContentSha256: starter ? sha256(content) : null,
    journalIntegrityEntries: journalIntegrityEntries(messages),
    autonomy,
    superseded: false,
    retainedLegacyHistory: false,
    legacyClassification: disposition?.classification || null,
    textIntegrity: textIntegrityResult,
    reasonCodes,
  };
}

async function listThreads({ board, guildId, token, fetchImpl = fetch }) {
  return journal.listForumThreads({
    forumChannelId: board.forumChannelId,
    guildId,
    token,
    fetchImpl,
  });
}

function classifyIdentities(rows) {
  const grouped = new Map();
  for (const row of rows.filter((candidate) => candidate.cardId)) {
    const key = row.cardId.toLowerCase();
    const values = grouped.get(key) || [];
    values.push(row);
    grouped.set(key, values);
  }
  const duplicates = [];
  const linkedPairs = [];
  for (const [cardId, values] of grouped.entries()) {
    if (values.length < 2) continue;
    const completed = values.find((row) => row.boardRole === "completed");
    const source = values.find((row) => row.boardRole === "active");
    const isReciprocalPair = values.length === 2
      && completed
      && source
      && source.archived
      && source.completedThreadIdLink === completed.threadId
      && completed.sourceThreadIdLink === source.threadId;
    const locations = values.map((row) => ({ boardId: row.boardId, threadId: row.threadId }));
    if (isReciprocalPair) linkedPairs.push({ cardId, locations });
    else duplicates.push({ cardId, locations });
  }
  return { duplicates, linkedPairs };
}

function findDuplicates(rows) {
  return classifyIdentities(rows).duplicates;
}

function normalizeLegacyBoards(payload) {
  return Array.isArray(payload?.boards) ? payload.boards.map((board) => ({
    id: text(board?.id),
    project: text(board?.project) || text(board?.id),
    required: true,
    forumChannelId: text(board?.forumChannelId),
    forumChannelName: text(board?.forumChannelName) || null,
    role: text(board?.role).toLowerCase(),
    status: "enabled",
    sourceAdapter: "legacy-input",
    stableCardNamespace: text(board?.stableCardNamespace) || text(board?.id),
    blockerCodes: [],
  })) : [];
}

function registryBoards(registry) {
  return (Array.isArray(registry?.boards) ? registry.boards : []).map(boardRegistry.boardSummary);
}

function coverageResult({ inventorySource, registeredBoards, uncoveredBoards = [], excludedBoards = [], evaluated }) {
  const enabledBoards = registeredBoards.filter((board) => board.status === "enabled");
  const blockedBoards = registeredBoards.filter((board) => board.status === "blocked");
  return {
    inventorySource,
    coverageStatus: evaluated
      ? blockedBoards.some((board) => board.required) || uncoveredBoards.length > 0
        ? "blocked"
        : "complete"
      : "not_evaluated",
    registeredBoardCount: registeredBoards.length,
    requiredBoardCount: registeredBoards.filter((board) => board.required).length,
    enabledBoardCount: enabledBoards.length,
    blockedBoardCount: blockedBoards.length,
    uncoveredBoardCount: uncoveredBoards.length,
    excludedBoardCount: excludedBoards.length,
    registeredBoards,
    enabledBoards,
    blockedBoards,
    uncoveredBoards,
    excludedBoards,
  };
}

async function discoverRegistryForums({ registry, token, fetchImpl = fetch }) {
  const response = await cardContract.discordRequest({
    path: `/guilds/${registry.guildId}/channels`,
    token,
    fetchImpl,
  });
  if (!response.ok || !Array.isArray(response.payload)) {
    return { ok: false, uncoveredBoards: [], excludedBoards: [], reasonCodes: ["board_registry_live_forum_discovery_failed"] };
  }
  const categoryId = text(registry?.discovery?.forumCategoryChannelId);
  const resolution = boardRegistry.resolveBoardChannelIdentities({ registry, channels: response.payload });
  const exclusions = new Map((registry?.discovery?.excludedForumChannelIds || []).map((entry) => [text(entry?.channelId), entry]));
  const registeredChannelIds = new Set((resolution.registry?.boards || []).map((board) => text(board?.forumChannelId)).filter(Boolean));
  const forums = response.payload.filter((channel) => channel?.type === FORUM_CHANNEL_TYPE && channel?.parent_id === categoryId);
  const excludedBoards = response.payload.filter((channel) => exclusions.has(channel.id)).map((channel) => ({
    channelId: channel.id,
    channelName: channel.name || null,
    reason: text(exclusions.get(channel.id)?.reason) || "registry_exclusion",
  }));
  const uncoveredBoards = forums.filter((channel) => !exclusions.has(channel.id) && !registeredChannelIds.has(channel.id)).map((channel) => ({
    channelId: channel.id,
    channelName: channel.name || null,
    parentId: channel.parent_id || null,
  }));
  return {
    ok: uncoveredBoards.length === 0 && resolution.ok,
    resolvedRegistry: resolution.registry,
    identityResolution: resolution.rows,
    uncoveredBoards,
    excludedBoards,
    reasonCodes: [
      ...resolution.reasonCodes,
      ...uncoveredBoards.map((board) => `uncovered_live_board:${board.channelId}`),
    ],
  };
}

function emptyConsistencyResult({ coverage, status = "blocked", reasonCodes = [] }) {
  return {
    ok: false,
    status,
    ...coverage,
    boardCount: coverage.enabledBoardCount,
    cardCount: 0,
    supersededRecordCount: 0,
    healthyCardCount: 0,
    driftedCardCount: 0,
    driftCounts: {},
    textIntegrityFindingCount: 0,
    actionableTextIntegrityFindingCount: 0,
    immutableSystemHistoryFindingCount: 0,
    textIntegrityCounts: { byBoard: {}, bySurface: {}, byPattern: {} },
    actionableTextIntegrityFindings: [],
    immutableSystemHistoryFindings: [],
    textIntegrityFindings: [],
    duplicates: [],
    linkedPairs: [],
    autonomyAdmittedCardCount: 0,
    autonomyBlockedReadyCardCount: 0,
    executableQueue: [],
    rows: [],
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function validateLegacyBoards(boards) {
  const reasonCodes = [];
  if (boards.length === 0) reasonCodes.push("board_inventory_missing");
  for (const board of boards) {
    if (!board.id) reasonCodes.push("board_id_missing");
    if (!board.forumChannelId) reasonCodes.push("board_forum_channel_id_missing");
    if (!new Set(["active", "completed", "legacy"]).has(board.role)) reasonCodes.push("board_role_invalid");
  }
  return [...new Set(reasonCodes)];
}

function isBlockingReason(code) {
  return /^(board_registry_|board_channel_(?:unresolved|ambiguous):|required_board_blocked:|uncovered_live_board:|discord_bot_token_missing$|board_inventory_missing$|board_id_missing$|board_forum_channel_id_missing$|board_role_invalid$|board_forum_read_failed:|board_forum_guild_mismatch:|board_forum_name_mismatch:|active_threads_read_failed:|archived_threads_|card_thread_readback_failed:|card_starter_read_failed:|card_journal_read_failed:|card_journal_history_truncated:)/.test(code);
}

async function buildBoardCardConsistency({ payload, registry, env = process.env, fetchImpl = fetch } = {}) {
  const token = text(env?.DISCORDOS_BOT_TOKEN);
  const inventorySource = registry ? "registry" : "legacy_input";
  let registeredBoards;
  let boards;
  let validationReasonCodes = [];

  if (registry) {
    const validation = boardRegistry.validateBoardRegistry(registry);
    registeredBoards = registryBoards(registry);
    validationReasonCodes = validation.reasonCodes;
    boards = registeredBoards.filter((board) => board.status === "enabled");
  } else {
    registeredBoards = normalizeLegacyBoards(payload);
    boards = registeredBoards;
    validationReasonCodes = validateLegacyBoards(boards);
  }

  let coverage = coverageResult({ inventorySource, registeredBoards, evaluated: false });
  const reasonCodes = [...validationReasonCodes];
  for (const board of registeredBoards.filter((candidate) => candidate.required && candidate.status === "blocked")) {
    reasonCodes.push(`required_board_blocked:${board.id}`);
  }
  if (!token) reasonCodes.push("discord_bot_token_missing");
  if (validationReasonCodes.length > 0 || !token) {
    return emptyConsistencyResult({ coverage, reasonCodes });
  }

  if (registry) {
    const discovery = await discoverRegistryForums({ registry, token, fetchImpl });
    reasonCodes.push(...discovery.reasonCodes);
    if (discovery.resolvedRegistry) {
      registeredBoards = registryBoards(discovery.resolvedRegistry);
      boards = registeredBoards.filter((board) => board.status === "enabled" && board.forumChannelId);
    }
    coverage = coverageResult({
      inventorySource,
      registeredBoards,
      uncoveredBoards: discovery.uncoveredBoards,
      excludedBoards: discovery.excludedBoards,
      evaluated: true,
    });
  }

  const rows = [];
  for (const board of boards) {
    const channel = await cardContract.discordRequest({ path: `/channels/${board.forumChannelId}`, token, fetchImpl });
    if (!channel.ok || !channel.payload?.guild_id) {
      reasonCodes.push(`board_forum_read_failed:${board.id}`);
      continue;
    }
    if (registry && channel.payload.guild_id !== registry.guildId) reasonCodes.push(`board_forum_guild_mismatch:${board.id}`);
    if (registry && board.forumChannelName && channel.payload.name !== board.forumChannelName) {
      reasonCodes.push(`board_forum_name_mismatch:${board.id}`);
    }
    const inventory = await listThreads({ board, guildId: channel.payload.guild_id, token, fetchImpl });
    reasonCodes.push(...inventory.reasonCodes.map((code) => `${code}:${board.id}`));
    for (const thread of inventory.threads) {
      const [threadReadback, starter, messages] = await Promise.all([
        cardContract.discordRequest({ path: `/channels/${thread.id}`, token, fetchImpl }),
        cardContract.fetchMessage({ channelId: thread.id, messageId: thread.id, token, fetchImpl }),
        journal.readThreadMessages({ threadId: thread.id, token, fetchImpl }),
      ]);
      if (!threadReadback.ok) reasonCodes.push(`card_thread_readback_failed:${thread.id}`);
      if (!starter.ok) reasonCodes.push(`card_starter_read_failed:${thread.id}`);
      if (!messages.ok) {
        reasonCodes.push(messages.truncated
          ? `card_journal_history_truncated:${thread.id}`
          : `card_journal_read_failed:${thread.id}`);
      }
      rows.push({
        ...inspectThread({
          board,
          thread: threadReadback.ok
            ? {
                ...thread,
                name: threadReadback.payload?.name || thread.name,
                thread_metadata: threadReadback.payload?.thread_metadata || {
                  archived: thread.archived === true,
                  locked: thread.locked === true,
                },
                applied_tags: Array.isArray(threadReadback.payload?.applied_tags)
                  ? threadReadback.payload.applied_tags
                  : thread.appliedTags,
              }
            : {
                ...thread,
                thread_metadata: { archived: thread.archived === true, locked: thread.locked === true },
                applied_tags: thread.appliedTags,
              },
          starter: starter.ok ? starter.payload : null,
          messages: messages.payload,
        }),
        journalPageCount: messages.pageCount,
        journalHistoryTruncated: messages.truncated,
      });
    }
  }
  const retainedLegacyRows = rows.filter((row) => row.retainedLegacyHistory === true);
  const currentRows = rows.filter((row) => !row.superseded && !row.retainedLegacyHistory);
  const supersededRows = rows.filter((row) => row.superseded);
  const { duplicates, linkedPairs } = classifyIdentities(currentRows);
  if (duplicates.length > 0) reasonCodes.push("duplicate_card_identity_across_boards");
  const driftCounts = {};
  for (const row of rows) {
    for (const code of row.reasonCodes) driftCounts[code] = (driftCounts[code] || 0) + 1;
  }
  const textIntegrityFindings = rows.flatMap((row) =>
    (row.textIntegrity?.findings || []).map((finding) => ({
      ...finding,
      superseded: row.superseded,
      immutableSystemHistory: row.superseded === true && finding.nonDeletableSystemMessage === true,
    }))
  );
  const actionableTextIntegrityFindings = textIntegrityFindings.filter((finding) => !finding.immutableSystemHistory);
  const immutableSystemHistoryFindings = textIntegrityFindings.filter((finding) => finding.immutableSystemHistory);
  const textIntegrityCounts = { byBoard: {}, bySurface: {}, byPattern: {} };
  for (const finding of textIntegrityFindings) {
    textIntegrityCounts.byBoard[finding.boardId] = (textIntegrityCounts.byBoard[finding.boardId] || 0) + 1;
    textIntegrityCounts.bySurface[finding.surface] = (textIntegrityCounts.bySurface[finding.surface] || 0) + 1;
    textIntegrityCounts.byPattern[finding.pattern] = (textIntegrityCounts.byPattern[finding.pattern] || 0) + 1;
  }
  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const blocked = uniqueReasonCodes.some(isBlockingReason);
  const drifted = !rows.filter((row) => !row.retainedLegacyHistory).every((row) => row.ok) || duplicates.length > 0;
  const status = blocked ? "blocked" : drifted ? "drift_detected" : "consistent";
  return {
    ok: status === "consistent",
    status,
    ...coverage,
    boardCount: boards.length,
    totalThreadCount: rows.length,
    cardCount: currentRows.length,
    retainedLegacyHistoryCount: retainedLegacyRows.length,
    retainedLegacyHistory: retainedLegacyRows.map((row) => ({
      boardId: row.boardId,
      threadId: row.threadId,
      classification: row.legacyClassification,
      semanticStatus: row.semanticStatus,
    })),
    supersededRecordCount: supersededRows.length,
    healthyCardCount: currentRows.filter((row) => row.ok).length,
    driftedCardCount: currentRows.filter((row) => !row.ok).length + supersededRows.filter((row) => !row.ok).length,
    driftCounts,
    textIntegrityFindingCount: textIntegrityFindings.length,
    actionableTextIntegrityFindingCount: actionableTextIntegrityFindings.length,
    immutableSystemHistoryFindingCount: immutableSystemHistoryFindings.length,
    textIntegrityCounts,
    textIntegrityFindings,
    actionableTextIntegrityFindings,
    immutableSystemHistoryFindings,
    duplicates,
    linkedPairs,
    autonomyAdmittedCardCount: currentRows.filter((row) => row.autonomy?.admitted).length,
    autonomyBlockedReadyCardCount: currentRows.filter((row) =>
      row.state === journal.AUTONOMOUS_EXECUTION_STATE && !row.autonomy?.admitted
    ).length,
    executableQueue: currentRows.filter((row) => row.autonomy?.admitted).map((row) => ({
      boardId: row.boardId,
      threadId: row.threadId,
      cardId: row.cardId,
      title: row.title,
      priority: row.priority,
      owner: row.owner,
    })),
    rows,
    reasonCodes: uniqueReasonCodes,
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Board Card Consistency",
    "",
    `- status: \`${result.status}\``,
    `- inventory source: \`${result.inventorySource}\``,
    `- coverage: \`${result.coverageStatus}\``,
    `- registered boards: \`${result.registeredBoardCount || 0}\``,
    `- enabled boards: \`${result.enabledBoardCount || 0}\``,
    `- blocked boards: \`${result.blockedBoardCount || 0}\``,
    `- uncovered boards: \`${result.uncoveredBoardCount || 0}\``,
    `- cards: \`${result.cardCount || 0}\``,
    `- healthy: \`${result.healthyCardCount || 0}\``,
    `- drifted: \`${result.driftedCardCount || 0}\``,
    `- autonomous-ready: \`${result.autonomyAdmittedCardCount || 0}\``,
    `- invalid-ready: \`${result.autonomyBlockedReadyCardCount || 0}\``,
    `- actionable text findings: \`${result.actionableTextIntegrityFindingCount || 0}\``,
    `- immutable system-history findings: \`${result.immutableSystemHistoryFindingCount || 0}\``,
  ];
  for (const board of result.blockedBoards || []) lines.push(`- blocked board: \`${board.id}\``);
  for (const board of result.uncoveredBoards || []) lines.push(`- uncovered board: \`${board.channelName || board.channelId}\``);
  for (const [code, count] of Object.entries(result.driftCounts || {})) lines.push(`- ${code}: \`${count}\``);
  for (const [boardId, count] of Object.entries(result.textIntegrityCounts?.byBoard || {})) {
    lines.push(`- text integrity board ${boardId}: \`${count}\``);
  }
  for (const [surface, count] of Object.entries(result.textIntegrityCounts?.bySurface || {})) {
    lines.push(`- text integrity surface ${surface}: \`${count}\``);
  }
  for (const [pattern, count] of Object.entries(result.textIntegrityCounts?.byPattern || {})) {
    lines.push(`- text integrity pattern ${pattern}: \`${count}\``);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourcePath = options.registryPath || options.inputPath;
  const source = await textIntegrity.readUtf8Json(sourcePath);
  const result = await buildBoardCardConsistency(options.registryPath ? { registry: source } : { payload: source });
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
  DEFAULT_REGISTRY_PATH,
  _internals: {
    MUSIC_SESH_PHASE_8_THREAD_ID,
    MUSIC_SESH_PHASE_8_CARD_ID,
    legacyDisposition,
    parseArgs,
    parseCardId,
    parseCardState,
    hasJournal,
    sha256,
    journalIntegrityEntries,
    inspectTextSurface,
    inspectThreadTextIntegrity,
    NON_DELETABLE_SYSTEM_MESSAGE_TYPES,
    inspectThread,
    classifyIdentities,
    findDuplicates,
    normalizeLegacyBoards,
    registryBoards,
    coverageResult,
    discoverRegistryForums,
    validateLegacyBoards,
    isBlockingReason,
    buildBoardCardConsistency,
  },
};
