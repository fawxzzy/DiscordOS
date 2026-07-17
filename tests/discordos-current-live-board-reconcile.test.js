const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-current-live-board-reconcile");
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
    cards: { boardProfiles: [{
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
    }] },
  };
  const [operation] = _internals.buildTagOperations({ scan, ownerOperations: [] });
  assert.equal(operation.forumChannelId, "fitness-forum");
  assert.deepEqual(operation.preimage.appliedTagIds, ["tag-feature", "tag-planning"]);
  assert.deepEqual(operation.postimage.appliedTagIds, ["tag-feature", "tag-review"]);
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
    operations: [{ operationId: "tag-01", kind: "tag_repair" }],
  };
  plan.planDigestSha256 = _internals.objectDigest(plan);
  assert.deepEqual(_internals.verifyPlanStructure(plan), []);
  plan.operations.push({ operationId: "tag-01", kind: "invented" });
  assert(_internals.verifyPlanStructure(plan).includes("plan_operation_id_duplicate"));
});
