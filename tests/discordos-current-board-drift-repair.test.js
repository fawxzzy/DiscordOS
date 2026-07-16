const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-current-board-drift-repair");

const repoRoot = path.resolve(__dirname, "..");
const planTemplate = JSON.parse(fs.readFileSync(path.join(
  repoRoot,
  "docs",
  "ops",
  "discordos-current-13-board-drift-repair-plan-2026-07-16.json",
), "utf8"));

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function makeInitialScan() {
  const tagOperations = planTemplate.operations.filter((row) => row.kind === "tag_repair");
  const transferOperations = planTemplate.operations.filter((row) => row.kind === "completed_transfer");
  const order = planTemplate.operations.find((row) => row.kind === "forum_order_repair");
  const tagMaps = new Map(_internals.EXPECTED_BOARD_IDS.map((boardId) => [boardId, new Map()]));
  for (const operation of tagOperations) {
    operation.preimage.appliedTagNames.forEach((name, index) => tagMaps.get(operation.boardId).set(name, operation.preimage.appliedTagIds[index]));
    operation.postimage.appliedTagNames.forEach((name, index) => tagMaps.get(operation.boardId).set(name, operation.postimage.appliedTagIds[index]));
  }
  const completed = transferOperations[0].destination;
  completed.appliedTagNames.forEach((name, index) => tagMaps.get("shared-completed").set(name, completed.appliedTagIds[index]));
  for (const [boardId, map] of tagMaps) {
    if (map.size === 0) map.set("Feature", `tag-${boardId}-feature`);
  }
  const semanticByBoard = new Map(_internals.EXPECTED_BOARD_IDS.map((boardId) => [boardId, []]));
  for (const operation of tagOperations) {
    semanticByBoard.get(operation.boardId).push({
      threadId: operation.threadId,
      cardId: operation.cardId,
      retainedLegacyHistory: false,
      expectedNames: clone(operation.postimage.appliedTagNames),
      actualNames: clone(operation.preimage.appliedTagNames),
      missingNames: operation.postimage.appliedTagNames.filter((name) => !operation.preimage.appliedTagNames.includes(name)),
      extraNames: operation.preimage.appliedTagNames.filter((name) => !operation.postimage.appliedTagNames.includes(name)),
      unknownNames: [],
      duplicateNames: [],
      orphanAppliedTagIds: [],
      exact: false,
    });
  }
  const forums = order.preimage.map((row) => ({
    ok: true,
    boardId: row.boardId,
    forumChannelId: row.channelId,
    structure: { observedPosition: row.position, reasonCodes: [] },
    tags: {
      ok: true,
      actual: [...tagMaps.get(row.boardId)].map(([name, id]) => ({ id, name, moderated: true, emojiId: null, emojiName: null })),
    },
    reasonCodes: [],
  }));
  const exactReadbackRows = [
    ...tagOperations.map((operation) => ({
      boardId: operation.boardId,
      threadId: operation.threadId,
      cardId: operation.cardId,
      superseded: false,
      retainedLegacyHistory: false,
      state: "review",
      archived: operation.boardId === "fitness-active",
      locked: operation.boardId === "fitness-active",
      starterContentSha256: `starter-${operation.threadId}`,
      reasonCodes: [],
    })),
    ...transferOperations.map((operation) => ({
      boardId: operation.source.boardId,
      threadId: operation.source.threadId,
      cardId: operation.source.cardId,
      superseded: false,
      retainedLegacyHistory: false,
      type: operation.source.type,
      state: operation.source.state,
      priority: operation.source.priority,
      archived: false,
      locked: false,
      starterContentSha256: operation.source.contentSha256,
      reasonCodes: [],
    })),
  ];
  return {
    schemaVersion: "discordos.forum-profile-scan.v1",
    generatedAt: planTemplate.generatedFrom.generatedAt,
    ok: false,
    status: "drift_detected",
    readOnly: true,
    mutatesDiscord: false,
    sendsMessages: false,
    denominator: {
      requiredBoardCount: 13,
      enabledBoardCount: 13,
      inspectedBoardCount: 13,
      uncoveredBoardCount: 0,
      coverageStatus: "complete",
      uncoveredBoards: [],
    },
    profileValidation: { ok: true, status: "valid", boardCount: 13, tagCount: 17, reasonCodes: [] },
    relativeOrder: {
      normalization: "not_applicable_preserve_declared_relative_order",
      matches: false,
      expectedBoardIds: clone(_internals.EXPECTED_BOARD_IDS),
      observedBoardIds: order.preimage.map((row) => row.boardId),
    },
    forums,
    cards: {
      status: "consistent",
      coverageStatus: "complete",
      registeredBoardCount: 13,
      enabledBoardCount: 13,
      uncoveredBoardCount: 0,
      currentCardCount: 243,
      totalThreadCount: 443,
      retainedLegacyHistoryCount: 151,
      healthyCardCount: 243,
      driftedCardCount: 0,
      supersededRecordCount: 49,
      duplicateStableIdentityCount: 0,
      actionableTextIntegrityFindingCount: 0,
      immutableSystemHistoryFindingCount: 124,
      driftCounts: {},
      boardProfiles: _internals.EXPECTED_BOARD_IDS.map((boardId) => ({
        boardId,
        appliedTagSafety: {
          ok: semanticByBoard.get(boardId).length === 0,
          orphanAppliedTagIds: [],
          ambiguousAppliedTags: [],
          semanticRows: semanticByBoard.get(boardId),
        },
      })),
      exactReadbackRows,
      reasonCodes: clone(_internals.INITIAL_REASON_CODES.slice(0, 3)),
    },
    reasonCodes: clone(_internals.INITIAL_REASON_CODES),
  };
}

function makeFixture() {
  const scan = makeInitialScan();
  const evidenceBytes = Buffer.from(JSON.stringify(scan));
  const admittedEvidenceSha256 = digest(evidenceBytes);
  const transferSources = planTemplate.operations
    .filter((row) => row.kind === "completed_transfer")
    .map((operation) => ({
      sourceThreadId: operation.source.threadId,
      sourceContentSha256: operation.source.contentSha256,
      title: operation.source.title,
      project: operation.source.project,
      type: operation.source.type,
      priority: operation.source.priority,
      owner: operation.source.owner,
      guildId: planTemplate.operations.find((row) => row.kind === "forum_order_repair").guildId,
      existingDestinationThreadIds: [],
    }));
  const plan = _internals.buildDeterministicPlan({
    scan,
    evidenceBytes,
    transferSources,
    admittedEvidenceSha256,
  });
  return { scan, evidenceBytes, admittedEvidenceSha256, plan };
}

function expectPlanGenerationBlocked(mutator, reasonFragment) {
  const fixture = makeFixture();
  const scan = clone(fixture.scan);
  mutator(scan);
  const bytes = Buffer.from(JSON.stringify(scan));
  assert.throws(() => _internals.buildDeterministicPlan({
    scan,
    evidenceBytes: bytes,
    transferSources: fixture.plan.operations.filter((row) => row.kind === "completed_transfer").map((operation) => ({
      sourceThreadId: operation.source.threadId,
      sourceContentSha256: operation.source.contentSha256,
      title: operation.source.title,
      project: operation.source.project,
      type: operation.source.type,
      priority: operation.source.priority,
      owner: operation.source.owner,
      guildId: fixture.plan.operations.find((row) => row.kind === "forum_order_repair").guildId,
      existingDestinationThreadIds: [],
    })),
    admittedEvidenceSha256: digest(bytes),
  }), new RegExp(reasonFragment));
}

test("deterministic plan binds the exact 14 + 1 + 3 operation set and both evidence digests", () => {
  const fixture = makeFixture();
  assert.equal(fixture.plan.operations.length, 18);
  assert.equal(fixture.plan.operations.filter((row) => row.kind === "tag_repair").length, 14);
  assert.equal(fixture.plan.operations.filter((row) => row.kind === "forum_order_repair").length, 1);
  assert.equal(fixture.plan.operations.filter((row) => row.kind === "completed_transfer").length, 3);
  assert.equal(fixture.plan.generatedFrom.rawSha256, fixture.admittedEvidenceSha256);
  assert.equal(fixture.plan.planDigestSha256, _internals.objectDigest(fixture.plan));
  assert.deepEqual(_internals.verifyPlan({
    plan: fixture.plan,
    evidenceBytes: fixture.evidenceBytes,
    scan: fixture.scan,
    admittedEvidenceSha256: fixture.admittedEvidenceSha256,
  }), []);
});

test("wrong admitted scan digest and changed plan digest fail closed", () => {
  const fixture = makeFixture();
  const wrong = Buffer.from(`${fixture.evidenceBytes.toString("utf8")} `);
  const reasons = _internals.verifyPlan({
    plan: fixture.plan,
    evidenceBytes: wrong,
    scan: fixture.scan,
    admittedEvidenceSha256: fixture.admittedEvidenceSha256,
  });
  assert(reasons.includes("admitted_evidence_digest_mismatch"));
  assert(reasons.includes("plan_evidence_raw_digest_mismatch"));
  const changed = clone(fixture.plan);
  changed.operations[0].threadId = "extra-target";
  assert(_internals.verifyPlan({
    plan: changed,
    evidenceBytes: fixture.evidenceBytes,
    scan: fixture.scan,
    admittedEvidenceSha256: fixture.admittedEvidenceSha256,
  }).includes("plan_digest_mismatch"));
});

test("extra drift reason or extra target is rejected", () => {
  expectPlanGenerationBlocked((scan) => scan.reasonCodes.push("unexpected_drift"), "admitted_drift_reason_set_mismatch");
  expectPlanGenerationBlocked((scan) => scan.cards.boardProfiles[0].appliedTagSafety.semanticRows.push({
    threadId: "extra",
    cardId: "EXTRA",
    expectedNames: ["Feature"],
    actualNames: [],
    unknownNames: [],
    duplicateNames: [],
    orphanAppliedTagIds: [],
    exact: false,
  }), "admitted_tag_target_count_mismatch");
});

test("missing board or missing target thread is rejected", () => {
  expectPlanGenerationBlocked((scan) => scan.forums.pop(), "admitted_forum_set_mismatch");
  expectPlanGenerationBlocked((scan) => {
    scan.cards.exactReadbackRows = scan.cards.exactReadbackRows.filter((row) => row.threadId !== _internals.TAG_TARGETS[0].threadId);
  }, "admitted_target_thread_missing");
});

test("card denominator, health, and duplicate identity changes are rejected", () => {
  expectPlanGenerationBlocked((scan) => { scan.cards.currentCardCount = 244; }, "admitted_current_card_denominator_mismatch");
  expectPlanGenerationBlocked((scan) => { scan.cards.driftedCardCount = 1; }, "admitted_unhealthy_card_detected");
  expectPlanGenerationBlocked((scan) => { scan.cards.duplicateStableIdentityCount = 1; }, "admitted_duplicate_stable_identity_detected");
});

test("ambiguous, orphan, or mismatched tag mappings are rejected", () => {
  expectPlanGenerationBlocked((scan) => { scan.forums[0].tags.actual.push(clone(scan.forums[0].tags.actual[0])); }, "admitted_ambiguous_tag_id");
  expectPlanGenerationBlocked((scan) => { scan.cards.boardProfiles[0].appliedTagSafety.orphanAppliedTagIds.push("orphan"); }, "admitted_orphan_tag");
  expectPlanGenerationBlocked((scan) => { scan.forums.find((row) => row.boardId === "fitness-active").tags.ok = false; }, "admitted_tag_mapping_mismatch");
});

test("expected-current tag and forum-order preimages are exact", () => {
  expectPlanGenerationBlocked((scan) => {
    const profile = scan.cards.boardProfiles.find((row) => row.boardId === "fitness-active");
    profile.appliedTagSafety.semanticRows[0].actualNames = ["Feature", "Opened"];
  }, "admitted_current_tag_mismatch");
  expectPlanGenerationBlocked((scan) => scan.relativeOrder.observedBoardIds.reverse(), "plan_generation_blocked");
});

test("default preflight and dry-run fixture modes produce zero writes", async () => {
  const fixture = makeFixture();
  let writes = 0;
  for (const mode of ["preflight", "dry_run"]) {
    const receipt = await _internals.runRepair({
      mode,
      plan: fixture.plan,
      evidenceBytes: fixture.evidenceBytes,
      admittedScan: fixture.scan,
      admittedEvidenceSha256: fixture.admittedEvidenceSha256,
      currentScanImpl: async () => clone(fixture.scan),
      offlineFixture: true,
      tagApplyImpl: async () => { writes += 1; throw new Error("write called"); },
    });
    assert.equal(receipt.ok, true);
    assert.equal(receipt.discordMutations, 0);
    assert.equal(receipt.mutatesDiscord, false);
  }
  assert.equal(writes, 0);
});

test("explicit apply flag and both environment guards are mandatory", async () => {
  const fixture = makeFixture();
  const receipt = await _internals.runRepair({
    mode: "apply",
    plan: fixture.plan,
    evidenceBytes: fixture.evidenceBytes,
    admittedScan: fixture.scan,
    admittedEvidenceSha256: fixture.admittedEvidenceSha256,
    currentScanImpl: async () => { throw new Error("preflight should not run"); },
    env: {},
  });
  assert.equal(receipt.ok, false);
  assert(receipt.reasonCodes.includes("explicit_allow_apply_flag_missing"));
  assert(receipt.reasonCodes.includes("current_board_drift_repair_env_guard_missing"));
  assert(receipt.reasonCodes.includes("board_completed_transfer_env_guard_missing"));
  assert.equal(receipt.discordMutations, 0);
});

function markTagComplete(scan, operation) {
  const profile = scan.cards.boardProfiles.find((row) => row.boardId === operation.boardId);
  const row = profile.appliedTagSafety.semanticRows.find((candidate) => candidate.threadId === operation.threadId);
  row.actualNames = clone(operation.postimage.appliedTagNames);
  row.missingNames = [];
  row.extraNames = [];
  row.exact = true;
  if (profile.appliedTagSafety.semanticRows.every((candidate) => candidate.exact)) {
    profile.appliedTagSafety.ok = true;
    scan.reasonCodes = scan.reasonCodes.filter((code) => code !== `card_tag_semantic_mismatch:${operation.boardId}`);
  }
}

function markOrderComplete(scan, operation) {
  for (const target of operation.postimage) {
    scan.forums.find((row) => row.boardId === target.boardId).structure.observedPosition = target.position;
  }
  scan.relativeOrder.observedBoardIds = operation.postimage.map((row) => row.boardId);
  scan.relativeOrder.matches = true;
  scan.reasonCodes = scan.reasonCodes.filter((code) => code !== "forum_relative_order_mismatch");
}

function markTransferComplete(scan, operation) {
  const destinationThreadId = `destination-${operation.source.cardId}`;
  scan.cards.currentCardCount += 1;
  scan.cards.healthyCardCount += 1;
  scan.cards.totalThreadCount += 1;
  scan.cards.exactReadbackRows.push({
    boardId: "shared-completed",
    threadId: destinationThreadId,
    cardId: operation.source.cardId,
    state: "completed",
    archived: false,
    locked: false,
    starterContentSha256: `completed-${operation.source.cardId}`,
    reasonCodes: [],
  });
  const source = scan.cards.exactReadbackRows.find((row) => row.threadId === operation.source.threadId);
  source.archived = true;
  source.locked = true;
  source.starterContentSha256 = `linked-${operation.source.cardId}`;
  const completedProfile = scan.cards.boardProfiles.find((row) => row.boardId === "shared-completed");
  completedProfile.appliedTagSafety.semanticRows.push({
    threadId: destinationThreadId,
    cardId: operation.source.cardId,
    expectedNames: clone(operation.destination.appliedTagNames),
    actualNames: clone(operation.destination.appliedTagNames),
    missingNames: [],
    extraNames: [],
    unknownNames: [],
    duplicateNames: [],
    orphanAppliedTagIds: [],
    exact: true,
  });
}

function successfulTransferReceipt(operation) {
  const destinationReadback = Object.fromEntries([
    "threadRead", "messageRead", "parentMatches", "cardMarkerPresent", "canonicalBodyPresent",
    "completedStatePresent", "sourceLinkPresent", "appliedTagsExact", "journalRead", "journalMarkerPresent",
  ].map((field) => [field, true]));
  return {
    ok: true,
    status: "transferred",
    writeCount: 6,
    source: { readback: { threadRead: true, messageRead: true, archived: true, locked: true, completedLinkPresent: true } },
    completed: {
      threadId: `destination-${operation.source.cardId}`,
      reaction: { presentAfter: true },
      journal: { action: "created" },
      readback: destinationReadback,
    },
    reasonCodes: [],
  };
}

test("partial failure resumes safely and successful replay produces no duplicate writes", async () => {
  const fixture = makeFixture();
  const state = clone(fixture.scan);
  const applyCounts = new Map();
  let failSecondTag = true;
  const tagInspectionImpl = async (operation) => {
    const row = state.cards.boardProfiles.find((profile) => profile.boardId === operation.boardId)
      .appliedTagSafety.semanticRows.find((candidate) => candidate.threadId === operation.threadId);
    return { ok: true, operationId: operation.operationId, status: row.exact ? "complete" : "pending", reasonCodes: [] };
  };
  const orderInspectionImpl = async (operation) => ({
    ok: true,
    operationId: operation.operationId,
    status: state.relativeOrder.matches ? "complete" : "pending",
    reasonCodes: [],
  });
  const transferInspectionImpl = async (operation) => {
    const destination = state.cards.exactReadbackRows.find((row) => row.boardId === "shared-completed" && row.cardId === operation.source.cardId);
    return { ok: true, operationId: operation.operationId, status: destination ? "complete" : "pending", complete: Boolean(destination), destination: destination ? { readback: {} } : null, reasonCodes: [] };
  };
  const common = {
    mode: "apply",
    plan: fixture.plan,
    evidenceBytes: fixture.evidenceBytes,
    admittedScan: fixture.scan,
    admittedEvidenceSha256: fixture.admittedEvidenceSha256,
    allowApply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "fixture",
      DISCORDOS_CURRENT_BOARD_DRIFT_REPAIR: "enabled",
      DISCORDOS_BOARD_COMPLETED_TRANSFER: "enabled",
    },
    currentScanImpl: async () => clone(state),
    tagInspectionImpl,
    orderInspectionImpl,
    transferInspectionImpl,
    tagApplyImpl: async (operation) => {
      applyCounts.set(operation.operationId, (applyCounts.get(operation.operationId) || 0) + 1);
      if (operation.operationId === "tag-02" && failSecondTag) return { ok: false, operationId: operation.operationId, status: "blocked", writeCount: 0, reasonCodes: ["injected_partial_failure"] };
      markTagComplete(state, operation);
      return { ok: true, operationId: operation.operationId, status: "applied", writeCount: 1, reasonCodes: [] };
    },
    orderApplyImpl: async (operation) => {
      applyCounts.set(operation.operationId, (applyCounts.get(operation.operationId) || 0) + 1);
      markOrderComplete(state, operation);
      return { ok: true, operationId: operation.operationId, status: "applied", writeCount: 1, reasonCodes: [] };
    },
    transferApplyImpl: async (options) => {
      const operation = fixture.plan.operations.find((row) => row.kind === "completed_transfer" && row.source.threadId === options.sourceThreadId);
      applyCounts.set(operation.operationId, (applyCounts.get(operation.operationId) || 0) + 1);
      markTransferComplete(state, operation);
      return successfulTransferReceipt(operation);
    },
  };
  const first = await _internals.runRepair(common);
  assert.equal(first.ok, false);
  assert.equal(applyCounts.get("tag-01"), 1);
  assert.equal(applyCounts.get("tag-02"), 1);
  failSecondTag = false;
  const second = await _internals.runRepair(common);
  assert.equal(second.ok, true);
  assert.equal(second.status, "applied_and_reconciled");
  assert.equal(applyCounts.get("tag-01"), 1, "resume must not rewrite the completed first operation");
  const countsAfterSuccess = Object.fromEntries(applyCounts);
  const replay = await _internals.runRepair(common);
  assert.equal(replay.ok, true);
  assert.equal(replay.discordMutations, 0);
  assert.deepEqual(Object.fromEntries(applyCounts), countsAfterSuccess);
});

test("completed transfer receipt requires reciprocal link, archive, lock, body, journal, reaction, tags, and readback", () => {
  const operation = planTemplate.operations.find((row) => row.kind === "completed_transfer");
  const receipt = successfulTransferReceipt(operation);
  assert.equal(_internals.validateTransferReceipt(operation, receipt).ok, true);
  const broken = clone(receipt);
  broken.source.readback.completedLinkPresent = false;
  broken.completed.readback.appliedTagsExact = false;
  broken.completed.reaction.presentAfter = false;
  const result = _internals.validateTransferReceipt(operation, broken);
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("completed_transfer_source_readback_missing:completedLinkPresent"));
  assert(result.reasonCodes.includes("completed_transfer_destination_readback_missing:appliedTagsExact"));
  assert(result.reasonCodes.includes("completed_transfer_success_reaction_missing"));
});

test("historical closeout artifacts remain byte invariant", () => {
  const expected = new Map([
    ["docs/ops/discordos-canonical-13-board-migration-implementation-2026-07-15.md", "957bcaf06221f13d7704e54e800f7a1179cabbf310927d0ee56021c4ef3be0fc"],
    ["docs/contracts/discordos-forum-profile-normalization-v1.md", "f4b3e5a07decce5aeadce688fb100d646afbf8a5d468faae21ed11080851d300"],
    ["docs/ops/discordos-forum-profile-normalization-later-packets-2026-07-15.md", "b98852dd7dff1c9d8911873eb022ba9eb048e5a9f790c7ab810922e2bafe0d0a"],
  ]);
  for (const [relativePath, expectedSha] of expected) {
    assert.equal(digest(fs.readFileSync(path.join(repoRoot, relativePath))), expectedSha, relativePath);
  }
});
