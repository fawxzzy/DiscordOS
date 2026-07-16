const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");
const {
  _internals: completedTransfer,
} = require("./discordos-board-completed-transfer");
const {
  _internals: journal,
} = require("./discordos-board-card-journal");
const forumProfileModule = require("./discordos-forum-profile");
const { _internals: forumProfile } = forumProfileModule;
const FORUM_SCAN_SCHEMA_VERSION = forumProfileModule.SCAN_SCHEMA_VERSION;

const PLAN_SCHEMA_VERSION = "discordos.current-board-drift-repair-plan.v1";
const RECEIPT_SCHEMA_VERSION = "discordos.current-board-drift-repair-receipt.v1";
const EVENT_ID = "discordos-current-13-board-drift-repair-2026-07-16";
const REPAIR_ENV = "DISCORDOS_CURRENT_BOARD_DRIFT_REPAIR";
const REPAIR_ENV_VALUE = "enabled";
const ADMITTED_EVIDENCE_SHA256 = "a4768859896ea7c7d73f21eff6009dae5cbd3915aa8e14780d89a8d66ab2f182";
const TRUSTED_PLAN_DIGEST_SHA256 = "2179246439631b51d4ff76395660c4fdf3e7a237d81c0cfd1e80d28dc1fe2841";
const DEFAULT_PLAN_PATH = path.resolve(
  __dirname,
  "..",
  "docs",
  "ops",
  "discordos-current-13-board-drift-repair-plan-2026-07-16.json",
);
const DEFAULT_BOARD_REGISTRY_PATH = path.resolve(__dirname, "..", "config", "discordos-board-registry.json");
const DEFAULT_PROFILE_REGISTRY_PATH = path.resolve(__dirname, "..", "config", "discordos-forum-profile-registry.json");
const COMPLETED_FORUM_CHANNEL_ID = "1508359985602625638";

const INITIAL_REASON_CODES = Object.freeze([
  "card_tag_semantic_mismatch:fitness-active",
  "card_tag_semantic_mismatch:mazer-active",
  "card_tag_semantic_mismatch:shared-completed",
  "forum_relative_order_mismatch",
]);

const EXPECTED_BOARD_IDS = Object.freeze([
  "legacy-general-feedback",
  "fitness-active",
  "mazer-active",
  "atlas-active-admission",
  "cortex-active-admission",
  "discordos-active-admission",
  "foundation-active-admission",
  "lifeline-active-admission",
  "playbook-active-admission",
  "stack-active-admission",
  "music-sesh-active",
  "shared-completed",
  "socials-os-active-admission",
]);
const INITIAL_OBSERVED_BOARD_IDS = Object.freeze([
  "legacy-general-feedback",
  "fitness-active",
  "mazer-active",
  "atlas-active-admission",
  "cortex-active-admission",
  "discordos-active-admission",
  "socials-os-active-admission",
  "foundation-active-admission",
  "lifeline-active-admission",
  "playbook-active-admission",
  "stack-active-admission",
  "music-sesh-active",
  "shared-completed",
]);

const TAG_TARGETS = Object.freeze([
  ["fitness-active", "1526833783385358407", "FF-ROUTINE-001", ["Feature", "Planning"], ["Feature", "Review"]],
  ["fitness-active", "1526112879303196763", "FF-RET-004", ["Feature", "Review"], ["Feature", "In Progress"]],
  ["mazer-active", "1526644909241667644", "mazer-shared-run-status-panel", ["Feature", "Planning", "High"], ["Feature", "Review", "High"]],
  ["mazer-active", "1526284203464065185", "mazer-run-quality-metric-contract-v2", ["Feature", "In Progress", "High"], ["Feature", "Review", "High"]],
  ["mazer-active", "1525337752290197514", "mazer-browser-layout-persistence", ["Feature", "In Progress", "High"], ["Feature", "Opened", "High"]],
  ["mazer-active", "1525337748830031875", "mazer-cross-viewport-ui-reliability", ["Feature", "In Progress", "High"], ["Feature", "Review", "High"]],
  ["shared-completed", "1527196057665277962", "FF-SESSION-006", [], ["Feature", "Completed"]],
  ["shared-completed", "1527193630249455656", "FF-SESSION-002", [], ["Feature", "Completed"]],
  ["shared-completed", "1527191534196228188", "FF-ROUTINE-001", [], ["Feature", "Completed"]],
  ["shared-completed", "1527189545005748315", "FF-SESSION-004", [], ["Feature", "Completed"]],
  ["shared-completed", "1527188130690502796", "FF-SESSION-003", [], ["Feature", "Completed"]],
  ["shared-completed", "1527053476381720617", "FF-SESSION-001", [], ["Feature", "Completed"]],
  ["shared-completed", "1526956415133024286", "FF-RET-004", [], ["Feature", "Completed"]],
  ["shared-completed", "1526900827564933142", "SOC-019", [], ["Feature", "Completed"]],
].map(([boardId, threadId, cardId, currentNames, desiredNames]) => ({
  boardId,
  threadId,
  cardId,
  currentNames,
  desiredNames,
})));

const TRANSFER_TARGETS = Object.freeze([
  {
    boardId: "atlas-active-admission",
    sourceForumChannelId: "1526814470486360144",
    sourceThreadId: "1526829391609335828",
    cardId: "lane-discordos-cross-project-board-integrity",
    sourceContentSha256: "15b44ed4a82f8e89ed8424f48a99881bcba3dc956be4bd58143453cac6d51413",
    state: "in_progress",
    evidence: `operator-admitted current-board maintenance transfer; scan sha256:${ADMITTED_EVIDENCE_SHA256}`,
  },
  {
    boardId: "discordos-active-admission",
    sourceForumChannelId: "1526814473267187864",
    sourceThreadId: "1526830094361038928",
    cardId: "DOS-201",
    sourceContentSha256: "280fc4f2fca2cb74de6a6744628c1053c11e6693305be1067f3f75af8e38e410",
    state: "in_progress",
    evidence: "docs/ops/discordos-dos-201-dos-202-owner-lifecycle-closeout-2026-07-16.md",
  },
  {
    boardId: "discordos-active-admission",
    sourceForumChannelId: "1526814473267187864",
    sourceThreadId: "1526830102946512959",
    cardId: "DOS-202",
    sourceContentSha256: "d847fd8dde8ed2caa5e41b0501c042f630b74981fe043a02f5243a354224b969",
    state: "planning",
    evidence: "docs/ops/discordos-dos-201-dos-202-owner-lifecycle-closeout-2026-07-16.md",
  },
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

function sameArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function sameSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function sameUniqueSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && new Set(left).size === left.length
    && new Set(right).size === right.length
    && left.length === right.length
    && left.every((value) => right.includes(value));
}

function unique(values) {
  return [...new Set(values)];
}

function pushIf(reasonCodes, condition, code) {
  if (condition) reasonCodes.push(code);
}

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = {
    mode: "preflight",
    evidencePath: null,
    planPath: DEFAULT_PLAN_PATH,
    currentScanPath: null,
    outputPath: null,
    allowApply: false,
    json: false,
  };
  let explicitMode = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--generate-plan", "--preflight", "--dry-run", "--apply"].includes(arg)) {
      if (explicitMode) throw new Error("multiple_modes_not_allowed");
      options.mode = arg.slice(2).replace("-", "_");
      explicitMode = true;
    } else if (arg === "--evidence") {
      options.evidencePath = path.resolve(readValue(args, index, "missing_evidence_path"));
      index += 1;
    } else if (arg === "--plan") {
      options.planPath = path.resolve(readValue(args, index, "missing_plan_path"));
      index += 1;
    } else if (arg === "--current-scan") {
      options.currentScanPath = path.resolve(readValue(args, index, "missing_current_scan_path"));
      index += 1;
    } else if (arg === "--output") {
      options.outputPath = path.resolve(readValue(args, index, "missing_output_path"));
      index += 1;
    } else if (arg === "--allow-apply") options.allowApply = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (!options.evidencePath) throw new Error("evidence_path_missing");
  if (options.mode === "apply" && options.currentScanPath) throw new Error("apply_fixture_scan_not_allowed");
  if (options.mode === "generate_plan" && !options.outputPath) options.outputPath = options.planPath;
  return options;
}

function initialEvidenceReasonCodes(scan, evidenceBytes, admittedEvidenceSha256 = ADMITTED_EVIDENCE_SHA256) {
  const reasonCodes = [];
  pushIf(reasonCodes, sha256(evidenceBytes) !== admittedEvidenceSha256, "admitted_evidence_digest_mismatch");
  pushIf(reasonCodes, scan?.schemaVersion !== FORUM_SCAN_SCHEMA_VERSION, "admitted_scan_schema_mismatch");
  pushIf(reasonCodes, scan?.readOnly !== true || scan?.mutatesDiscord !== false, "admitted_scan_not_read_only");
  pushIf(reasonCodes, scan?.denominator?.requiredBoardCount !== 13, "admitted_board_denominator_mismatch");
  pushIf(reasonCodes, scan?.denominator?.enabledBoardCount !== 13, "admitted_enabled_board_denominator_mismatch");
  pushIf(reasonCodes, scan?.denominator?.inspectedBoardCount !== 13, "admitted_inspected_board_denominator_mismatch");
  pushIf(reasonCodes, scan?.denominator?.uncoveredBoardCount !== 0, "admitted_uncovered_board_detected");
  pushIf(reasonCodes, scan?.denominator?.coverageStatus !== "complete", "admitted_board_coverage_incomplete");
  pushIf(reasonCodes, scan?.cards?.currentCardCount !== 243, "admitted_current_card_denominator_mismatch");
  pushIf(reasonCodes, scan?.cards?.healthyCardCount !== 243, "admitted_healthy_card_denominator_mismatch");
  pushIf(reasonCodes, scan?.cards?.driftedCardCount !== 0, "admitted_unhealthy_card_detected");
  pushIf(reasonCodes, scan?.cards?.duplicateStableIdentityCount !== 0, "admitted_duplicate_stable_identity_detected");
  pushIf(reasonCodes, scan?.cards?.actionableTextIntegrityFindingCount !== 0, "admitted_actionable_text_corruption_detected");
  pushIf(reasonCodes, scan?.cards?.totalThreadCount !== 443, "admitted_total_thread_denominator_mismatch");
  pushIf(reasonCodes, scan?.cards?.retainedLegacyHistoryCount !== 151, "admitted_retained_legacy_denominator_mismatch");
  pushIf(reasonCodes, scan?.cards?.supersededRecordCount !== 49, "admitted_superseded_denominator_mismatch");
  pushIf(reasonCodes, scan?.cards?.immutableSystemHistoryFindingCount !== 124, "admitted_immutable_history_denominator_mismatch");
  pushIf(reasonCodes, !sameSet(scan?.reasonCodes, INITIAL_REASON_CODES), "admitted_drift_reason_set_mismatch");
  pushIf(reasonCodes, !sameArray(scan?.relativeOrder?.expectedBoardIds, EXPECTED_BOARD_IDS), "admitted_registry_order_mismatch");
  pushIf(reasonCodes, !sameArray(scan?.relativeOrder?.observedBoardIds, INITIAL_OBSERVED_BOARD_IDS), "admitted_forum_order_preimage_mismatch");
  const forums = scan?.forums || [];
  pushIf(reasonCodes, !sameSet(forums.map((row) => row.boardId), EXPECTED_BOARD_IDS), "admitted_forum_set_mismatch");
  pushIf(reasonCodes, !sameArray(
    [...forums].sort((left, right) => left.structure.observedPosition - right.structure.observedPosition).map((row) => row.boardId),
    INITIAL_OBSERVED_BOARD_IDS,
  ), "admitted_forum_position_preimage_mismatch");
  for (const forum of forums) {
    pushIf(reasonCodes, forum?.tags?.ok !== true, `admitted_tag_mapping_mismatch:${forum?.boardId || "unknown"}`);
    const tagIds = (forum?.tags?.actual || []).map((row) => row.id);
    const tagNames = (forum?.tags?.actual || []).map((row) => row.name);
    pushIf(reasonCodes, unique(tagIds).length !== tagIds.length, `admitted_ambiguous_tag_id:${forum?.boardId || "unknown"}`);
    pushIf(reasonCodes, unique(tagNames).length !== tagNames.length, `admitted_ambiguous_tag_name:${forum?.boardId || "unknown"}`);
  }
  const semanticRows = forums.flatMap((forum) => {
    const profile = (scan?.cards?.boardProfiles || []).find((row) => row.boardId === forum.boardId);
    const safety = profile?.appliedTagSafety || {};
    if ((safety.orphanAppliedTagIds || []).length > 0) reasonCodes.push(`admitted_orphan_tag:${forum.boardId}`);
    if ((safety.ambiguousAppliedTags || []).length > 0) reasonCodes.push(`admitted_ambiguous_applied_tag:${forum.boardId}`);
    return (safety.semanticRows || []).filter((row) => row.exact === false).map((row) => ({ ...row, boardId: forum.boardId }));
  });
  pushIf(reasonCodes, semanticRows.length !== TAG_TARGETS.length, "admitted_tag_target_count_mismatch");
  for (const target of TAG_TARGETS) {
    const row = semanticRows.find((candidate) => candidate.boardId === target.boardId && candidate.threadId === target.threadId);
    pushIf(reasonCodes, !row, `admitted_tag_target_missing:${target.threadId}`);
    if (row) {
      pushIf(reasonCodes, row.cardId !== target.cardId, `admitted_tag_card_identity_mismatch:${target.threadId}`);
      pushIf(reasonCodes, !sameArray(row.actualNames, target.currentNames), `admitted_current_tag_mismatch:${target.threadId}`);
      pushIf(reasonCodes, !sameArray(row.expectedNames, target.desiredNames), `admitted_expected_tag_mismatch:${target.threadId}`);
      pushIf(reasonCodes, (row.unknownNames || []).length > 0 || (row.orphanAppliedTagIds || []).length > 0, `admitted_unknown_tag:${target.threadId}`);
    }
  }
  const exactRows = scan?.cards?.exactReadbackRows || [];
  for (const target of [...TAG_TARGETS, ...TRANSFER_TARGETS]) {
    const threadId = target.threadId || target.sourceThreadId;
    const row = exactRows.find((candidate) => candidate.threadId === threadId);
    pushIf(reasonCodes, !row, `admitted_target_thread_missing:${threadId}`);
  }
  for (const target of TRANSFER_TARGETS) {
    const row = exactRows.find((candidate) => candidate.threadId === target.sourceThreadId);
    if (!row) continue;
    pushIf(reasonCodes, row.boardId !== target.boardId, `admitted_transfer_board_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, row.cardId !== target.cardId, `admitted_transfer_card_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, row.starterContentSha256 !== target.sourceContentSha256, `admitted_transfer_content_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, row.state !== target.state || row.archived !== false || row.locked !== false, `admitted_transfer_preimage_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, exactRows.some((candidate) => candidate.boardId === "shared-completed" && candidate.cardId === target.cardId), `admitted_transfer_destination_preexists:${target.sourceThreadId}`);
  }
  return unique(reasonCodes).sort();
}

function tagIdsForNames(scan, boardId, names, reasonCodes) {
  const forum = (scan.forums || []).find((row) => row.boardId === boardId);
  if (!forum) {
    reasonCodes.push(`forum_missing:${boardId}`);
    return [];
  }
  return names.map((name) => {
    const matches = (forum.tags?.actual || []).filter((tag) => tag.name === name);
    if (matches.length !== 1) reasonCodes.push(`tag_mapping_not_exact:${boardId}:${name}`);
    return matches[0]?.id || null;
  }).filter(Boolean);
}

function guildChannelInvariant(channel) {
  return {
    id: channel?.id || null,
    type: channel?.type ?? null,
    parentId: channel?.parent_id || null,
    position: channel?.position ?? null,
    name: channel?.name || null,
  };
}

function buildDeterministicPlan({
  scan,
  evidenceBytes,
  transferSources,
  guildChannels,
  admittedEvidenceSha256 = ADMITTED_EVIDENCE_SHA256,
}) {
  const reasonCodes = initialEvidenceReasonCodes(scan, evidenceBytes, admittedEvidenceSha256);
  const sourceByThread = new Map((transferSources || []).map((row) => [row.sourceThreadId, row]));
  const tagRepairs = TAG_TARGETS.map((target, index) => {
    const forum = (scan.forums || []).find((row) => row.boardId === target.boardId);
    return {
      operationId: `tag-${String(index + 1).padStart(2, "0")}`,
      kind: "tag_repair",
      boardId: target.boardId,
      forumChannelId: forum?.forumChannelId || null,
      threadId: target.threadId,
      cardId: target.cardId,
      preimage: {
        appliedTagNames: target.currentNames,
        appliedTagIds: tagIdsForNames(scan, target.boardId, target.currentNames, reasonCodes),
      },
      postimage: {
        appliedTagNames: target.desiredNames,
        appliedTagIds: tagIdsForNames(scan, target.boardId, target.desiredNames, reasonCodes),
      },
    };
  });
  const forumsByPosition = [...(scan.forums || [])].sort((left, right) => left.structure.observedPosition - right.structure.observedPosition);
  const slots = forumsByPosition.map((row) => row.structure.observedPosition);
  const forumById = new Map((scan.forums || []).map((row) => [row.boardId, row]));
  const orderRepair = {
    operationId: "order-01",
    kind: "forum_order_repair",
    guildId: unique((transferSources || []).map((row) => row.guildId).filter(Boolean)).length === 1
      ? unique((transferSources || []).map((row) => row.guildId).filter(Boolean))[0]
      : null,
    preimage: forumsByPosition.map((row) => ({ boardId: row.boardId, channelId: row.forumChannelId, position: row.structure.observedPosition })),
    postimage: EXPECTED_BOARD_IDS.map((boardId, index) => ({
      boardId,
      channelId: forumById.get(boardId)?.forumChannelId || null,
      position: slots[index],
    })),
    guildChannelPreimage: (guildChannels || [])
      .map(guildChannelInvariant)
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
  };
  if (!Array.isArray(guildChannels) || guildChannels.length === 0) reasonCodes.push("guild_channel_preimage_missing");
  if (unique((guildChannels || []).map((row) => row.id)).length !== (guildChannels || []).length) {
    reasonCodes.push("guild_channel_preimage_duplicate_id");
  }
  const guildChannelIds = new Set((guildChannels || []).map((row) => row.id));
  for (const row of orderRepair.preimage) {
    if (!guildChannelIds.has(row.channelId)) reasonCodes.push(`guild_channel_preimage_board_missing:${row.channelId}`);
  }
  const completedTagIds = tagIdsForNames(scan, "shared-completed", ["Feature", "Completed"], reasonCodes);
  const completedTransfers = TRANSFER_TARGETS.map((target, index) => {
    const source = sourceByThread.get(target.sourceThreadId);
    if (!source) reasonCodes.push(`transfer_source_enrichment_missing:${target.sourceThreadId}`);
    if (source && source.sourceContentSha256 !== target.sourceContentSha256) {
      reasonCodes.push(`transfer_source_enrichment_digest_mismatch:${target.sourceThreadId}`);
    }
    if (source && sha256(String(source.sourceContent || "")) !== target.sourceContentSha256) {
      reasonCodes.push(`transfer_source_enrichment_content_mismatch:${target.sourceThreadId}`);
    }
    if (source?.existingDestinationThreadIds?.length > 0) {
      reasonCodes.push(`transfer_destination_preexists:${target.sourceThreadId}`);
    }
    return {
      operationId: `transfer-${String(index + 1).padStart(2, "0")}`,
      kind: "completed_transfer",
      source: {
        boardId: target.boardId,
        forumChannelId: target.sourceForumChannelId,
        threadId: target.sourceThreadId,
        cardId: target.cardId,
        title: source?.title || null,
        content: source?.sourceContent ?? null,
        contentSha256: target.sourceContentSha256,
        archived: false,
        locked: false,
        project: source?.project || null,
        type: source?.type || null,
        state: target.state,
        priority: source?.priority || null,
        owner: source?.owner || null,
      },
      destination: {
        boardId: "shared-completed",
        forumChannelId: COMPLETED_FORUM_CHANNEL_ID,
        stableCardId: target.cardId,
        appliedTagNames: ["Feature", "Completed"],
        appliedTagIds: completedTagIds,
      },
      event: {
        eventId: `completed:${target.cardId}:current-13-board-drift-repair-v1`,
        occurredAt: scan.generatedAt,
        evidence: target.evidence,
      },
      requiredReadback: [
        "destination_managed_body",
        "destination_completed_state",
        "destination_source_link",
        "destination_exact_tags",
        "destination_journal_event",
        "destination_success_reaction",
        "source_reciprocal_link",
        "source_archived",
        "source_locked",
        "deterministic_no_write_replay",
      ],
    };
  });
  if (reasonCodes.length > 0) {
    const error = new Error(`plan_generation_blocked:${unique(reasonCodes).sort().join(",")}`);
    error.reasonCodes = unique(reasonCodes).sort();
    throw error;
  }
  const plan = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    eventId: EVENT_ID,
    generatedFrom: {
      admittedEvidenceFile: "discordos-forum-profile-scan-current-20260716.json",
      rawSha256: sha256(evidenceBytes),
      canonicalSha256: sha256(canonicalJson(scan)),
      generatedAt: scan.generatedAt,
    },
    writerBoundary: "discordos-single-logical-writer",
    historicalCloseout: "immutable_no_ratchet",
    allowedDrift: {
      tagRepairs: 14,
      forumOrderRepairs: 1,
      completedTransfers: 3,
      initialReasonCodes: INITIAL_REASON_CODES,
    },
    denominator: {
      initial: { boards: 13, currentCards: 243, healthyCards: 243, duplicateStableIdentities: 0, actionableTextFindings: 0 },
      terminal: { boards: 13, currentCards: 246, healthyCards: 246, duplicateStableIdentities: 0, actionableTextFindings: 0 },
      historical: { totalThreads: 443, retainedLegacyRows: 151, supersededRows: 49, immutableSystemHistoryFindings: 124 },
    },
    operations: [...tagRepairs, orderRepair, ...completedTransfers],
    nextPacket: "DiscordOS guarded current 13-board drift live apply and reconciliation",
  };
  plan.planDigestSha256 = objectDigest(plan);
  return plan;
}

function verifyPlan({
  plan,
  evidenceBytes,
  scan,
  admittedEvidenceSha256 = ADMITTED_EVIDENCE_SHA256,
  trustedPlanDigestSha256 = TRUSTED_PLAN_DIGEST_SHA256,
}) {
  const reasonCodes = [];
  pushIf(reasonCodes, plan?.schemaVersion !== PLAN_SCHEMA_VERSION, "plan_schema_mismatch");
  pushIf(reasonCodes, plan?.eventId !== EVENT_ID, "plan_event_mismatch");
  pushIf(reasonCodes, plan?.planDigestSha256 !== objectDigest(plan), "plan_digest_mismatch");
  pushIf(reasonCodes, plan?.planDigestSha256 !== trustedPlanDigestSha256, "plan_trusted_digest_mismatch");
  pushIf(reasonCodes, sha256(evidenceBytes) !== admittedEvidenceSha256, "admitted_evidence_digest_mismatch");
  pushIf(reasonCodes, plan?.generatedFrom?.rawSha256 !== sha256(evidenceBytes), "plan_evidence_raw_digest_mismatch");
  pushIf(reasonCodes, plan?.generatedFrom?.canonicalSha256 !== sha256(canonicalJson(scan)), "plan_evidence_canonical_digest_mismatch");
  const operations = plan?.operations || [];
  const tags = operations.filter((row) => row.kind === "tag_repair");
  const orders = operations.filter((row) => row.kind === "forum_order_repair");
  const transfers = operations.filter((row) => row.kind === "completed_transfer");
  pushIf(reasonCodes, operations.length !== 18, "plan_operation_count_mismatch");
  pushIf(reasonCodes, tags.length !== 14, "plan_tag_operation_count_mismatch");
  pushIf(reasonCodes, orders.length !== 1, "plan_order_operation_count_mismatch");
  pushIf(reasonCodes, transfers.length !== 3, "plan_transfer_operation_count_mismatch");
  pushIf(reasonCodes, unique(operations.map((row) => row.operationId)).length !== operations.length, "plan_operation_id_duplicate");
  for (const target of TAG_TARGETS) {
    const matches = tags.filter((row) => row.threadId === target.threadId);
    pushIf(reasonCodes, matches.length !== 1, `plan_tag_target_not_exact:${target.threadId}`);
    const row = matches[0];
    if (!row) continue;
    pushIf(reasonCodes, row.boardId !== target.boardId || row.cardId !== target.cardId, `plan_tag_identity_mismatch:${target.threadId}`);
    pushIf(reasonCodes, !sameArray(row.preimage?.appliedTagNames, target.currentNames), `plan_tag_preimage_mismatch:${target.threadId}`);
    pushIf(reasonCodes, !sameArray(row.postimage?.appliedTagNames, target.desiredNames), `plan_tag_postimage_mismatch:${target.threadId}`);
    pushIf(reasonCodes, row.preimage?.appliedTagIds?.length !== target.currentNames.length, `plan_tag_preimage_id_count_mismatch:${target.threadId}`);
    pushIf(reasonCodes, row.postimage?.appliedTagIds?.length !== target.desiredNames.length, `plan_tag_postimage_id_count_mismatch:${target.threadId}`);
  }
  const order = orders[0];
  pushIf(reasonCodes, !order?.guildId, "plan_order_guild_missing");
  pushIf(reasonCodes, !sameArray(order?.preimage?.map((row) => row.boardId), scan?.relativeOrder?.observedBoardIds), "plan_order_preimage_mismatch");
  pushIf(reasonCodes, !sameArray(order?.postimage?.map((row) => row.boardId), EXPECTED_BOARD_IDS), "plan_order_postimage_mismatch");
  pushIf(reasonCodes, unique((order?.postimage || []).map((row) => row.channelId)).length !== 13, "plan_order_channel_set_mismatch");
  pushIf(reasonCodes, !Array.isArray(order?.guildChannelPreimage) || order.guildChannelPreimage.length < 13, "plan_guild_channel_preimage_missing");
  pushIf(reasonCodes, unique((order?.guildChannelPreimage || []).map((row) => row.id)).length !== (order?.guildChannelPreimage || []).length, "plan_guild_channel_preimage_duplicate_id");
  for (const target of TRANSFER_TARGETS) {
    const matches = transfers.filter((row) => row.source?.threadId === target.sourceThreadId);
    pushIf(reasonCodes, matches.length !== 1, `plan_transfer_target_not_exact:${target.sourceThreadId}`);
    const row = matches[0];
    if (!row) continue;
    pushIf(reasonCodes, row.source?.boardId !== target.boardId, `plan_transfer_board_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, row.source?.forumChannelId !== target.sourceForumChannelId, `plan_transfer_forum_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, row.source?.cardId !== target.cardId, `plan_transfer_card_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, row.source?.contentSha256 !== target.sourceContentSha256, `plan_transfer_content_digest_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, typeof row.source?.content !== "string" || sha256(row.source.content) !== target.sourceContentSha256, `plan_transfer_content_preimage_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, !row.source?.title || !row.source?.owner || !row.source?.project || !row.source?.type || !row.source?.priority, `plan_transfer_enrichment_missing:${target.sourceThreadId}`);
    pushIf(reasonCodes, row.destination?.forumChannelId !== COMPLETED_FORUM_CHANNEL_ID, `plan_transfer_destination_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, row.destination?.stableCardId !== target.cardId, `plan_transfer_destination_identity_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, !sameArray(row.destination?.appliedTagNames, ["Feature", "Completed"]), `plan_transfer_destination_tag_name_mismatch:${target.sourceThreadId}`);
    pushIf(reasonCodes, row.destination?.appliedTagIds?.length !== 2, `plan_transfer_destination_tag_id_mismatch:${target.sourceThreadId}`);
  }
  const allowedThreadIds = new Set(TAG_TARGETS.map((row) => row.threadId));
  for (const row of tags) pushIf(reasonCodes, !allowedThreadIds.has(row.threadId), `plan_extra_tag_target:${row.threadId || "unknown"}`);
  const allowedTransferIds = new Set(TRANSFER_TARGETS.map((row) => row.sourceThreadId));
  for (const row of transfers) pushIf(reasonCodes, !allowedTransferIds.has(row.source?.threadId), `plan_extra_transfer_target:${row.source?.threadId || "unknown"}`);
  return unique(reasonCodes).sort();
}

async function inspectTransferSource(target, { env = process.env, fetchImpl = fetch } = {}) {
  const reasonCodes = [];
  const token = String(env?.DISCORDOS_BOT_TOKEN || "").trim();
  if (!token) return { ok: false, sourceThreadId: target.sourceThreadId, reasonCodes: ["discord_bot_token_missing"] };
  const [threadRead, messageRead] = await Promise.all([
    cardContract.discordRequest({ path: `/channels/${target.sourceThreadId}`, token, fetchImpl }),
    cardContract.fetchMessage({ channelId: target.sourceThreadId, messageId: target.sourceThreadId, token, fetchImpl }),
  ]);
  if (!threadRead.ok || !messageRead.ok) reasonCodes.push("transfer_source_read_failed");
  const thread = threadRead.payload || {};
  const message = messageRead.payload || {};
  const content = String(message.content || "");
  const parsed = cardContract.parseCanonicalCardBody(content);
  pushIf(reasonCodes, thread.parent_id !== target.sourceForumChannelId, "transfer_source_forum_mismatch");
  pushIf(reasonCodes, sha256(content) !== target.sourceContentSha256, "transfer_source_content_digest_mismatch");
  pushIf(reasonCodes, !parsed, "transfer_source_canonical_body_missing");
  pushIf(reasonCodes, parsed?.id !== target.cardId, "transfer_source_card_identity_mismatch");
  pushIf(reasonCodes, parsed?.state !== target.state, "transfer_source_state_mismatch");
  pushIf(reasonCodes, thread.thread_metadata?.archived === true || thread.thread_metadata?.locked === true, "transfer_source_archive_preimage_mismatch");
  pushIf(reasonCodes, !thread.name || !parsed?.project || !parsed?.type || !parsed?.priority || !parsed?.owner, "transfer_source_enrichment_missing");
  const existingDestinationThreadIds = [];
  if (!thread.guild_id) reasonCodes.push("transfer_source_guild_missing");
  return {
    ok: reasonCodes.length === 0,
    sourceThreadId: target.sourceThreadId,
    sourceContentSha256: sha256(content),
    sourceContent: content,
    title: thread.name || null,
    project: parsed?.project || null,
    type: parsed?.type || null,
    priority: parsed?.priority || null,
    owner: parsed?.owner || null,
    guildId: thread.guild_id || null,
    existingDestinationThreadIds,
    reasonCodes: unique(reasonCodes).sort(),
  };
}

async function inspectTransferSources({ env = process.env, fetchImpl = fetch } = {}) {
  const rows = [];
  for (const target of TRANSFER_TARGETS) rows.push(await inspectTransferSource(target, { env, fetchImpl }));
  const reasonCodes = rows.flatMap((row) => row.reasonCodes);
  if (reasonCodes.length > 0) {
    const error = new Error(`transfer_source_enrichment_blocked:${unique(reasonCodes).sort().join(",")}`);
    error.reasonCodes = unique(reasonCodes).sort();
    throw error;
  }
  return rows;
}

async function inspectGuildChannels({ guildId, env = process.env, fetchImpl = fetch } = {}) {
  const token = String(env?.DISCORDOS_BOT_TOKEN || "").trim();
  if (!token) throw new Error("discord_bot_token_missing");
  const read = await cardContract.discordRequest({ path: `/guilds/${guildId}/channels`, token, fetchImpl });
  if (!read.ok || !Array.isArray(read.payload)) throw new Error("guild_channel_preimage_read_failed");
  return read.payload;
}

function currentSemanticRow(scan, operation) {
  const profile = (scan?.cards?.boardProfiles || []).find((row) => row.boardId === operation.boardId);
  return (profile?.appliedTagSafety?.semanticRows || []).find((row) => row.threadId === operation.threadId);
}

function currentScanEvaluation(plan, scan) {
  const reasonCodes = [];
  const operations = plan.operations || [];
  const tagOperations = operations.filter((row) => row.kind === "tag_repair");
  const orderOperation = operations.find((row) => row.kind === "forum_order_repair");
  const transferOperations = operations.filter((row) => row.kind === "completed_transfer");
  const forums = scan?.forums || [];
  const exactRows = scan?.cards?.exactReadbackRows || [];
  pushIf(reasonCodes, scan?.schemaVersion !== FORUM_SCAN_SCHEMA_VERSION, "current_scan_schema_mismatch");
  pushIf(reasonCodes, scan?.readOnly !== true || scan?.mutatesDiscord !== false, "current_scan_not_read_only");
  pushIf(reasonCodes, scan?.denominator?.requiredBoardCount !== 13 || scan?.denominator?.enabledBoardCount !== 13, "current_board_denominator_mismatch");
  pushIf(reasonCodes, scan?.denominator?.inspectedBoardCount !== 13 || scan?.denominator?.uncoveredBoardCount !== 0, "current_board_coverage_mismatch");
  pushIf(reasonCodes, scan?.denominator?.coverageStatus !== "complete", "current_board_coverage_incomplete");
  pushIf(reasonCodes, !sameSet(forums.map((row) => row.boardId), EXPECTED_BOARD_IDS), "current_forum_set_mismatch");
  pushIf(reasonCodes, scan?.profileValidation?.ok !== true, "current_profile_validation_failed");
  const extraReasons = (scan?.reasonCodes || []).filter((code) => !INITIAL_REASON_CODES.includes(code));
  reasonCodes.push(...extraReasons.map((code) => `current_extra_drift_reason:${code}`));
  const extraCardReasons = (scan?.cards?.reasonCodes || []).filter((code) => !INITIAL_REASON_CODES.includes(code));
  reasonCodes.push(...extraCardReasons.map((code) => `current_extra_card_drift_reason:${code}`));
  const destinationRows = transferOperations.map((operation) => exactRows.find((row) =>
    row.boardId === "shared-completed" && row.cardId === operation.destination.stableCardId
  ));
  const completedTransferCount = destinationRows.filter(Boolean).length;
  const expectedCurrentCards = 243 + completedTransferCount;
  pushIf(reasonCodes, scan?.cards?.currentCardCount !== expectedCurrentCards, "current_card_denominator_mismatch");
  pushIf(reasonCodes, scan?.cards?.healthyCardCount !== expectedCurrentCards, "current_healthy_card_denominator_mismatch");
  pushIf(reasonCodes, scan?.cards?.driftedCardCount !== 0, "current_unhealthy_card_detected");
  pushIf(reasonCodes, scan?.cards?.duplicateStableIdentityCount !== 0, "current_duplicate_stable_identity_detected");
  pushIf(reasonCodes, scan?.cards?.actionableTextIntegrityFindingCount !== 0, "current_actionable_text_corruption_detected");
  pushIf(reasonCodes, scan?.cards?.totalThreadCount !== 443 + completedTransferCount, "current_total_thread_denominator_mismatch");
  pushIf(reasonCodes, scan?.cards?.retainedLegacyHistoryCount !== 151, "current_retained_legacy_denominator_mismatch");
  pushIf(reasonCodes, scan?.cards?.supersededRecordCount !== 49, "current_superseded_denominator_mismatch");
  pushIf(reasonCodes, scan?.cards?.immutableSystemHistoryFindingCount !== 124, "current_immutable_history_denominator_mismatch");
  for (const forum of forums) {
    pushIf(reasonCodes, forum?.tags?.ok !== true, `current_tag_mapping_mismatch:${forum.boardId}`);
    const profile = (scan?.cards?.boardProfiles || []).find((row) => row.boardId === forum.boardId);
    pushIf(reasonCodes, (profile?.appliedTagSafety?.orphanAppliedTagIds || []).length > 0, `current_orphan_tag:${forum.boardId}`);
    pushIf(reasonCodes, (profile?.appliedTagSafety?.ambiguousAppliedTags || []).length > 0, `current_ambiguous_tag:${forum.boardId}`);
  }
  const allowedTagThreads = new Set(tagOperations.map((row) => row.threadId));
  for (const profile of scan?.cards?.boardProfiles || []) {
    for (const row of profile?.appliedTagSafety?.semanticRows || []) {
      if (row.exact === false && !allowedTagThreads.has(row.threadId)) reasonCodes.push(`current_extra_tag_target:${row.threadId}`);
    }
  }
  const tagStatuses = tagOperations.map((operation) => {
    const row = currentSemanticRow(scan, operation);
    if (!row) {
      reasonCodes.push(`current_tag_target_missing:${operation.threadId}`);
      return { operationId: operation.operationId, status: "blocked" };
    }
    const preimage = sameArray(row.actualNames, operation.preimage.appliedTagNames);
    const postimage = sameArray(row.actualNames, operation.postimage.appliedTagNames) && row.exact === true;
    if (!preimage && !postimage) reasonCodes.push(`current_tag_preimage_drift:${operation.threadId}`);
    if ((row.unknownNames || []).length > 0 || (row.orphanAppliedTagIds || []).length > 0 || (row.duplicateNames || []).length > 0) {
      reasonCodes.push(`current_tag_identity_unsafe:${operation.threadId}`);
    }
    return { operationId: operation.operationId, status: postimage ? "complete" : preimage ? "pending" : "blocked" };
  });
  const currentOrderRows = [...forums]
    .sort((left, right) => left.structure.observedPosition - right.structure.observedPosition)
    .map((row) => ({ boardId: row.boardId, channelId: row.forumChannelId, position: row.structure.observedPosition }));
  const orderPreimage = canonicalJson(currentOrderRows) === canonicalJson(orderOperation?.preimage || []);
  const orderPostimage = canonicalJson(currentOrderRows) === canonicalJson(orderOperation?.postimage || []);
  if (!orderPreimage && !orderPostimage) reasonCodes.push("current_forum_order_preimage_drift");
  const transferStatuses = transferOperations.map((operation, index) => {
    const source = exactRows.find((row) => row.threadId === operation.source.threadId);
    const destination = destinationRows[index];
    if (!source) reasonCodes.push(`current_transfer_source_missing:${operation.source.threadId}`);
    if (!destination) {
      if (source && (
        source.boardId !== operation.source.boardId
        || source.cardId !== operation.source.cardId
        || source.starterContentSha256 !== operation.source.contentSha256
        || source.state !== operation.source.state
        || source.archived !== false
        || source.locked !== false
      )) reasonCodes.push(`current_transfer_source_preimage_drift:${operation.source.threadId}`);
      return { operationId: operation.operationId, status: source ? "pending" : "blocked" };
    }
    const semantic = currentSemanticRow(scan, {
      boardId: "shared-completed",
      threadId: destination.threadId,
    });
    if (destination.state !== "completed" || destination.reasonCodes?.length > 0 || semantic?.exact !== true
      || !sameArray(semantic?.actualNames, operation.destination.appliedTagNames)) {
      reasonCodes.push(`current_transfer_destination_drift:${operation.source.threadId}`);
    }
    return { operationId: operation.operationId, status: "complete", destinationThreadId: destination.threadId };
  });
  const statuses = [
    ...tagStatuses,
    { operationId: orderOperation?.operationId, status: orderPostimage ? "complete" : orderPreimage ? "pending" : "blocked" },
    ...transferStatuses,
  ];
  return {
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? (statuses.every((row) => row.status === "complete") ? "terminal" : "ready") : "blocked",
    completedTransferCount,
    operationStatuses: statuses,
    reasonCodes: unique(reasonCodes).sort(),
  };
}

function successReactionPresent(message) {
  return (message?.reactions || []).some((reaction) =>
    reaction?.emoji?.name === cardContract.STATUS_REACTIONS.success.name
    && reaction?.emoji?.id === cardContract.STATUS_REACTIONS.success.id
    && reaction?.me === true
  );
}

async function inspectTransferRuntime(operation, { env = process.env, fetchImpl = fetch } = {}) {
  const reasonCodes = [];
  const token = String(env?.DISCORDOS_BOT_TOKEN || "").trim();
  if (!token) return { ok: false, operationId: operation.operationId, reasonCodes: ["discord_bot_token_missing"] };
  const [sourceThreadRead, sourceMessageRead] = await Promise.all([
    cardContract.discordRequest({ path: `/channels/${operation.source.threadId}`, token, fetchImpl }),
    cardContract.fetchMessage({ channelId: operation.source.threadId, messageId: operation.source.threadId, token, fetchImpl }),
  ]);
  if (!sourceThreadRead.ok || !sourceMessageRead.ok) reasonCodes.push("transfer_source_read_failed");
  const sourceThread = sourceThreadRead.payload || {};
  const sourceMessage = sourceMessageRead.payload || {};
  const sourceContent = String(sourceMessage.content || "");
  pushIf(reasonCodes, sourceThread.parent_id !== operation.source.forumChannelId, "transfer_source_forum_mismatch");
  pushIf(reasonCodes, sourceThread.name !== operation.source.title, "transfer_source_title_preimage_drift");
  const guildId = sourceThread.guild_id;
  let destination = null;
  let destinationMessage = null;
  let journalMessages = [];
  let titleOnlyCandidates = [];
  if (guildId) {
    const listed = await completedTransfer.listForumThreads({
      forumChannelId: operation.destination.forumChannelId,
      guildId,
      token,
      fetchImpl,
    });
    reasonCodes.push(...listed.reasonCodes);
    const stableMatches = [];
    for (const thread of listed.threads || []) {
      const starter = await cardContract.fetchMessage({ channelId: thread.id, messageId: thread.id, token, fetchImpl });
      if (!starter.ok) {
        reasonCodes.push(`transfer_destination_starter_read_failed:${thread.id}`);
        continue;
      }
      const content = String(starter.payload?.content || "");
      if (content.includes(completedTransfer.cardMarker(operation.source.cardId))) {
        stableMatches.push({ thread, message: starter.payload });
      } else if (cardContract.normalizeThreadTitle(thread.name) === cardContract.normalizeThreadTitle(operation.source.title)) {
        titleOnlyCandidates.push(thread.id);
      }
    }
    if (stableMatches.length > 1) reasonCodes.push("completed_card_identity_ambiguous");
    if (stableMatches.length === 0 && titleOnlyCandidates.length > 0) reasonCodes.push("completed_card_title_without_stable_identity");
    if (stableMatches.length === 1) {
      destination = stableMatches[0].thread;
      destinationMessage = stableMatches[0].message;
      const history = await completedTransfer.readAllThreadMessages({ threadId: destination.id, token, fetchImpl });
      reasonCodes.push(...history.reasonCodes);
      if (history.ok) journalMessages = history.messages;
    }
  } else reasonCodes.push("transfer_source_guild_missing");
  const destinationUrl = destination && guildId
    ? completedTransfer.discordThreadUrl(guildId, destination.id)
    : null;
  const sourceUrl = guildId
    ? completedTransfer.discordThreadUrl(guildId, operation.source.threadId)
    : null;
  const expectedDestinationContent = sourceUrl
    ? completedTransfer.buildCompletedMessage({
      cardId: operation.source.cardId,
      project: operation.source.project,
      sourceForumChannelId: operation.source.forumChannelId,
      title: operation.source.title,
      type: operation.source.type,
      priority: operation.source.priority,
      owner: operation.source.owner,
      eventId: operation.event.eventId,
      occurredAt: operation.event.occurredAt,
      sourceContent: operation.source.content,
      sourceUrl,
      destinationUrl: null,
      evidence: operation.event.evidence,
    })
    : null;
  const completionEvent = sourceUrl && destinationUrl
    ? completedTransfer.buildCompletedEvent({
      cardId: operation.source.cardId,
      project: operation.source.project,
      sourceForumChannelId: operation.source.forumChannelId,
      title: operation.source.title,
      type: operation.source.type,
      priority: operation.source.priority,
      owner: operation.source.owner,
      eventId: operation.event.eventId,
      occurredAt: operation.event.occurredAt,
      evidence: operation.event.evidence,
      sourceUrl,
      destinationUrl,
    })
    : null;
  const expectedJournalContent = completionEvent ? journal.buildJournalMessage(completionEvent) : null;
  const expectedSourceContent = destinationUrl
    ? completedTransfer.buildSourceMessage({
      sourceContent: operation.source.content,
      destinationUrl,
      cardId: operation.source.cardId,
    })
    : null;
  const sourcePreimageExact = sourceContent === operation.source.content
    && sourceThread.thread_metadata?.archived === false
    && sourceThread.thread_metadata?.locked !== true;
  const sourcePostimageExact = Boolean(expectedSourceContent)
    && sourceContent === expectedSourceContent
    && sourceThread.thread_metadata?.archived === true
    && sourceThread.thread_metadata?.locked === true;
  const sourceLinkWrittenOpenExact = Boolean(expectedSourceContent)
    && sourceContent === expectedSourceContent
    && sourceThread.thread_metadata?.archived === false
    && sourceThread.thread_metadata?.locked !== true;
  const reciprocalExact = sourcePostimageExact;
  if (!sourcePreimageExact && !sourceLinkWrittenOpenExact && !sourcePostimageExact) {
    reasonCodes.push("transfer_source_content_preimage_drift");
  }
  const destinationContent = String(destinationMessage?.content || "");
  const eventMarker = `ATLAS-JOURNAL-EVENT-ID: \`${operation.event.eventId}\``;
  const matchingJournalMessages = journalMessages.filter((message) => String(message?.content || "").includes(eventMarker));
  const journalMarkerCount = matchingJournalMessages.length;
  if (journalMarkerCount > 1) reasonCodes.push("completed_card_journal_event_duplicate");
  const readback = destination ? {
    stableIdentity: destinationContent.includes(completedTransfer.cardMarker(operation.source.cardId)),
    exactTitle: destination.name === operation.source.title,
    parentMatches: destination.parent_id === operation.destination.forumChannelId,
    managedBody: destinationContent === expectedDestinationContent,
    completedState: destinationContent === expectedDestinationContent,
    sourceLink: destinationContent === expectedDestinationContent,
    bodyExact: destinationContent === expectedDestinationContent,
    exactTags: sameUniqueSet(destination.applied_tags || [], operation.destination.appliedTagIds),
    journalEvent: journalMarkerCount === 1 && String(matchingJournalMessages[0]?.content || "") === expectedJournalContent,
    journalExact: journalMarkerCount === 1 && String(matchingJournalMessages[0]?.content || "") === expectedJournalContent,
    successReaction: successReactionPresent(destinationMessage),
    reciprocalSourceLink: reciprocalExact,
    sourceArchived: sourcePostimageExact,
    sourceLocked: sourcePostimageExact,
    sourcePostimageExact,
  } : null;
  const destinationRepairExact = Boolean(readback) && [
    "stableIdentity",
    "exactTitle",
    "parentMatches",
    "managedBody",
    "completedState",
    "sourceLink",
    "bodyExact",
    "exactTags",
    "journalEvent",
    "journalExact",
    "successReaction",
  ].every((field) => readback[field] === true);
  if (
    destination
    && destination.thread_metadata?.archived !== true
    && destination.thread_metadata?.locked !== true
    && !destinationRepairExact
  ) reasonCodes.push("completed_card_destination_archive_preimage_unknown");
  if (destination && readback.exactTitle !== true) reasonCodes.push("completed_card_title_drift");
  if (destination && readback.parentMatches !== true) reasonCodes.push("completed_card_parent_drift");
  const complete = Boolean(readback) && Object.values(readback).every(Boolean);
  return {
    ok: reasonCodes.length === 0,
    operationId: operation.operationId,
    status: reasonCodes.length > 0 ? "blocked" : complete ? "complete" : "pending",
    source: {
      threadId: operation.source.threadId,
      contentSha256: sha256(sourceContent),
      preimageExact: sourcePreimageExact,
      linkWrittenOpenExact: sourceLinkWrittenOpenExact,
      postimageExact: sourcePostimageExact,
      reciprocalExact,
      archived: sourceThread.thread_metadata?.archived === true,
      locked: sourceThread.thread_metadata?.locked === true,
    },
    destination: destination ? {
      threadId: destination.id,
      archiveState: {
        archived: destination.thread_metadata?.archived === true,
        locked: destination.thread_metadata?.locked === true,
      },
      readback,
    } : null,
    titleOnlyCandidateThreadIds: titleOnlyCandidates,
    complete,
    reasonCodes: unique(reasonCodes).sort(),
  };
}

async function inspectTagRuntime(operation, { env = process.env, fetchImpl = fetch } = {}) {
  const token = String(env?.DISCORDOS_BOT_TOKEN || "").trim();
  if (!token) return { ok: false, operationId: operation.operationId, status: "blocked", reasonCodes: ["discord_bot_token_missing"] };
  const read = await cardContract.discordRequest({ path: `/channels/${operation.threadId}`, token, fetchImpl });
  const actual = read.payload?.applied_tags || [];
  const pending = read.ok && read.payload?.parent_id === operation.forumChannelId && sameUniqueSet(actual, operation.preimage.appliedTagIds);
  const complete = read.ok && read.payload?.parent_id === operation.forumChannelId && sameUniqueSet(actual, operation.postimage.appliedTagIds);
  const reasonCodes = [];
  if (!read.ok) reasonCodes.push("tag_target_read_failed");
  if (read.ok && read.payload?.parent_id !== operation.forumChannelId) reasonCodes.push("tag_target_forum_mismatch");
  if (!pending && !complete) reasonCodes.push("tag_target_live_preimage_drift");
  return {
    ok: reasonCodes.length === 0,
    operationId: operation.operationId,
    status: complete ? "complete" : pending ? "pending" : "blocked",
    actualAppliedTagIds: actual,
    reasonCodes,
  };
}

function projectOrderRows(channels, operation) {
  const ids = new Set(operation.preimage.map((row) => row.channelId));
  return (channels || [])
    .filter((channel) => ids.has(channel.id))
    .sort((left, right) => left.position - right.position)
    .map((channel) => {
      const planned = operation.preimage.find((row) => row.channelId === channel.id);
      return { boardId: planned.boardId, channelId: channel.id, position: channel.position };
    });
}

function compareGuildChannelInvariants(channels, operation) {
  const planned = operation.guildChannelPreimage || [];
  const current = (channels || [])
    .map(guildChannelInvariant)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const boardIds = new Set(operation.preimage.map((row) => row.channelId));
  const plannedById = new Map(planned.map((row) => [row.id, row]));
  const currentById = new Map(current.map((row) => [row.id, row]));
  const channelSetExact = sameSet(planned.map((row) => row.id), current.map((row) => row.id));
  const unrelatedExact = channelSetExact && planned
    .filter((row) => !boardIds.has(row.id))
    .every((row) => canonicalJson(row) === canonicalJson(currentById.get(row.id)));
  const boardInvariantsExact = channelSetExact && [...boardIds].every((id) => {
    const expected = plannedById.get(id);
    const actual = currentById.get(id);
    if (!expected || !actual) return false;
    const { position: ignoredExpectedPosition, ...expectedInvariant } = expected;
    const { position: ignoredActualPosition, ...actualInvariant } = actual;
    return canonicalJson(expectedInvariant) === canonicalJson(actualInvariant);
  });
  return { current, channelSetExact, unrelatedExact, boardInvariantsExact };
}

async function inspectOrderRuntime(operation, { env = process.env, fetchImpl = fetch } = {}) {
  const token = String(env?.DISCORDOS_BOT_TOKEN || "").trim();
  if (!token) return { ok: false, operationId: operation.operationId, status: "blocked", reasonCodes: ["discord_bot_token_missing"] };
  const read = await cardContract.discordRequest({ path: `/guilds/${operation.guildId}/channels`, token, fetchImpl });
  const rows = read.ok && Array.isArray(read.payload) ? projectOrderRows(read.payload, operation) : [];
  const invariants = read.ok && Array.isArray(read.payload)
    ? compareGuildChannelInvariants(read.payload, operation)
    : { current: [], channelSetExact: false, unrelatedExact: false, boardInvariantsExact: false };
  const pending = canonicalJson(rows) === canonicalJson(operation.preimage);
  const complete = canonicalJson(rows) === canonicalJson(operation.postimage);
  const reasonCodes = [];
  if (!read.ok || !Array.isArray(read.payload)) reasonCodes.push("forum_order_read_failed");
  if (read.ok && !invariants.channelSetExact) reasonCodes.push("forum_order_guild_channel_set_drift");
  if (read.ok && !invariants.unrelatedExact) reasonCodes.push("forum_order_unrelated_channel_drift");
  if (read.ok && !invariants.boardInvariantsExact) reasonCodes.push("forum_order_board_invariant_drift");
  if (!pending && !complete) reasonCodes.push("forum_order_live_preimage_drift");
  return {
    ok: reasonCodes.length === 0,
    operationId: operation.operationId,
    status: reasonCodes.length > 0 ? "blocked" : complete ? "complete" : pending ? "pending" : "blocked",
    rows,
    guildChannelReadback: invariants,
    reasonCodes,
  };
}

async function applyTagRepair(operation, { env = process.env, fetchImpl = fetch } = {}) {
  const token = String(env?.DISCORDOS_BOT_TOKEN || "").trim();
  const write = await cardContract.discordRequest({
    path: `/channels/${operation.threadId}`,
    token,
    method: "PATCH",
    body: { applied_tags: operation.postimage.appliedTagIds },
    fetchImpl,
  });
  const readback = await inspectTagRuntime(operation, { env, fetchImpl });
  const reasonCodes = [];
  if (!write.ok) reasonCodes.push("tag_repair_write_failed");
  if (readback.status !== "complete") reasonCodes.push("tag_repair_readback_failed");
  return { ok: reasonCodes.length === 0, operationId: operation.operationId, status: reasonCodes.length === 0 ? "applied" : "blocked", writeCount: write.ok ? 1 : 0, httpStatus: write.status, readback, reasonCodes };
}

async function applyOrderRepair(operation, { env = process.env, fetchImpl = fetch } = {}) {
  const token = String(env?.DISCORDOS_BOT_TOKEN || "").trim();
  const write = await cardContract.discordRequest({
    path: `/guilds/${operation.guildId}/channels`,
    token,
    method: "PATCH",
    body: operation.postimage.map((row) => ({ id: row.channelId, position: row.position })),
    fetchImpl,
  });
  const readback = await inspectOrderRuntime(operation, { env, fetchImpl });
  const reasonCodes = [];
  if (!write.ok) reasonCodes.push("forum_order_repair_write_failed");
  if (readback.status !== "complete") reasonCodes.push("forum_order_repair_readback_failed");
  return { ok: reasonCodes.length === 0, operationId: operation.operationId, status: reasonCodes.length === 0 ? "applied" : "blocked", writeCount: write.ok ? 1 : 0, httpStatus: write.status, readback, reasonCodes };
}

function validateTransferReceipt(operation, receipt) {
  const reasonCodes = [];
  pushIf(reasonCodes, receipt?.ok !== true, "completed_transfer_failed");
  pushIf(reasonCodes, receipt?.completed?.threadId == null, "completed_transfer_destination_missing");
  pushIf(reasonCodes, receipt?.completed?.reaction?.presentAfter !== true, "completed_transfer_success_reaction_missing");
  pushIf(reasonCodes, !["created", "reused", "updated"].includes(receipt?.completed?.journal?.action), "completed_transfer_journal_missing");
  const destinationReadback = receipt?.completed?.readback || {};
  for (const field of ["threadRead", "messageRead", "parentMatches", "cardMarkerPresent", "canonicalBodyPresent", "completedStatePresent", "sourceLinkPresent", "appliedTagsExact", "journalRead", "journalMarkerPresent", "bodyExact", "journalExact", "archiveStateExact"]) {
    pushIf(reasonCodes, destinationReadback[field] !== true, `completed_transfer_destination_readback_missing:${field}`);
  }
  const sourceReadback = receipt?.source?.readback || {};
  for (const field of ["threadRead", "messageRead", "archived", "locked", "completedLinkPresent", "postimageExact"]) {
    pushIf(reasonCodes, sourceReadback[field] !== true, `completed_transfer_source_readback_missing:${field}`);
  }
  return { ok: reasonCodes.length === 0, operationId: operation.operationId, reasonCodes };
}

function resolveAdmission({ mode, allowApply, env = process.env }) {
  if (mode !== "apply") return { requested: false, admitted: false, status: "no_write_mode", reasonCodes: [] };
  const reasonCodes = [];
  if (!allowApply) reasonCodes.push("explicit_allow_apply_flag_missing");
  if (env?.[REPAIR_ENV] !== REPAIR_ENV_VALUE) reasonCodes.push("current_board_drift_repair_env_guard_missing");
  if (env?.[completedTransfer.TRANSFER_ENV] !== completedTransfer.TRANSFER_ENV_VALUE) reasonCodes.push("board_completed_transfer_env_guard_missing");
  return { requested: true, admitted: reasonCodes.length === 0, status: reasonCodes.length === 0 ? "apply_admitted" : "blocked", reasonCodes };
}

async function buildLiveScan({ env = process.env, fetchImpl = fetch } = {}) {
  const [boardRegistry, profileRegistry] = await Promise.all([
    forumProfile.readJson(DEFAULT_BOARD_REGISTRY_PATH),
    forumProfile.readJson(DEFAULT_PROFILE_REGISTRY_PATH),
  ]);
  return (await forumProfile.buildLiveForumProfileScan({ boardRegistry, profileRegistry, env, fetchImpl })).receipt;
}

async function runRepair({
  mode = "preflight",
  plan,
  evidenceBytes,
  admittedScan,
  allowApply = false,
  env = process.env,
  fetchImpl = fetch,
  currentScanImpl = buildLiveScan,
  transferInspectionImpl = inspectTransferRuntime,
  tagInspectionImpl = inspectTagRuntime,
  orderInspectionImpl = inspectOrderRuntime,
  tagApplyImpl = applyTagRepair,
  orderApplyImpl = applyOrderRepair,
  transferApplyImpl = completedTransfer.buildCompletedBoardTransfer,
  offlineFixture = false,
  admittedEvidenceSha256 = ADMITTED_EVIDENCE_SHA256,
  trustedPlanDigestSha256 = TRUSTED_PLAN_DIGEST_SHA256,
} = {}) {
  const planReasonCodes = verifyPlan({
    plan,
    evidenceBytes,
    scan: admittedScan,
    admittedEvidenceSha256,
    trustedPlanDigestSha256,
  });
  const admission = resolveAdmission({ mode, allowApply, env });
  const reasonCodes = [...planReasonCodes, ...(mode === "apply" ? admission.reasonCodes : [])];
  if (mode === "apply" && offlineFixture) reasonCodes.push("apply_fixture_scan_not_allowed");
  if (reasonCodes.length > 0) {
    return {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      eventId: EVENT_ID,
      ok: false,
      status: "blocked",
      mode,
      admission,
      planDigestSha256: plan?.planDigestSha256 || null,
      mutatesDiscord: false,
      discordMutations: 0,
      operationReceipts: [],
      reasonCodes: unique(reasonCodes).sort(),
    };
  }
  const currentScan = await currentScanImpl({ env, fetchImpl });
  const scanEvaluation = currentScanEvaluation(plan, currentScan);
  if (!scanEvaluation.ok) reasonCodes.push(...scanEvaluation.reasonCodes);
  const tagOperations = plan.operations.filter((row) => row.kind === "tag_repair");
  const orderOperation = plan.operations.find((row) => row.kind === "forum_order_repair");
  const transferOperations = plan.operations.filter((row) => row.kind === "completed_transfer");
  let tagInspections = [];
  let orderInspection = null;
  let transferInspections = [];
  if (!offlineFixture && reasonCodes.length === 0) {
    tagInspections = await Promise.all(tagOperations.map((operation) => tagInspectionImpl(operation, { env, fetchImpl })));
    orderInspection = await orderInspectionImpl(orderOperation, { env, fetchImpl });
    for (const operation of transferOperations) {
      transferInspections.push(await transferInspectionImpl(operation, { env, fetchImpl }));
    }
    reasonCodes.push(...tagInspections.flatMap((row) => row.reasonCodes || []));
    reasonCodes.push(...(orderInspection?.reasonCodes || []));
    reasonCodes.push(...transferInspections.flatMap((row) => row.reasonCodes || []));
  }
  if (reasonCodes.length > 0 || mode !== "apply") {
    return {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      eventId: EVENT_ID,
      ok: reasonCodes.length === 0,
      status: reasonCodes.length > 0 ? "blocked" : mode === "dry_run" ? "dry_run_ready" : "preflight_ready",
      mode,
      admission,
      planDigestSha256: plan.planDigestSha256,
      evidence: plan.generatedFrom,
      scanEvaluation,
      runtimePreflight: offlineFixture ? { status: "fixture_scan_only", noNetwork: true } : {
        status: "exact_live_preimages_read",
        tags: tagInspections,
        order: orderInspection,
        transfers: transferInspections,
      },
      plannedOperationCount: plan.operations.length,
      mutatesDiscord: false,
      discordMutations: 0,
      operationReceipts: [],
      reasonCodes: unique(reasonCodes).sort(),
    };
  }

  const operationReceipts = [];
  let discordMutations = 0;
  const tagInspectionById = new Map(tagInspections.map((row) => [row.operationId, row]));
  for (const operation of tagOperations) {
    const inspection = tagInspectionById.get(operation.operationId);
    if (inspection?.status === "complete") {
      operationReceipts.push({ operationId: operation.operationId, kind: operation.kind, ok: true, status: "already_complete", writeCount: 0 });
      continue;
    }
    const receipt = await tagApplyImpl(operation, { env, fetchImpl });
    operationReceipts.push({ ...receipt, kind: operation.kind });
    discordMutations += receipt.writeCount || 0;
    if (!receipt.ok) reasonCodes.push(...receipt.reasonCodes);
    if (!receipt.ok) break;
  }
  if (reasonCodes.length === 0) {
    if (orderInspection?.status === "complete") {
      operationReceipts.push({ operationId: orderOperation.operationId, kind: orderOperation.kind, ok: true, status: "already_complete", writeCount: 0 });
    } else {
      const receipt = await orderApplyImpl(orderOperation, { env, fetchImpl });
      operationReceipts.push({ ...receipt, kind: orderOperation.kind });
      discordMutations += receipt.writeCount || 0;
      if (!receipt.ok) reasonCodes.push(...receipt.reasonCodes);
    }
  }
  const transferInspectionById = new Map(transferInspections.map((row) => [row.operationId, row]));
  if (reasonCodes.length === 0) {
    for (const operation of transferOperations) {
      const inspection = transferInspectionById.get(operation.operationId);
      if (inspection?.complete) {
        operationReceipts.push({ operationId: operation.operationId, kind: operation.kind, ok: true, status: "already_complete", writeCount: 0, readback: inspection.destination?.readback || null });
        continue;
      }
      const receipt = await transferApplyImpl({
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
        fetchImpl,
      });
      const validation = validateTransferReceipt(operation, receipt);
      const writeCount = receipt?.writeCount ?? (receipt?.ok ? 1 : 0);
      operationReceipts.push({ operationId: operation.operationId, kind: operation.kind, ok: validation.ok, status: validation.ok ? receipt.status : "blocked", writeCount, receipt, validation });
      discordMutations += writeCount;
      if (!validation.ok) reasonCodes.push(...validation.reasonCodes, ...(receipt?.reasonCodes || []));
      if (!validation.ok) break;
    }
  }
  let reconciliation = null;
  if (reasonCodes.length === 0) {
    const finalScan = await currentScanImpl({ env, fetchImpl });
    reconciliation = currentScanEvaluation(plan, finalScan);
    if (!reconciliation.ok || reconciliation.status !== "terminal") {
      reasonCodes.push(...reconciliation.reasonCodes);
      if (reconciliation.status !== "terminal") reasonCodes.push("terminal_reconciliation_incomplete");
    }
  }
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    eventId: EVENT_ID,
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "applied_and_reconciled" : "blocked",
    mode,
    admission,
    planDigestSha256: plan.planDigestSha256,
    evidence: plan.generatedFrom,
    scanEvaluation,
    runtimePreflight: { status: "exact_live_preimages_read", tags: tagInspections, order: orderInspection, transfers: transferInspections },
    operationReceipts,
    reconciliation,
    mutatesDiscord: discordMutations > 0,
    discordMutations,
    reasonCodes: unique(reasonCodes).sort(),
  };
}

function renderMarkdown(receipt) {
  return [
    "# DiscordOS Current Board Drift Repair",
    "",
    `- status: \`${receipt.status}\``,
    `- mode: \`${receipt.mode}\``,
    `- plan digest: \`${receipt.planDigestSha256 || "none"}\``,
    `- planned operations: \`${receipt.plannedOperationCount ?? receipt.operationReceipts?.length ?? 0}\``,
    `- Discord mutations: \`${receipt.discordMutations || 0}\``,
    `- reason codes: \`${receipt.reasonCodes?.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function readJsonWithBytes(filePath) {
  const bytes = await fs.readFile(filePath);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidence = await readJsonWithBytes(options.evidencePath);
  if (options.mode === "generate_plan") {
    const transferSources = await inspectTransferSources();
    const guildIds = unique(transferSources.map((row) => row.guildId).filter(Boolean));
    if (guildIds.length !== 1) throw new Error("transfer_source_guild_not_exact");
    const guildChannels = await inspectGuildChannels({ guildId: guildIds[0] });
    const plan = buildDeterministicPlan({
      scan: evidence.value,
      evidenceBytes: evidence.bytes,
      transferSources,
      guildChannels,
    });
    await writeJson(options.outputPath, plan);
    process.stdout.write(options.json ? `${JSON.stringify(plan, null, 2)}\n` : `plan_ready: ${plan.planDigestSha256}\n`);
    return;
  }
  const plan = (await readJsonWithBytes(options.planPath)).value;
  let fixtureScan = null;
  if (options.currentScanPath) fixtureScan = (await readJsonWithBytes(options.currentScanPath)).value;
  const receipt = await runRepair({
    mode: options.mode,
    plan,
    evidenceBytes: evidence.bytes,
    admittedScan: evidence.value,
    allowApply: options.allowApply,
    currentScanImpl: fixtureScan ? async () => structuredClone(fixtureScan) : buildLiveScan,
    offlineFixture: Boolean(fixtureScan),
  });
  if (options.outputPath) await writeJson(options.outputPath, receipt);
  process.stdout.write(options.json ? `${JSON.stringify(receipt, null, 2)}\n` : renderMarkdown(receipt));
  if (!receipt.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  _internals: {
    PLAN_SCHEMA_VERSION,
    RECEIPT_SCHEMA_VERSION,
    EVENT_ID,
    REPAIR_ENV,
    REPAIR_ENV_VALUE,
    ADMITTED_EVIDENCE_SHA256,
    TRUSTED_PLAN_DIGEST_SHA256,
    DEFAULT_PLAN_PATH,
    EXPECTED_BOARD_IDS,
    INITIAL_OBSERVED_BOARD_IDS,
    INITIAL_REASON_CODES,
    TAG_TARGETS,
    TRANSFER_TARGETS,
    sha256,
    canonicalJson,
    objectDigest,
    sameUniqueSet,
    parseArgs,
    initialEvidenceReasonCodes,
    buildDeterministicPlan,
    verifyPlan,
    inspectTransferSource,
    inspectTransferSources,
    inspectGuildChannels,
    currentScanEvaluation,
    inspectTransferRuntime,
    inspectTagRuntime,
    inspectOrderRuntime,
    guildChannelInvariant,
    compareGuildChannelInvariants,
    applyTagRepair,
    applyOrderRepair,
    validateTransferReceipt,
    resolveAdmission,
    buildLiveScan,
    runRepair,
    renderMarkdown,
  },
};
