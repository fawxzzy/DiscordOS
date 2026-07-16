const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-current-board-drift-repair");
const { _internals: completedTransfer } = require("../scripts/discordos-board-completed-transfer");
const { _internals: journal } = require("../scripts/discordos-board-card-journal");

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

function response({ ok = true, status = 200, payload = null } = {}) {
  return { ok, status, json: async () => payload };
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
      sourceContent: operation.source.content,
      title: operation.source.title,
      project: operation.source.project,
      type: operation.source.type,
      priority: operation.source.priority,
      owner: operation.source.owner,
      guildId: planTemplate.operations.find((row) => row.kind === "forum_order_repair").guildId,
      existingDestinationThreadIds: [],
    }));
  const guildChannels = planTemplate.operations
    .find((row) => row.kind === "forum_order_repair")
    .guildChannelPreimage
    .map((row) => ({
      id: row.id,
      type: row.type,
      parent_id: row.parentId,
      position: row.position,
      name: row.name,
    }));
  const plan = _internals.buildDeterministicPlan({
    scan,
    evidenceBytes,
    transferSources,
    guildChannels,
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
      sourceContent: operation.source.content,
      title: operation.source.title,
      project: operation.source.project,
      type: operation.source.type,
      priority: operation.source.priority,
      owner: operation.source.owner,
      guildId: fixture.plan.operations.find((row) => row.kind === "forum_order_repair").guildId,
      existingDestinationThreadIds: [],
    })),
    guildChannels: fixture.plan.operations.find((row) => row.kind === "forum_order_repair").guildChannelPreimage.map((row) => ({
      id: row.id,
      type: row.type,
      parent_id: row.parentId,
      position: row.position,
      name: row.name,
    })),
    admittedEvidenceSha256: digest(bytes),
  }), new RegExp(reasonFragment));
}

test("deterministic plan binds the exact 14 + 1 + 3 operation set and both evidence digests", () => {
  const fixture = makeFixture();
  assert.equal(planTemplate.planDigestSha256, _internals.TRUSTED_PLAN_DIGEST_SHA256);
  assert.equal(_internals.objectDigest(planTemplate), _internals.TRUSTED_PLAN_DIGEST_SHA256);
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
    trustedPlanDigestSha256: fixture.plan.planDigestSha256,
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
    trustedPlanDigestSha256: fixture.plan.planDigestSha256,
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
    trustedPlanDigestSha256: fixture.plan.planDigestSha256,
  }).includes("plan_digest_mismatch"));
});

test("recomputed digest cannot admit tampered tag IDs or order positions", () => {
  const fixture = makeFixture();
  for (const mutate of [
    (plan) => { plan.operations.find((row) => row.kind === "tag_repair").postimage.appliedTagIds[0] = "tampered-tag-id"; },
    (plan) => { plan.operations.find((row) => row.kind === "forum_order_repair").postimage[0].position += 100; },
  ]) {
    const changed = clone(fixture.plan);
    mutate(changed);
    changed.planDigestSha256 = _internals.objectDigest(changed);
    const reasons = _internals.verifyPlan({
      plan: changed,
      evidenceBytes: fixture.evidenceBytes,
      scan: fixture.scan,
      admittedEvidenceSha256: fixture.admittedEvidenceSha256,
      trustedPlanDigestSha256: fixture.plan.planDigestSha256,
    });
    assert(!reasons.includes("plan_digest_mismatch"));
    assert(reasons.includes("plan_trusted_digest_mismatch"));
  }
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

test("runtime tag IDs accept preimage and postimage permutations but reject duplicates", async () => {
  const operation = planTemplate.operations.find((row) => row.kind === "tag_repair" && row.preimage.appliedTagIds.length === 2);
  const inspect = (appliedTags) => _internals.inspectTagRuntime(operation, {
    env: { DISCORDOS_BOT_TOKEN: "fixture" },
    fetchImpl: async () => response({ payload: { parent_id: operation.forumChannelId, applied_tags: appliedTags } }),
  });
  const pending = await inspect([...operation.preimage.appliedTagIds].reverse());
  assert.equal(pending.status, "pending");
  const complete = await inspect([...operation.postimage.appliedTagIds].reverse());
  assert.equal(complete.status, "complete");
  const duplicate = await inspect([operation.preimage.appliedTagIds[0], operation.preimage.appliedTagIds[0]]);
  assert.equal(duplicate.status, "blocked");
  assert(duplicate.reasonCodes.includes("tag_target_live_preimage_drift"));
});

test("tag compare-before-write blocks concurrent target drift before every mutation", async () => {
  const fixture = makeFixture();
  const target = fixture.plan.operations.find((row) => row.kind === "tag_repair");
  const env = {
    DISCORDOS_BOT_TOKEN: "fixture",
    DISCORDOS_CURRENT_BOARD_DRIFT_REPAIR: "enabled",
    DISCORDOS_BOARD_COMPLETED_TRANSFER: "enabled",
  };
  let discordWrites = 0;
  let tagApplyCalls = 0;
  let laterApplyCalls = 0;
  const result = await _internals.runRepair({
    mode: "apply",
    plan: fixture.plan,
    evidenceBytes: fixture.evidenceBytes,
    admittedScan: fixture.scan,
    admittedEvidenceSha256: fixture.admittedEvidenceSha256,
    trustedPlanDigestSha256: fixture.plan.planDigestSha256,
    allowApply: true,
    env,
    currentScanImpl: async () => clone(fixture.scan),
    tagInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "pending", reasonCodes: [] }),
    orderInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "pending", reasonCodes: [] }),
    transferInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "complete", complete: true, destination: { readback: {} }, reasonCodes: [] }),
    tagApplyImpl: async (operation) => {
      tagApplyCalls += 1;
      return _internals.applyTagRepair(operation, {
        env,
        fetchImpl: async (url, init) => {
          if ((init.method || "GET") !== "GET") discordWrites += 1;
          assert(url.endsWith(`/channels/${target.threadId}`));
          return response({ payload: {
            parent_id: target.forumChannelId,
            applied_tags: ["concurrent-third-state"],
          } });
        },
      });
    },
    orderApplyImpl: async () => { laterApplyCalls += 1; throw new Error("order write followed tag barrier"); },
    transferApplyImpl: async () => { laterApplyCalls += 1; throw new Error("transfer write followed tag barrier"); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.discordMutations, 0);
  assert.equal(discordWrites, 0);
  assert.equal(tagApplyCalls, 1, "the first changed target blocks the remaining tag loop");
  assert.equal(laterApplyCalls, 0);
  assert(result.reasonCodes.includes("tag_repair_compare_before_write_failed"));
});

test("forum order compare-before-write blocks concurrent order drift before every mutation", async () => {
  const fixture = makeFixture();
  const order = fixture.plan.operations.find((row) => row.kind === "forum_order_repair");
  const env = {
    DISCORDOS_BOT_TOKEN: "fixture",
    DISCORDOS_CURRENT_BOARD_DRIFT_REPAIR: "enabled",
    DISCORDOS_BOARD_COMPLETED_TRANSFER: "enabled",
  };
  const channels = order.guildChannelPreimage.map((row) => ({
    id: row.id,
    type: row.type,
    parent_id: row.parentId,
    position: row.position,
    name: row.name,
  }));
  channels.find((row) => row.id === order.preimage[0].channelId).position += 100;
  let discordWrites = 0;
  let transferApplyCalls = 0;
  const result = await _internals.runRepair({
    mode: "apply",
    plan: fixture.plan,
    evidenceBytes: fixture.evidenceBytes,
    admittedScan: fixture.scan,
    admittedEvidenceSha256: fixture.admittedEvidenceSha256,
    trustedPlanDigestSha256: fixture.plan.planDigestSha256,
    allowApply: true,
    env,
    currentScanImpl: async () => clone(fixture.scan),
    tagInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "complete", reasonCodes: [] }),
    orderInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "pending", reasonCodes: [] }),
    transferInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "complete", complete: true, destination: { readback: {} }, reasonCodes: [] }),
    orderApplyImpl: async (operation) => _internals.applyOrderRepair(operation, {
      env,
      fetchImpl: async (url, init) => {
        if ((init.method || "GET") !== "GET") discordWrites += 1;
        assert(url.endsWith(`/guilds/${order.guildId}/channels`));
        return response({ payload: channels });
      },
    }),
    transferApplyImpl: async () => { transferApplyCalls += 1; throw new Error("transfer write followed order barrier"); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.discordMutations, 0);
  assert.equal(discordWrites, 0);
  assert.equal(transferApplyCalls, 0);
  assert(result.reasonCodes.includes("forum_order_compare_before_write_failed"));
});

test("rejected tag write preserves earlier confirmed mutations and the ambiguous outcome", async () => {
  const fixture = makeFixture();
  const tagOperations = fixture.plan.operations.filter((row) => row.kind === "tag_repair");
  const env = {
    DISCORDOS_BOT_TOKEN: "fixture",
    DISCORDOS_CURRENT_BOARD_DRIFT_REPAIR: "enabled",
    DISCORDOS_BOARD_COMPLETED_TRANSFER: "enabled",
  };
  const liveTags = new Map(tagOperations.map((operation) => [operation.threadId, clone(operation.preimage.appliedTagIds)]));
  let patchAttempts = 0;
  let laterApplyCalls = 0;
  const fetchImpl = async (url, init) => {
    const operation = tagOperations.find((row) => url.endsWith(`/channels/${row.threadId}`));
    assert(operation, `unexpected tag URL ${url}`);
    if ((init.method || "GET") === "PATCH") {
      patchAttempts += 1;
      if (patchAttempts === 2) throw new Error("Injected tag transport rejection");
      liveTags.set(operation.threadId, clone(operation.postimage.appliedTagIds));
    }
    return response({ payload: { parent_id: operation.forumChannelId, applied_tags: clone(liveTags.get(operation.threadId)) } });
  };
  const result = await _internals.runRepair({
    mode: "apply",
    plan: fixture.plan,
    evidenceBytes: fixture.evidenceBytes,
    admittedScan: fixture.scan,
    admittedEvidenceSha256: fixture.admittedEvidenceSha256,
    trustedPlanDigestSha256: fixture.plan.planDigestSha256,
    allowApply: true,
    env,
    currentScanImpl: async () => clone(fixture.scan),
    tagInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "pending", reasonCodes: [] }),
    orderInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "pending", reasonCodes: [] }),
    transferInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "complete", complete: true, destination: { readback: {} }, reasonCodes: [] }),
    tagApplyImpl: async (operation) => _internals.applyTagRepair(operation, { env, fetchImpl }),
    orderApplyImpl: async () => { laterApplyCalls += 1; throw new Error("order ran after ambiguous tag write"); },
    transferApplyImpl: async () => { laterApplyCalls += 1; throw new Error("transfer ran after ambiguous tag write"); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.discordMutations, 1);
  assert.equal(result.discordMutationOutcomesUnknown, 1);
  assert.equal(result.mutatesDiscord, true);
  assert.equal(result.operationReceipts.length, 2);
  assert.equal(result.operationReceipts[0].writeCount, 1);
  assert.equal(result.operationReceipts[0].writeOutcomeUnknownCount, 0);
  assert.equal(result.operationReceipts[1].writeCount, 0);
  assert.equal(result.operationReceipts[1].writeOutcomeUnknownCount, 1);
  assert(result.reasonCodes.includes("discord_write_outcome_unknown"));
  assert.equal(laterApplyCalls, 0);
});

test("rejected forum-order write reaches a durable ambiguous-outcome receipt", async () => {
  const fixture = makeFixture();
  const order = fixture.plan.operations.find((row) => row.kind === "forum_order_repair");
  const env = {
    DISCORDOS_BOT_TOKEN: "fixture",
    DISCORDOS_CURRENT_BOARD_DRIFT_REPAIR: "enabled",
    DISCORDOS_BOARD_COMPLETED_TRANSFER: "enabled",
  };
  const channels = order.guildChannelPreimage.map((row) => ({
    id: row.id,
    type: row.type,
    parent_id: row.parentId,
    position: row.position,
    name: row.name,
  }));
  let transferApplyCalls = 0;
  let patchAttempts = 0;
  const result = await _internals.runRepair({
    mode: "apply",
    plan: fixture.plan,
    evidenceBytes: fixture.evidenceBytes,
    admittedScan: fixture.scan,
    admittedEvidenceSha256: fixture.admittedEvidenceSha256,
    trustedPlanDigestSha256: fixture.plan.planDigestSha256,
    allowApply: true,
    env,
    currentScanImpl: async () => clone(fixture.scan),
    tagInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "complete", reasonCodes: [] }),
    orderInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "pending", reasonCodes: [] }),
    transferInspectionImpl: async (operation) => ({ ok: true, operationId: operation.operationId, status: "complete", complete: true, destination: { readback: {} }, reasonCodes: [] }),
    orderApplyImpl: async (operation) => _internals.applyOrderRepair(operation, {
      env,
      fetchImpl: async (url, init) => {
        assert(url.endsWith(`/guilds/${order.guildId}/channels`));
        if ((init.method || "GET") === "PATCH") {
          patchAttempts += 1;
          throw new Error("Injected forum-order transport rejection");
        }
        return response({ payload: clone(channels) });
      },
    }),
    transferApplyImpl: async () => { transferApplyCalls += 1; throw new Error("transfer ran after ambiguous order write"); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(patchAttempts, 1);
  assert.equal(result.discordMutations, 0);
  assert.equal(result.discordMutationOutcomesUnknown, 1);
  assert.equal(result.mutatesDiscord, true);
  const orderReceipt = result.operationReceipts.find((row) => row.kind === "forum_order_repair");
  assert.equal(orderReceipt.writeCount, 0);
  assert.equal(orderReceipt.writeOutcomeUnknownCount, 1);
  assert(result.reasonCodes.includes("discord_write_outcome_unknown"));
  assert.equal(transferApplyCalls, 0);
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
      trustedPlanDigestSha256: fixture.plan.planDigestSha256,
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
    trustedPlanDigestSha256: fixture.plan.planDigestSha256,
    currentScanImpl: async () => { throw new Error("preflight should not run"); },
    env: {},
  });
  assert.equal(receipt.ok, false);
  assert(receipt.reasonCodes.includes("explicit_allow_apply_flag_missing"));
  assert(receipt.reasonCodes.includes("current_board_drift_repair_env_guard_missing"));
  assert(receipt.reasonCodes.includes("board_completed_transfer_env_guard_missing"));
  assert.equal(receipt.discordMutations, 0);
});

test("apply requires a durable output and accepts a resume receipt only in apply mode", () => {
  assert.throws(
    () => _internals.parseArgs(["--apply", "--evidence", "scan.json"]),
    /apply_output_path_missing/,
  );
  assert.throws(
    () => _internals.parseArgs(["--dry-run", "--evidence", "scan.json", "--resume-receipt", "prior.json"]),
    /resume_receipt_requires_apply/,
  );
  assert.throws(
    () => _internals.parseArgs(["--apply", "--evidence", "scan.json", "--output", "next.json", "--resume-receipt", "prior.json"]),
    /resume_receipt_digest_missing/,
  );
  const parsed = _internals.parseArgs([
    "--apply", "--allow-apply", "--evidence", "scan.json", "--output", "next.json",
    "--resume-receipt", "prior.json", "--resume-receipt-sha256", "a".repeat(64),
  ]);
  assert.equal(parsed.mode, "apply");
  assert.equal(parsed.allowApply, true);
  assert.equal(parsed.resumeReceiptPath, path.resolve("prior.json"));
  assert.equal(parsed.resumeReceiptSha256, "a".repeat(64));
  assert.equal(parsed.outputPath, path.resolve("next.json"));
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
    "bodyExact", "journalExact", "archiveStateExact",
  ].map((field) => [field, true]));
  return {
    ok: true,
    status: "transferred",
    cardId: operation.source.cardId,
    writeCount: 6,
    source: { readback: { threadRead: true, messageRead: true, archived: true, locked: true, completedLinkPresent: true, postimageExact: true } },
    completed: {
      threadId: `destination-${operation.source.cardId}`,
      archiveState: { expected: { archived: false, locked: false } },
      reaction: { presentAfter: true },
      journal: { action: "created" },
      readback: destinationReadback,
    },
    reasonCodes: [],
  };
}

test("a plan-bound blocked receipt authorizes only its exact incomplete destination state", async () => {
  const fixture = makeFixture();
  const operation = fixture.plan.operations.find((row) => row.kind === "completed_transfer");
  const completedOperation = fixture.plan.operations.find((row) =>
    row.kind === "completed_transfer" && row.operationId !== operation.operationId
  );
  const resumeReceipt = {
    schemaVersion: _internals.RECEIPT_SCHEMA_VERSION,
    eventId: _internals.EVENT_ID,
    ok: false,
    status: "blocked",
    mode: "apply",
    planDigestSha256: fixture.plan.planDigestSha256,
    evidence: clone(fixture.plan.generatedFrom),
    operationReceipts: [{
      operationId: operation.operationId,
      kind: operation.kind,
      ok: false,
      status: "blocked",
      receipt: {
        cardId: operation.source.cardId,
        completed: {
          threadId: "destination-resume",
          archiveState: { expected: { archived: false, locked: false } },
        },
      },
    }, {
      operationId: completedOperation.operationId,
      kind: completedOperation.kind,
      ok: true,
      status: "transferred",
      receipt: successfulTransferReceipt(completedOperation),
    }],
  };
  const resumeReceiptBytes = Buffer.from(JSON.stringify(resumeReceipt));
  const trustedResumeReceiptSha256 = digest(resumeReceiptBytes);
  const extracted = _internals.extractTransferResumeStates(fixture.plan, resumeReceipt, {
    resumeReceiptBytes,
    trustedResumeReceiptSha256,
  });
  assert.equal(extracted.ok, true);
  assert.deepEqual(extracted.states.get(operation.operationId), {
    threadId: "destination-resume",
    archived: false,
    locked: false,
  });

  const capturedInspectionStates = [];
  const capturedApplyStates = [];
  const result = await _internals.runRepair({
    mode: "apply",
    plan: fixture.plan,
    evidenceBytes: fixture.evidenceBytes,
    admittedScan: fixture.scan,
    admittedEvidenceSha256: fixture.admittedEvidenceSha256,
    trustedPlanDigestSha256: fixture.plan.planDigestSha256,
    resumeReceipt,
    resumeReceiptBytes,
    trustedResumeReceiptSha256,
    allowApply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "fixture",
      DISCORDOS_CURRENT_BOARD_DRIFT_REPAIR: "enabled",
      DISCORDOS_BOARD_COMPLETED_TRANSFER: "enabled",
    },
    currentScanImpl: async () => clone(fixture.scan),
    tagInspectionImpl: async (candidate) => ({ ok: true, operationId: candidate.operationId, status: "complete", reasonCodes: [] }),
    orderInspectionImpl: async (candidate) => ({ ok: true, operationId: candidate.operationId, status: "complete", reasonCodes: [] }),
    transferInspectionImpl: async (candidate, options) => {
      capturedInspectionStates.push([candidate.operationId, options.destinationStatePreimage]);
      return {
        ok: true,
        operationId: candidate.operationId,
        status: candidate.operationId === operation.operationId ? "pending" : "complete",
        complete: candidate.operationId !== operation.operationId,
        destination: { readback: {} },
        reasonCodes: [],
      };
    },
    transferApplyImpl: async (options) => {
      capturedApplyStates.push(options.destinationStatePreimage);
      return {
        ok: false,
        status: "blocked",
        cardId: operation.source.cardId,
        writeCount: 0,
        writeOutcomeUnknownCount: 1,
        reasonCodes: ["injected_stop"],
      };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.discordMutations, 0);
  assert.equal(result.discordMutationOutcomesUnknown, 1);
  assert.equal(result.mutatesDiscord, true, "unknown write outcomes must not be reported as a definite no-mutation result");
  assert.deepEqual(capturedInspectionStates.find(([id]) => id === operation.operationId)[1], extracted.states.get(operation.operationId));
  assert.deepEqual(capturedApplyStates, [extracted.states.get(operation.operationId)]);

  const tampered = clone(resumeReceipt);
  tampered.operationReceipts[0].receipt.completed.threadId = "wrong-destination";
  const tamperedBytes = Buffer.from(JSON.stringify(tampered));
  const tamperedState = _internals.extractTransferResumeStates(fixture.plan, tampered, {
    resumeReceiptBytes: tamperedBytes,
    trustedResumeReceiptSha256,
  });
  assert.equal(tamperedState.ok, false);
  assert(tamperedState.reasonCodes.includes("resume_receipt_trusted_digest_mismatch"));

  for (const [label, originalState, changedState] of [
    ["open-to-archived", { archived: false, locked: false }, { archived: true, locked: true }],
    ["archived-to-open", { archived: true, locked: true }, { archived: false, locked: false }],
  ]) {
    const original = clone(resumeReceipt);
    original.operationReceipts[0].receipt.completed.archiveState.expected = originalState;
    const originalBytes = Buffer.from(JSON.stringify(original));
    const originalExtracted = _internals.extractTransferResumeStates(fixture.plan, original, {
      resumeReceiptBytes: originalBytes,
      trustedResumeReceiptSha256: digest(originalBytes),
    });
    assert.equal(originalExtracted.ok, true, `${label}-valid`);
    assert.deepEqual(originalExtracted.states.get(operation.operationId), {
      threadId: "destination-resume",
      ...originalState,
    }, `${label}-valid`);
    const changed = clone(original);
    changed.operationReceipts[0].receipt.completed.archiveState.expected = changedState;
    const changedBytes = Buffer.from(JSON.stringify(changed));
    let scans = 0;
    const rejected = await _internals.runRepair({
      mode: "apply",
      plan: fixture.plan,
      evidenceBytes: fixture.evidenceBytes,
      admittedScan: fixture.scan,
      admittedEvidenceSha256: fixture.admittedEvidenceSha256,
      trustedPlanDigestSha256: fixture.plan.planDigestSha256,
      resumeReceipt: changed,
      resumeReceiptBytes: changedBytes,
      trustedResumeReceiptSha256: digest(originalBytes),
      allowApply: true,
      env: {
        DISCORDOS_BOT_TOKEN: "fixture",
        DISCORDOS_CURRENT_BOARD_DRIFT_REPAIR: "enabled",
        DISCORDOS_BOARD_COMPLETED_TRANSFER: "enabled",
      },
      currentScanImpl: async () => { scans += 1; throw new Error("tampered receipt reached preflight"); },
    });
    assert.equal(rejected.ok, false, label);
    assert.equal(rejected.discordMutations, 0, label);
    assert.equal(rejected.discordMutationOutcomesUnknown, 0, label);
    assert.equal(scans, 0, label);
    assert(rejected.reasonCodes.includes("resume_receipt_trusted_digest_mismatch"), label);
  }
});

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
    trustedPlanDigestSha256: fixture.plan.planDigestSha256,
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
      assert.equal(options.sourceTitlePreimage, operation.source.title, "apply must pass the trusted planned source title");
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

test("completed transfer replay rejects corrupted owner, project, evidence, or body and accepts only exact repair", async () => {
  const operation = planTemplate.operations.find((row) => row.kind === "completed_transfer");
  const destinationId = "completed-destination";
  const guildId = planTemplate.operations.find((row) => row.kind === "forum_order_repair").guildId;
  const sourceUrl = completedTransfer.discordThreadUrl(guildId, operation.source.threadId);
  const destinationUrl = completedTransfer.discordThreadUrl(guildId, destinationId);
  const expectedDestination = completedTransfer.buildCompletedMessage({
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
  });
  const expectedSource = completedTransfer.buildSourceMessage({
    sourceContent: operation.source.content,
    destinationUrl,
    cardId: operation.source.cardId,
  });
  const expectedJournal = journal.buildJournalMessage(completedTransfer.buildCompletedEvent({
    cardId: operation.source.cardId,
    project: operation.source.project,
    sourceForumChannelId: operation.source.forumChannelId,
    title: operation.source.title,
    type: operation.source.type,
    priority: operation.source.priority,
    owner: operation.source.owner,
    eventId: operation.event.eventId,
    occurredAt: operation.event.occurredAt,
    sourceUrl,
    destinationUrl,
    evidence: operation.event.evidence,
  }));
  const inspect = (destinationContent, {
    sourceContent = expectedSource,
    sourceArchived = true,
    sourceLocked = true,
    destinationStatePreimage = null,
  } = {}) => _internals.inspectTransferRuntime(operation, {
    env: { DISCORDOS_BOT_TOKEN: "fixture" },
    destinationStatePreimage,
    fetchImpl: async (url) => {
      if (url.endsWith(`/channels/${operation.source.threadId}/messages/${operation.source.threadId}`)) {
        return response({ payload: { id: operation.source.threadId, content: sourceContent } });
      }
      if (url.endsWith(`/channels/${operation.source.threadId}`)) {
        return response({ payload: {
          id: operation.source.threadId,
          name: operation.source.title,
          parent_id: operation.source.forumChannelId,
          guild_id: guildId,
          thread_metadata: {
            ...(sourceArchived == null ? {} : { archived: sourceArchived }),
            ...(sourceLocked == null ? {} : { locked: sourceLocked }),
          },
        } });
      }
      if (url.endsWith(`/guilds/${guildId}/threads/active`)) {
        return response({ payload: { threads: [{
          id: destinationId,
          name: operation.source.title,
          parent_id: operation.destination.forumChannelId,
          applied_tags: [...operation.destination.appliedTagIds].reverse(),
        }] } });
      }
      if (url.endsWith(`/channels/${operation.destination.forumChannelId}/threads/archived/public?limit=100`)) {
        return response({ payload: { threads: [], has_more: false } });
      }
      if (url.endsWith(`/channels/${destinationId}/messages/${destinationId}`)) {
        return response({ payload: {
          id: destinationId,
          content: destinationContent,
          reactions: [{ emoji: { name: "success", id: "1507384062166302851" }, me: true, count: 1 }],
        } });
      }
      if (url.endsWith(`/channels/${destinationId}/messages?limit=100`)) {
        return response({ payload: [{ id: "journal", content: expectedJournal }] });
      }
      throw new Error(`unexpected request ${url}`);
    },
  });

  const exact = await inspect(expectedDestination);
  assert.equal(exact.status, "complete");
  assert.equal(exact.complete, true);
  const linkedOpen = await inspect(expectedDestination, { sourceArchived: false, sourceLocked: null });
  assert.equal(linkedOpen.ok, true);
  assert.equal(linkedOpen.status, "pending");
  assert.equal(linkedOpen.complete, false);
  assert.equal(linkedOpen.source.linkWrittenOpenExact, true);
  assert(!linkedOpen.reasonCodes.includes("transfer_source_content_preimage_drift"));
  const corruptedLinkedOpen = await inspect(expectedDestination, {
    sourceContent: `${expectedSource}\ncorrupt-source-body`,
    sourceArchived: false,
    sourceLocked: false,
  });
  assert.equal(corruptedLinkedOpen.ok, false);
  assert(corruptedLinkedOpen.reasonCodes.includes("transfer_source_content_preimage_drift"));
  const halfTransition = await inspect(expectedDestination, { sourceArchived: false, sourceLocked: true });
  assert.equal(halfTransition.ok, false);
  assert(halfTransition.reasonCodes.includes("transfer_source_content_preimage_drift"));
  const archivedOmitted = await inspect(expectedDestination, { sourceArchived: null, sourceLocked: null });
  assert.equal(archivedOmitted.ok, false);
  assert(archivedOmitted.reasonCodes.includes("transfer_source_content_preimage_drift"));
  const pristineMetadataMissing = await inspect(expectedDestination, {
    sourceContent: operation.source.content,
    sourceArchived: null,
    sourceLocked: null,
  });
  assert.equal(pristineMetadataMissing.ok, false);
  assert(pristineMetadataMissing.reasonCodes.includes("transfer_source_content_preimage_drift"));
  const pristineUnlockedOmitted = await inspect(expectedDestination, {
    sourceContent: operation.source.content,
    sourceArchived: false,
    sourceLocked: null,
  });
  assert.equal(pristineUnlockedOmitted.ok, true);
  assert.equal(pristineUnlockedOmitted.status, "pending");
  assert.equal(pristineUnlockedOmitted.source.preimageExact, true);
  const corruptions = [
    expectedDestination.replace(`- owner: \`${operation.source.owner}\``, "- owner: `corrupt-owner`"),
    expectedDestination.replace(`- project: \`${operation.source.project}\``, "- project: `corrupt-project`"),
    expectedDestination.replace(operation.event.evidence, "corrupt-evidence"),
    `${expectedDestination}\ncorrupt-body`,
  ];
  for (const corruption of corruptions) {
    const result = await inspect(corruption);
    assert.equal(result.ok, false);
    assert.equal(result.status, "blocked");
    assert.equal(result.complete, false);
    assert.equal(result.destination.readback.bodyExact, false);
    assert(result.reasonCodes.includes("completed_card_destination_archive_preimage_unknown"));
    const resumed = await inspect(corruption, {
      destinationStatePreimage: { threadId: destinationId, archived: false, locked: false },
    });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.status, "pending");
    assert.equal(resumed.destination.readback.archiveStateExact, true);
  }
  const wrongDestination = await inspect(corruptions[0], {
    destinationStatePreimage: { threadId: "wrong-destination", archived: false, locked: false },
  });
  assert.equal(wrongDestination.ok, false);
  assert(wrongDestination.reasonCodes.includes("completed_card_destination_state_thread_mismatch"));
});

test("forum order readback fails if an unrelated guild channel moves", async () => {
  const operation = planTemplate.operations.find((row) => row.kind === "forum_order_repair");
  const channels = operation.guildChannelPreimage.map((row) => ({
    id: row.id,
    type: row.type,
    parent_id: row.parentId,
    position: row.position,
    name: row.name,
  }));
  const boardIds = new Set(operation.preimage.map((row) => row.channelId));
  const unrelated = channels.find((row) => !boardIds.has(row.id));
  unrelated.position += 1;
  const result = await _internals.inspectOrderRuntime(operation, {
    env: { DISCORDOS_BOT_TOKEN: "fixture" },
    fetchImpl: async () => response({ payload: channels }),
  });
  assert.equal(result.status, "blocked");
  assert(result.reasonCodes.includes("forum_order_unrelated_channel_drift"));
});

test("historical closeout artifacts remain canonical Git-byte invariant", () => {
  const expected = new Map([
    ["docs/ops/discordos-canonical-13-board-migration-implementation-2026-07-15.md", "9eab268d33d8775d8e50dde6e371553d96ef4c2b17f7bb17a0d96cc169e911d6"],
    ["docs/contracts/discordos-forum-profile-normalization-v1.md", "8fd49c097c8429849468568a2c4d78566da6b682803448cc28615e0a5eac2387"],
    ["docs/ops/discordos-forum-profile-normalization-later-packets-2026-07-15.md", "db1b60ae16a28f2c26e265b18d72e84a16bd5880e912a58608617e013c3a47c2"],
  ]);
  for (const [relativePath, expectedSha] of expected) {
    const canonicalGitBytes = Buffer.from(fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n"));
    assert.equal(digest(canonicalGitBytes), expectedSha, relativePath);
  }
});
