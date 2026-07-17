const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-current-live-board-reconcile");
const { _internals: cardContract } = require("../scripts/discordos-board-card-contract");
const { _internals: completedTransfer } = require("../scripts/discordos-board-completed-transfer");
const { _internals: currentRepair } = require("../scripts/discordos-current-board-drift-repair");
const { _internals: journal } = require("../scripts/discordos-board-card-journal");

const repoRoot = path.resolve(__dirname, "..");
const boardRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "discordos-board-registry.json"), "utf8"));
const sourceRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "discordos-current-owner-sources.json"), "utf8"));

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function event({ eventId, cardId, occurredAt, state = "in_progress" }) {
  return journal.normalizeEvent({
    schemaVersion: "atlas.board-card-journal.v1",
    eventId,
    occurredAt,
    actor: "stack-owner-export",
    card: {
      id: cardId,
      project: "_stack",
      sourceForumChannelId: "1526814478157742131",
      title: "Run the scheduled inbox sweep",
      type: "feature",
      state,
      priority: "high",
      owner: "_stack",
      progress: "UNMEASURED",
      summary: "Run the current scheduled inbox sweep.",
      objective: "Keep the stack inbox current.",
      acceptanceCriteria: ["The owner event is reused exactly"],
      discoveries: [],
      nextActions: ["Read back the exact card"],
      blockers: [],
      evidence: ["owner export"],
    },
    entry: {
      kind: "owner_export",
      headline: "Owner export reconciliation",
      completed: [],
      discovered: [],
      next: ["Read back the exact card"],
      blockers: [],
      evidence: ["owner export"],
    },
    correlation: { taskId: null, branch: null, commit: null },
  });
}

function archivedTagOperation({ operationId = "tag-01", threadId = "fitness-thread", cardId = "FIT-1" } = {}) {
  return {
    operationId,
    kind: "tag_repair",
    boardId: "fitness-active",
    forumChannelId: "fitness-forum",
    threadId,
    cardId,
    threadState: { archived: true, locked: true },
    preimage: { appliedTagNames: ["Feature", "Planning"], appliedTagIds: ["tag-feature", "tag-planning"] },
    postimage: { appliedTagNames: ["Feature", "Review"], appliedTagIds: ["tag-feature", "tag-review"] },
  };
}

test("CLI requires both a plan file and exact trusted file hash outside generation", () => {
  assert.throws(() => _internals.parseArgs(["--dry-run", "--plan", "plan.json"]), /trusted_plan_sha256_missing_or_invalid/);
  const options = _internals.parseArgs([
    "--apply",
    "--plan",
    "plan.json",
    "--plan-sha256",
    "a".repeat(64),
    "--output",
    "receipt.json",
    "--allow-apply",
  ]);
  assert.equal(options.mode, "apply");
  assert.equal(options.planSha256, "a".repeat(64));
  assert.equal(options.allowApply, true);
  const generation = _internals.parseArgs([
    "--generate-plan",
    "--structure-only",
    "--evidence",
    "scan.json",
    "--output",
    "plan.json",
  ]);
  assert.equal(generation.structureOnly, true);
  const recovery = _internals.parseArgs([
    "--generate-recovery",
    "--prior-plan",
    "prior-plan.json",
    "--prior-plan-sha256",
    "b".repeat(64),
    "--prior-receipt",
    "prior-receipt.json",
    "--prior-receipt-sha256",
    "c".repeat(64),
    "--output",
    "recovery-plan.json",
  ]);
  assert.equal(recovery.mode, "generate_recovery");
  assert.equal(recovery.priorPlanSha256, "b".repeat(64));
  assert.equal(recovery.priorReceiptSha256, "c".repeat(64));
  assert.throws(() => _internals.parseArgs([
    "--dry-run",
    "--structure-only",
    "--plan",
    "plan.json",
    "--plan-sha256",
    "a".repeat(64),
  ]), /structure_only_generation_only/);
});

test("apply admission requires every single-writer guard", () => {
  const missing = _internals.admissionFor("apply", true, {});
  assert.equal(missing.admitted, false);
  assert.deepEqual(missing.reasonCodes.sort(), [
    "board_card_journal_env_guard_missing",
    "board_completed_transfer_env_guard_missing",
    "current_live_reconcile_env_guard_missing",
  ]);
  const admitted = _internals.admissionFor("apply", true, {
    DISCORDOS_CURRENT_LIVE_BOARD_RECONCILE: "enabled",
    DISCORDOS_BOARD_CARD_JOURNAL: "enabled",
    DISCORDOS_BOARD_COMPLETED_TRANSFER: "enabled",
  });
  assert.equal(admitted.admitted, true);
});

test("current owner-source registry binds exact registered adapters", () => {
  assert.deepEqual(_internals.validateSourceRegistry(sourceRegistry, boardRegistry), []);
  const changed = structuredClone(sourceRegistry);
  changed.ownerExports[0].adapterId = "invented-adapter";
  assert(_internals.validateSourceRegistry(changed, boardRegistry).includes("owner_source_adapter_mismatch:atlas-active-admission"));
});

test("current event duplicate detection excludes superseded and retained legacy history", () => {
  const entry = { eventId: "evt-exact", contentSha256: "a".repeat(64) };
  const scan = {
    cards: {
      exactReadbackRows: [
        { superseded: false, retainedLegacyHistory: false, journalIntegrityEntries: [entry] },
        { superseded: false, retainedLegacyHistory: false, journalIntegrityEntries: [entry] },
        { superseded: true, retainedLegacyHistory: false, journalIntegrityEntries: [entry] },
        { superseded: false, retainedLegacyHistory: true, journalIntegrityEntries: [entry] },
      ],
    },
  };
  assert.deepEqual(_internals.currentEventDuplicates(scan), [{ eventId: "evt-exact", count: 2 }]);
});

test("owner tag semantics are deterministic from type, state, and priority", () => {
  assert.deepEqual(_internals.ownerEventDesiredTagNames(event({
    eventId: "evt-tags",
    cardId: "STK-1",
    occurredAt: "2026-07-16T12:00:00.000Z",
  })), ["Feature", "In Progress", "High"]);
});

test("tag plans carry the exact parent forum identity required by runtime guards", () => {
  const scan = {
    forums: [{
      boardId: "fitness-active",
      forumChannelId: "fitness-forum",
      tags: { actual: [
        { id: "tag-feature", name: "Feature" },
        { id: "tag-planning", name: "Planning" },
        { id: "tag-review", name: "Review" },
      ] },
    }],
    cards: {
      exactReadbackRows: [{
        boardId: "fitness-active",
        threadId: "fitness-thread",
        cardId: "FIT-1",
        superseded: false,
        retainedLegacyHistory: false,
        archived: true,
        locked: true,
      }],
      boardProfiles: [{
        boardId: "fitness-active",
        appliedTagSafety: { semanticRows: [{
          threadId: "fitness-thread",
          cardId: "FIT-1",
          exact: false,
          retainedLegacyHistory: false,
          actualNames: ["Feature", "Planning"],
          expectedNames: ["Feature", "Review"],
          unknownNames: [],
          duplicateNames: [],
          orphanAppliedTagIds: [],
          overLimit: false,
        }] },
      }],
    },
  };
  const [operation] = _internals.buildTagOperations({ scan, ownerOperations: [] });
  assert.equal(operation.forumChannelId, "fitness-forum");
  assert.deepEqual(operation.threadState, { archived: true, locked: true });
  assert.deepEqual(operation.preimage.appliedTagIds, ["tag-feature", "tag-planning"]);
  assert.deepEqual(operation.postimage.appliedTagIds, ["tag-feature", "tag-review"]);
});

test("archived locked tag repair reopens, patches, restores, and proves exact postimage", async () => {
  const state = {
    parent_id: "fitness-forum",
    applied_tags: ["tag-feature", "tag-planning"],
    thread_metadata: { archived: true, locked: true },
  };
  const writes = [];
  const operation = archivedTagOperation();
  const fetchImpl = async (url, init) => {
    assert(url.endsWith("/channels/fitness-thread"));
    if (init.method === "GET") return response(structuredClone(state));
    const body = JSON.parse(init.body);
    writes.push(body);
    if (Object.hasOwn(body, "applied_tags")) state.applied_tags = [...body.applied_tags];
    if (Object.hasOwn(body, "archived")) state.thread_metadata.archived = body.archived;
    if (Object.hasOwn(body, "locked")) state.thread_metadata.locked = body.locked;
    return response(structuredClone(state));
  };
  const result = await _internals.applyPlannedTagRepair(operation, {
    env: { DISCORDOS_BOT_TOKEN: "test-token" },
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.writeCount, 3);
  assert.deepEqual(writes, [
    { archived: false, locked: false },
    { applied_tags: ["tag-feature", "tag-review"] },
    { archived: true, locked: true },
  ]);
  assert.deepEqual(result.readback.actualThreadState, { archived: true, locked: true });
  assert.deepEqual(result.readback.actualAppliedTagIds, ["tag-feature", "tag-review"]);
  assert.equal(result.lifecycle.restorationVerified, true);
  assert.equal(result.critical, false);
});

test("rejected archived tag patch restores and verifies the exact original lifecycle and tags", async () => {
  const state = {
    parent_id: "fitness-forum",
    applied_tags: ["tag-feature", "tag-planning"],
    thread_metadata: { archived: true, locked: true },
  };
  const writes = [];
  const operation = archivedTagOperation();
  const fetchImpl = async (_url, init) => {
    if (init.method === "GET") return response(structuredClone(state));
    const body = JSON.parse(init.body);
    writes.push(body);
    if (writes.length === 2) throw new Error("simulated_tag_patch_rejection");
    if (Object.hasOwn(body, "applied_tags")) state.applied_tags = [...body.applied_tags];
    if (Object.hasOwn(body, "archived")) state.thread_metadata.archived = body.archived;
    if (Object.hasOwn(body, "locked")) state.thread_metadata.locked = body.locked;
    return response(structuredClone(state));
  };
  const result = await _internals.applyPlannedTagRepair(operation, {
    env: { DISCORDOS_BOT_TOKEN: "test-token" },
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.writeCount, 2);
  assert.equal(result.writeOutcomeUnknownCount, 1);
  assert.equal(result.critical, false);
  assert.equal(result.lifecycle.restorationVerified, true);
  assert.deepEqual(writes, [
    { archived: false, locked: false },
    { applied_tags: ["tag-feature", "tag-review"] },
    { applied_tags: ["tag-feature", "tag-planning"], archived: true, locked: true },
  ]);
  assert.deepEqual(result.readback.actualThreadState, { archived: true, locked: true });
  assert.deepEqual(result.readback.actualAppliedTagIds, ["tag-feature", "tag-planning"]);
  assert(result.reasonCodes.includes("tag_repair_write_outcome_unknown"));
  assert(!result.reasonCodes.includes("critical_tag_target_lifecycle_unresolved"));
});

test("failed archived tag patch also restores the exact original lifecycle and tags", async () => {
  const state = {
    parent_id: "fitness-forum",
    applied_tags: ["tag-feature", "tag-planning"],
    thread_metadata: { archived: true, locked: true },
  };
  let writeIndex = 0;
  const operation = archivedTagOperation();
  const fetchImpl = async (_url, init) => {
    if (init.method === "GET") return response(structuredClone(state));
    writeIndex += 1;
    const body = JSON.parse(init.body);
    if (writeIndex === 2) return response({ message: "tag update rejected" }, 400);
    if (Object.hasOwn(body, "applied_tags")) state.applied_tags = [...body.applied_tags];
    if (Object.hasOwn(body, "archived")) state.thread_metadata.archived = body.archived;
    if (Object.hasOwn(body, "locked")) state.thread_metadata.locked = body.locked;
    return response(structuredClone(state));
  };
  const result = await _internals.applyPlannedTagRepair(operation, {
    env: { DISCORDOS_BOT_TOKEN: "test-token" },
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 400);
  assert.equal(result.writeCount, 2);
  assert.equal(result.writeOutcomeUnknownCount, 0);
  assert.equal(result.critical, false);
  assert.equal(result.lifecycle.restorationVerified, true);
  assert.deepEqual(result.readback.actualThreadState, { archived: true, locked: true });
  assert.deepEqual(result.readback.actualAppliedTagIds, ["tag-feature", "tag-planning"]);
  assert(result.reasonCodes.includes("tag_repair_write_failed"));
});

test("outcome-unknown lifecycle restore is Critical and never reports repair success", async () => {
  const state = {
    parent_id: "fitness-forum",
    applied_tags: ["tag-feature", "tag-planning"],
    thread_metadata: { archived: true, locked: true },
  };
  let writeIndex = 0;
  const operation = archivedTagOperation();
  const fetchImpl = async (_url, init) => {
    if (init.method === "GET") return response(structuredClone(state));
    writeIndex += 1;
    const body = JSON.parse(init.body);
    if (writeIndex === 3) throw new Error("simulated_restore_outcome_unknown");
    if (Object.hasOwn(body, "applied_tags")) state.applied_tags = [...body.applied_tags];
    if (Object.hasOwn(body, "archived")) state.thread_metadata.archived = body.archived;
    if (Object.hasOwn(body, "locked")) state.thread_metadata.locked = body.locked;
    return response(structuredClone(state));
  };
  const result = await _internals.applyPlannedTagRepair(operation, {
    env: { DISCORDOS_BOT_TOKEN: "test-token" },
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.critical, true);
  assert.equal(result.severity, "Critical");
  assert.equal(result.lifecycle.restorationVerified, false);
  assert.equal(result.writeCount, 2);
  assert.equal(result.writeOutcomeUnknownCount, 1);
  assert.equal(result.httpStatus, 0);
  assert.deepEqual(result.readback.actualThreadState, { archived: false, locked: false });
  assert(result.reasonCodes.includes("tag_repair_restore_outcome_unknown"));
  assert(result.reasonCodes.includes("critical_tag_target_lifecycle_unresolved"));
});

test("a Critical lifecycle drift stops every later targeted mutation", async () => {
  const first = archivedTagOperation({ operationId: "tag-02", threadId: "fitness-thread-02", cardId: "FIT-2" });
  const second = archivedTagOperation({ operationId: "tag-03", threadId: "fitness-thread-03", cardId: "FIT-3" });
  const states = new Map([
    [first.threadId, { parent_id: "fitness-forum", applied_tags: ["tag-feature", "tag-planning"], thread_metadata: { archived: true, locked: true } }],
    [second.threadId, { parent_id: "fitness-forum", applied_tags: ["tag-feature", "tag-planning"], thread_metadata: { archived: true, locked: true } }],
  ]);
  const writes = [];
  const fetchImpl = async (url, init) => {
    const threadId = [...states.keys()].find((candidate) => url.endsWith(`/channels/${candidate}`));
    assert(threadId);
    const state = states.get(threadId);
    if (init.method === "GET") return response(structuredClone(state));
    const body = JSON.parse(init.body);
    writes.push({ threadId, body });
    if (threadId === first.threadId && writes.filter((row) => row.threadId === first.threadId).length === 3) {
      return response({ message: "restore rejected" }, 400);
    }
    if (Object.hasOwn(body, "applied_tags")) state.applied_tags = [...body.applied_tags];
    if (Object.hasOwn(body, "archived")) state.thread_metadata.archived = body.archived;
    if (Object.hasOwn(body, "locked")) state.thread_metadata.locked = body.locked;
    return response(structuredClone(state));
  };
  const plan = {
    executionScope: "targeted_tag_recovery",
    planDigestSha256: "d".repeat(64),
    mutationCap: { logicalOperationCount: 2, maxConfirmedDiscordWrites: 6 },
    operations: [first, second],
    ownerAuthority: { blockedSubsets: [], unresolvedRegisteredSources: [], excludedProjects: [] },
  };
  const preflight = {
    ok: true,
    status: "preflight_ready",
    allComplete: false,
    ownerStatuses: [],
    tagStatuses: [
      { operationId: first.operationId, status: "pending" },
      { operationId: second.operationId, status: "pending" },
    ],
    orderStatus: null,
    transferStatuses: [],
    scan: null,
  };
  const receipt = await _internals.runApply({
    plan,
    preflight,
    boardRegistry: {},
    env: { DISCORDOS_BOT_TOKEN: "test-token" },
    fetchImpl,
  });
  const firstReceipt = receipt.operationReceipts.find((row) => row.operationId === first.operationId);
  const secondReceipt = receipt.operationReceipts.find((row) => row.operationId === second.operationId);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.status, "blocked_after_partial_apply");
  assert.equal(firstReceipt.critical, true);
  assert.equal(firstReceipt.severity, "Critical");
  assert.equal(firstReceipt.httpStatus, 400);
  assert.equal(secondReceipt.status, "not_run");
  assert.equal(secondReceipt.severity, "Critical");
  assert(!writes.some((row) => row.threadId === second.threadId));
  assert(receipt.reasonCodes.includes("critical_target_lifecycle_unresolved"));
});

test("a Critical tag lifecycle drift also stops later owner reactions and completed transfers", async () => {
  const tag = archivedTagOperation({ operationId: "tag-01" });
  const owner = { operationId: "owner-01", kind: "owner_event", event: {}, requiredReaction: { name: "success" } };
  const transfer = { operationId: "transfer-01", kind: "completed_transfer" };
  const state = {
    parent_id: "fitness-forum",
    applied_tags: ["tag-feature", "tag-planning"],
    thread_metadata: { archived: true, locked: true },
  };
  let tagWriteIndex = 0;
  const fetchImpl = async (_url, init) => {
    if (init.method === "GET") return response(structuredClone(state));
    tagWriteIndex += 1;
    const body = JSON.parse(init.body);
    if (tagWriteIndex === 3) return response({ message: "restore rejected" }, 400);
    if (Object.hasOwn(body, "applied_tags")) state.applied_tags = [...body.applied_tags];
    if (Object.hasOwn(body, "archived")) state.thread_metadata.archived = body.archived;
    if (Object.hasOwn(body, "locked")) state.thread_metadata.locked = body.locked;
    return response(structuredClone(state));
  };
  const originals = {
    journalApply: journal.buildBoardCardJournal,
    reaction: cardContract.ensureRequiredReaction,
    transferApply: completedTransfer.buildCompletedBoardTransfer,
    transferInspect: currentRepair.inspectTransferRuntime,
  };
  let reactionCalls = 0;
  let transferCalls = 0;
  journal.buildBoardCardJournal = async () => ({ ok: true, results: [{ ok: true, status: "applied", threadId: "owner-thread" }] });
  cardContract.ensureRequiredReaction = async () => { reactionCalls += 1; return { ok: true, status: "applied" }; };
  completedTransfer.buildCompletedBoardTransfer = async () => { transferCalls += 1; return { ok: true, status: "applied" }; };
  currentRepair.inspectTransferRuntime = async () => ({ ok: true, status: "pending", complete: false });
  try {
    const receipt = await _internals.runApply({
      plan: {
        executionScope: "current_live_full",
        planDigestSha256: "f".repeat(64),
        mutationCap: { logicalOperationCount: 3, maxConfirmedDiscordWrites: 20 },
        denominator: { terminal: { boards: 1, currentCards: 1, totalThreads: 1, healthyCards: 1, retainedLegacyRows: 0, supersededRows: 0 } },
        operations: [owner, tag, transfer],
        ownerAuthority: { blockedSubsets: [], unresolvedRegisteredSources: [], excludedProjects: [] },
      },
      preflight: {
        ok: true,
        status: "preflight_ready",
        allComplete: false,
        ownerStatuses: [{ operationId: owner.operationId, status: "pending" }],
        tagStatuses: [{ operationId: tag.operationId, status: "pending" }],
        orderStatus: null,
        transferStatuses: [{ operationId: transfer.operationId, status: "pending", complete: false }],
        scan: { cards: { exactReadbackRows: [] } },
      },
      boardRegistry: {},
      env: { DISCORDOS_BOT_TOKEN: "test-token" },
      fetchImpl,
      currentScanImpl: async () => ({
        denominator: { requiredBoardCount: 1, inspectedBoardCount: 1, coverageStatus: "complete", uncoveredBoardCount: 0 },
        cards: {
          currentCardCount: 1,
          totalThreadCount: 1,
          healthyCardCount: 1,
          driftedCardCount: 0,
          retainedLegacyHistoryCount: 0,
          supersededRecordCount: 0,
          duplicateStableIdentityCount: 0,
          actionableTextIntegrityFindingCount: 0,
          boardProfiles: [],
          exactReadbackRows: [],
        },
        reasonCodes: [],
      }),
    });
    assert.equal(receipt.ok, false);
    assert.equal(reactionCalls, 0);
    assert.equal(transferCalls, 0);
    const reactionReceipt = receipt.operationReceipts.find((row) => row.operationId === `${owner.operationId}-reaction`);
    const transferReceipt = receipt.operationReceipts.find((row) => row.operationId === transfer.operationId);
    assert.equal(reactionReceipt.status, "not_run");
    assert.equal(reactionReceipt.severity, "Critical");
    assert.equal(transferReceipt.status, "not_run");
    assert.equal(transferReceipt.severity, "Critical");
  } finally {
    journal.buildBoardCardJournal = originals.journalApply;
    cardContract.ensureRequiredReaction = originals.reaction;
    completedTransfer.buildCompletedBoardTransfer = originals.transferApply;
    currentRepair.inspectTransferRuntime = originals.transferInspect;
  }
});

test("targeted idempotent replay binds the trusted plan digest and performs zero writes", async () => {
  const operation = archivedTagOperation({ operationId: "tag-02" });
  const plan = {
    executionScope: "targeted_tag_recovery",
    planDigestSha256: "e".repeat(64),
    operations: [operation],
    ownerAuthority: { blockedSubsets: [] },
  };
  const complete = {
    ok: true,
    operationId: operation.operationId,
    status: "complete",
    actualAppliedTagIds: operation.postimage.appliedTagIds,
    actualThreadState: operation.threadState,
    httpStatus: 200,
    reasonCodes: [],
  };
  const receipt = await _internals.runApply({
    plan,
    preflight: { ok: true, status: "terminal_postimage", allComplete: true, tagStatuses: [complete] },
    boardRegistry: {},
    fetchImpl: async () => { throw new Error("idempotent_replay_must_not_fetch"); },
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, "idempotent_replay");
  assert.equal(receipt.planDigestSha256, plan.planDigestSha256);
  assert.equal(receipt.mutatesDiscord, false);
  assert.equal(receipt.discordMutations, 0);
  assert.equal(receipt.discordMutationOutcomesUnknown, 0);
  assert.deepEqual(receipt.reconciliation.touchedTagPostimages, [complete]);
});

test("write-side Discord 5xx responses remain unknown even when a later retry succeeds", async () => {
  const queued = [response({ message: "server error" }, 503), response({ ok: true }, 200), response({ message: "read error" }, 503)];
  const counted = _internals.countedDiscordFetch(async () => queued.shift());
  const url = "https://discord.com/api/v10/channels/fitness-thread";
  await counted.fetchImpl(url, { method: "PATCH" });
  await counted.fetchImpl(url, { method: "PATCH" });
  await counted.fetchImpl(url, { method: "GET" });
  assert.deepEqual(counted.state, { confirmedWrites: 1, unknownWriteOutcomes: 1 });
});

test("forum scan projects into the journal writer's authoritative identity contract", () => {
  const profileScan = {
    status: "drift_detected",
    generatedAt: "2026-07-16T12:00:00.000Z",
    denominator: { uncoveredBoardCount: 0 },
    forums: [{ boardId: "stack-active-admission", forumChannelId: "1526814478157742131" }],
    cards: { exactReadbackRows: [{
      boardId: "stack-active-admission",
      threadId: "stack-thread",
      title: "Run the scheduled inbox sweep",
      cardId: "STK-EXISTING",
      superseded: false,
    }] },
    reasonCodes: ["forum_relative_order_mismatch"],
  };
  const projection = _internals.journalIdentityProjection(profileScan);
  const bound = event({ eventId: "evt-bound", cardId: "STK-EXISTING", occurredAt: "2026-07-16T12:00:00.000Z" });
  bound.card.threadId = "stack-thread";
  const result = journal.preflightLiveIdentities({ events: [bound], scan: projection });
  assert.equal(result.ok, true);
  assert.equal(result.currentIdentityCount, 1);
  assert.equal(result.checks[0].matchingLocations[0].forumChannelId, "1526814478157742131");
});

test("stale owner truth blocks only that subset while an independent missing identity remains plannable", async () => {
  const stale = event({ eventId: "evt-stale", cardId: "STK-STALE", occurredAt: "2026-07-15T12:00:00.000Z" });
  const fresh = event({ eventId: "evt-fresh", cardId: "STK-FRESH", occurredAt: "2026-07-17T00:00:00.000Z" });
  const missing = event({ eventId: "evt-missing", cardId: "STK-MISSING", occurredAt: "2026-07-16T12:00:00.000Z" });
  const newerLive = event({ eventId: "evt-live", cardId: "STK-STALE", occurredAt: "2026-07-16T00:00:00.000Z" });
  const olderLive = event({ eventId: "evt-live-fresh", cardId: "STK-FRESH", occurredAt: "2026-07-16T00:00:00.000Z" });
  const body = journal.buildCanonicalBody(newerLive);
  const freshBody = journal.buildCanonicalBody(olderLive);
  const scan = {
    forums: [{
      boardId: "stack-active-admission",
      tags: { actual: [
        { id: "tag-feature", name: "Feature" },
        { id: "tag-progress", name: "In Progress" },
        { id: "tag-high", name: "High" },
      ] },
    }],
    cards: {
      exactReadbackRows: [{
        boardId: "stack-active-admission",
        threadId: "thread-stale",
        cardId: "STK-STALE",
        superseded: false,
        retainedLegacyHistory: false,
        starterContentSha256: _internals.sha256(body),
        journalIntegrityEntries: [],
      }, {
        boardId: "stack-active-admission",
        threadId: "thread-fresh",
        cardId: "STK-FRESH",
        superseded: false,
        retainedLegacyHistory: false,
        starterContentSha256: _internals.sha256(freshBody),
        journalIntegrityEntries: [],
      }],
    },
  };
  const fetchImpl = async (url) => {
    if (url.endsWith("/channels/thread-stale")) {
      return response({ name: "Run the scheduled inbox sweep", applied_tags: ["tag-feature"], thread_metadata: { archived: false, locked: false } });
    }
    if (url.endsWith("/channels/thread-stale/messages/thread-stale")) return response({ content: body, reactions: [] });
    if (url.endsWith("/channels/thread-fresh")) {
      return response({ name: "Run the scheduled inbox sweep", applied_tags: ["tag-feature"], thread_metadata: { archived: false, locked: false } });
    }
    if (url.endsWith("/channels/thread-fresh/messages/thread-fresh")) return response({ content: freshBody, reactions: [] });
    throw new Error(`unexpected_fetch:${url}`);
  };
  const result = await _internals.buildOwnerOperations({
    authority: { ownerBatch: { events: [stale, fresh, missing] } },
    scan,
    boardRegistry,
    env: { DISCORDOS_BOT_TOKEN: "test-token" },
    fetchImpl,
  });
  assert.equal(result.operations.length, 2);
  assert.equal(result.operations.find((operation) => operation.eventId === "evt-missing").preimage.exists, false);
  const freshOperation = result.operations.find((operation) => operation.eventId === "evt-fresh");
  assert.equal(freshOperation.preimage.exists, true);
  assert.equal(freshOperation.event.card.threadId, "thread-fresh");
  assert.deepEqual(freshOperation.requiredReaction, {
    status: "failure",
    name: "failure",
    id: "1507384094424694785",
  });
  assert.equal(result.blockedSubsets.length, 1);
  assert.equal(result.blockedSubsets[0].eventId, "evt-stale");
  assert.match(result.blockedSubsets[0].reasonCodes[0], /^owner_event_older_than_live:/);
});

test("plan structure binds its digest, operation IDs, counts, and mutation cap", () => {
  const plan = {
    schemaVersion: _internals.PLAN_SCHEMA_VERSION,
    eventId: _internals.EVENT_ID,
    executionScope: "structure_only",
    operationCounts: { ownerEvents: 0, tagRepairs: 1, forumOrderRepairs: 0, completedTransfers: 0 },
    mutationCap: { logicalOperationCount: 1, maxConfirmedDiscordWrites: 1 },
    operations: [{ operationId: "tag-01", kind: "tag_repair", threadState: { archived: false, locked: false } }],
  };
  plan.planDigestSha256 = _internals.objectDigest(plan);
  assert.deepEqual(_internals.verifyPlanStructure(plan), []);
  plan.operations.push({ operationId: "tag-01", kind: "invented" });
  assert(_internals.verifyPlanStructure(plan).includes("plan_operation_id_duplicate"));
});

test("targeted recovery structure is pinned to the exact two threads, evidence, provenance, and cap", () => {
  const filePath = path.join(repoRoot, "docs", "ops", "discordos-current-live-board-reconcile-recovery-plan-2026-07-16.json");
  const exact = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.deepEqual(_internals.verifyPlanStructure(exact), []);

  const extraTarget = structuredClone(exact);
  extraTarget.operations.push({
    ...structuredClone(extraTarget.operations[0]),
    operationId: "tag-04",
    threadId: "third-thread",
  });
  extraTarget.operationCounts.tagRepairs += 1;
  extraTarget.mutationCap.logicalOperationCount += 1;
  extraTarget.mutationCap.maxConfirmedDiscordWrites += 3;
  extraTarget.planDigestSha256 = _internals.objectDigest(extraTarget);
  assert(_internals.verifyPlanStructure(extraTarget).includes("targeted_recovery_operation_set_mismatch"));

  const substitutedTarget = structuredClone(exact);
  substitutedTarget.operations[0].threadId = "substituted-thread";
  substitutedTarget.evidence.touchedPreimages[0].threadId = "substituted-thread";
  substitutedTarget.planDigestSha256 = _internals.objectDigest(substitutedTarget);
  assert(_internals.verifyPlanStructure(substitutedTarget).includes("targeted_recovery_target_mismatch:tag-02"));

  const unlinkedEvidence = structuredClone(exact);
  unlinkedEvidence.evidence.touchedPreimages[0].threadId = unlinkedEvidence.operations[1].threadId;
  unlinkedEvidence.planDigestSha256 = _internals.objectDigest(unlinkedEvidence);
  assert(_internals.verifyPlanStructure(unlinkedEvidence).includes("targeted_recovery_evidence_mismatch:tag-02"));
  assert(_internals.verifyPlanStructure(unlinkedEvidence).includes("targeted_recovery_evidence_digest_mismatch"));

  const widenedCap = structuredClone(exact);
  widenedCap.mutationCap.maxConfirmedDiscordWrites = 7;
  widenedCap.planDigestSha256 = _internals.objectDigest(widenedCap);
  assert(_internals.verifyPlanStructure(widenedCap).includes("targeted_recovery_mutation_cap_mismatch"));
});
