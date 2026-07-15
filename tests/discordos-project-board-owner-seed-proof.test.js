const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-project-board-owner-seed-proof");

const profileRegistry = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "..", "config", "discordos-forum-profile-registry.json"),
  "utf8",
));

function receipts() {
  const results = [];
  const rows = [];
  let index = 0;
  for (const [boardId, count] of Object.entries(profileRegistry.ownerSeedProof.expectedByBoard)) {
    for (let boardIndex = 0; boardIndex < count; boardIndex += 1) {
      index += 1;
      const cardId = `CARD-${String(index).padStart(3, "0")}`;
      const threadId = `thread-${index}`;
      results.push({
        ok: true,
        status: "journaled",
        apply: true,
        eventId: `event-${index}`,
        cardId,
        threadId,
        cardAction: "created",
        journalAction: "created",
        readback: { starter: true, journal: true, starterCodePointsExact: true, journalCodePointsExact: true },
        reasonCodes: [],
      });
      rows.push({ ok: true, boardId, threadId, cardId, superseded: false, reasonCodes: [] });
    }
  }
  return {
    liveReceipt: { ok: true, status: "journaled", apply: true, eventCount: results.length, results, reasonCodes: [] },
    scanReceipt: {
      ok: false,
      status: "drift_detected",
      inventorySource: "registry",
      coverageStatus: "complete",
      registeredBoardCount: 12,
      enabledBoardCount: 12,
      uncoveredBoardCount: 0,
      cardCount: 367,
      healthyCardCount: 215,
      driftedCardCount: 152,
      supersededRecordCount: 49,
      duplicates: [],
      actionableTextIntegrityFindingCount: 0,
      immutableSystemHistoryFindingCount: 124,
      driftCounts: {
        stable_card_id_missing: 152,
        canonical_card_body_missing: 152,
        canonical_card_state_missing: 152,
        canonical_updated_timestamp_missing: 152,
        card_journal_history_missing: 152,
      },
      rows,
      reasonCodes: [],
    },
  };
}

test("post-seed proof recognizes all 78 exact starter and journal readbacks", () => {
  const input = receipts();
  const result = _internals.buildOwnerSeedProof({
    ...input,
    profileRegistry,
    now: () => new Date("2026-07-15T12:00:00.000Z"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "proven_78_of_78");
  assert.equal(result.journaledCount, 78);
  assert.equal(result.cardCreatedCount, 78);
  assert.equal(result.journalCreatedCount, 78);
  assert.equal(result.starterExactReadbackCount, 78);
  assert.equal(result.journalExactReadbackCount, 78);
  assert.equal(result.postSeedCurrentCardCount, 367);
  assert.equal(result.remainingLegacyDriftCount, 152);
});

test("post-seed proof fails closed on one inexact readback", () => {
  const input = receipts();
  input.liveReceipt.results[0].readback.journalCodePointsExact = false;
  const result = _internals.buildOwnerSeedProof({ ...input, profileRegistry });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("owner_seed_exact_readback_failed"));
});

test("post-seed proof requires both input receipts and an output path", () => {
  assert.throws(() => _internals.parseArgs([]), /live_receipt_path_missing/);
  assert.throws(() => _internals.parseArgs(["--live-receipt", "live.json"]), /scan_receipt_path_missing/);
  assert.throws(() => _internals.parseArgs([
    "--live-receipt", "live.json", "--scan-receipt", "scan.json",
  ]), /output_path_missing/);
  const options = _internals.parseArgs([
    "--live-receipt", "live.json",
    "--scan-receipt", "scan.json",
    "--output", "proof.json",
    "--json",
  ]);
  assert.equal(options.json, true);
});
