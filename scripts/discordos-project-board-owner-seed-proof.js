const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: textIntegrity,
} = require("./discordos-board-text-integrity");

const DEFAULT_PROFILE_REGISTRY_PATH = path.resolve(__dirname, "..", "config", "discordos-forum-profile-registry.json");
const PROOF_SCHEMA_VERSION = "discordos.project-board-owner-seed-proof.v1";

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = { liveReceiptPath: null, scanReceiptPath: null, profileRegistryPath: DEFAULT_PROFILE_REGISTRY_PATH, outputPath: null, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--live-receipt") {
      options.liveReceiptPath = path.resolve(readValue(args, index, "missing_live_receipt_path"));
      index += 1;
    } else if (arg === "--scan-receipt") {
      options.scanReceiptPath = path.resolve(readValue(args, index, "missing_scan_receipt_path"));
      index += 1;
    } else if (arg === "--profiles") {
      options.profileRegistryPath = path.resolve(readValue(args, index, "missing_profiles_path"));
      index += 1;
    } else if (arg === "--output") {
      options.outputPath = path.resolve(readValue(args, index, "missing_output_path"));
      index += 1;
    } else if (arg === "--json") options.json = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (!options.liveReceiptPath) throw new Error("live_receipt_path_missing");
  if (!options.scanReceiptPath) throw new Error("scan_receipt_path_missing");
  if (!options.outputPath) throw new Error("output_path_missing");
  return options;
}

function countByBoard(rows) {
  const counts = {};
  for (const row of rows) counts[row.boardId] = (counts[row.boardId] || 0) + 1;
  return counts;
}

function exactDriftCounts(value, expectedCount) {
  const expectedKeys = [
    "stable_card_id_missing",
    "canonical_card_body_missing",
    "canonical_card_state_missing",
    "canonical_updated_timestamp_missing",
    "card_journal_history_missing",
  ];
  const keys = Object.keys(value || {}).sort();
  return keys.length === expectedKeys.length
    && expectedKeys.sort().every((key, index) => keys[index] === key && value[key] === expectedCount);
}

function buildOwnerSeedProof({ liveReceipt, scanReceipt, profileRegistry, now = () => new Date() }) {
  const contract = profileRegistry.ownerSeedProof;
  const baseline = contract.currentState;
  const reasonCodes = [];
  const results = Array.isArray(liveReceipt?.results) ? liveReceipt.results : [];
  if (liveReceipt?.ok !== true || liveReceipt?.status !== "journaled" || liveReceipt?.apply !== true) {
    reasonCodes.push("owner_seed_live_receipt_not_journaled");
  }
  if (liveReceipt?.eventCount !== contract.expectedEventCount || results.length !== contract.expectedEventCount) {
    reasonCodes.push("owner_seed_event_denominator_mismatch");
  }
  const uniqueEventIds = new Set(results.map((row) => row?.eventId).filter(Boolean));
  const uniqueCardIds = new Set(results.map((row) => row?.cardId).filter(Boolean));
  if (uniqueEventIds.size !== results.length) reasonCodes.push("owner_seed_event_identity_duplicate");
  if (uniqueCardIds.size !== results.length) reasonCodes.push("owner_seed_card_identity_duplicate");
  if (results.some((row) => row?.ok !== true || row?.status !== "journaled" || row?.reasonCodes?.length > 0)) {
    reasonCodes.push("owner_seed_result_not_clean");
  }
  if (results.some((row) => row?.cardAction !== "created" || row?.journalAction !== "created")) {
    reasonCodes.push("owner_seed_creation_count_mismatch");
  }
  if (results.some((row) => row?.readback?.starter !== true
    || row?.readback?.journal !== true
    || row?.readback?.starterCodePointsExact !== true
    || row?.readback?.journalCodePointsExact !== true)) {
    reasonCodes.push("owner_seed_exact_readback_failed");
  }

  if (scanReceipt?.inventorySource !== "registry"
    || scanReceipt?.status !== "drift_detected"
    || scanReceipt?.coverageStatus !== "complete"
    || scanReceipt?.registeredBoardCount !== 12
    || scanReceipt?.enabledBoardCount !== 12
    || scanReceipt?.uncoveredBoardCount !== 0) {
    reasonCodes.push("owner_seed_post_scan_coverage_incomplete");
  }
  if ((scanReceipt?.reasonCodes || []).length > 0) reasonCodes.push("owner_seed_post_scan_reason_codes_present");
  if (scanReceipt?.cardCount !== baseline.currentCardCount
    || scanReceipt?.healthyCardCount !== baseline.healthyCardCount
    || scanReceipt?.driftedCardCount !== baseline.remainingLegacyDriftCount
    || scanReceipt?.supersededRecordCount !== baseline.supersededRecordCount) {
    reasonCodes.push("owner_seed_post_scan_card_counts_mismatch");
  }
  if ((scanReceipt?.duplicates || []).length !== baseline.duplicateStableIdentityCount
    || scanReceipt?.actionableTextIntegrityFindingCount !== baseline.actionableTextIntegrityFindingCount
    || scanReceipt?.immutableSystemHistoryFindingCount !== baseline.immutableSystemHistoryFindingCount) {
    reasonCodes.push("owner_seed_post_scan_integrity_counts_mismatch");
  }
  if (!exactDriftCounts(scanReceipt?.driftCounts, baseline.remainingLegacyDriftCount)) {
    reasonCodes.push("owner_seed_remaining_drift_not_exactly_legacy");
  }

  const scanRows = Array.isArray(scanReceipt?.rows) ? scanReceipt.rows : [];
  const rowsByThread = new Map(scanRows.map((row) => [row.threadId, row]));
  const adoptedRows = results.map((result) => {
    const scanRow = rowsByThread.get(result.threadId) || null;
    const exactIdentity = Boolean(scanRow)
      && scanRow.cardId === result.cardId
      && scanRow.ok === true
      && scanRow.superseded !== true;
    return {
      eventId: result.eventId,
      cardId: result.cardId,
      threadId: result.threadId,
      boardId: scanRow?.boardId || null,
      exactStarterReadback: result.readback?.starterCodePointsExact === true,
      exactJournalReadback: result.readback?.journalCodePointsExact === true,
      presentAndHealthyInPostSeedScan: exactIdentity,
    };
  });
  if (adoptedRows.some((row) => !row.presentAndHealthyInPostSeedScan)) reasonCodes.push("owner_seed_post_scan_identity_missing");
  const observedByBoard = countByBoard(adoptedRows);
  for (const [boardId, count] of Object.entries(contract.expectedByBoard)) {
    if ((observedByBoard[boardId] || 0) !== count) reasonCodes.push(`owner_seed_board_count_mismatch:${boardId}`);
  }
  if (Object.keys(observedByBoard).some((boardId) => !Object.hasOwn(contract.expectedByBoard, boardId))) {
    reasonCodes.push("owner_seed_unexpected_board_adoption");
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)].sort();
  return {
    schemaVersion: PROOF_SCHEMA_VERSION,
    generatedAt: now().toISOString(),
    ok: uniqueReasonCodes.length === 0,
    status: uniqueReasonCodes.length === 0 ? "proven_78_of_78" : "blocked",
    readOnly: true,
    mutatesDiscord: false,
    sendsMessages: false,
    expectedEventCount: contract.expectedEventCount,
    journaledCount: results.filter((row) => row.ok && row.status === "journaled").length,
    cardCreatedCount: results.filter((row) => row.cardAction === "created").length,
    journalCreatedCount: results.filter((row) => row.journalAction === "created").length,
    starterExactReadbackCount: adoptedRows.filter((row) => row.exactStarterReadback).length,
    journalExactReadbackCount: adoptedRows.filter((row) => row.exactJournalReadback).length,
    postSeedCurrentCardCount: scanReceipt?.cardCount || 0,
    postSeedHealthyCardCount: scanReceipt?.healthyCardCount || 0,
    remainingLegacyDriftCount: scanReceipt?.driftedCardCount || 0,
    observedByBoard,
    expectedByBoard: contract.expectedByBoard,
    adoptedRows,
    reasonCodes: uniqueReasonCodes,
  };
}

function renderMarkdown(receipt) {
  return [
    "# DiscordOS Project Board Owner Seed Proof",
    "",
    `- status: \`${receipt.status}\``,
    `- journaled: \`${receipt.journaledCount}/${receipt.expectedEventCount}\``,
    `- cards created: \`${receipt.cardCreatedCount}/${receipt.expectedEventCount}\``,
    `- journals created: \`${receipt.journalCreatedCount}/${receipt.expectedEventCount}\``,
    `- starter exact readback: \`${receipt.starterExactReadbackCount}/${receipt.expectedEventCount}\``,
    `- journal exact readback: \`${receipt.journalExactReadbackCount}/${receipt.expectedEventCount}\``,
    `- remaining legacy drift: \`${receipt.remainingLegacyDriftCount}\``,
    `- reason codes: \`${receipt.reasonCodes.join(",") || "none"}\``,
    "- Discord mutation: `false`",
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [liveReceipt, scanReceipt, profileRegistry] = await Promise.all([
    textIntegrity.readUtf8Json(options.liveReceiptPath),
    textIntegrity.readUtf8Json(options.scanReceiptPath),
    textIntegrity.readUtf8Json(options.profileRegistryPath),
  ]);
  const receipt = buildOwnerSeedProof({ liveReceipt, scanReceipt, profileRegistry });
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
  PROOF_SCHEMA_VERSION,
  _internals: {
    DEFAULT_PROFILE_REGISTRY_PATH,
    parseArgs,
    countByBoard,
    exactDriftCounts,
    buildOwnerSeedProof,
    renderMarkdown,
  },
};
