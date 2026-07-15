const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { _internals: cardContract } = require("../scripts/discordos-board-card-contract");
const { _internals: migration } = require("../scripts/discordos-canonical-board-migration");
const { _internals: forumProfile } = require("../scripts/discordos-forum-profile");
const { _internals: journal } = require("../scripts/discordos-board-card-journal");
const { _internals: ownerSeed } = require("../scripts/discordos-project-board-owner-seed");

const repoRoot = path.resolve(__dirname, "..");
const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "discordos-board-registry.json"), "utf8"));
const profiles = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "discordos-forum-profile-registry.json"), "utf8"));
const guildRoles = [
  { id: registry.guildId, name: "@everyone" },
  { id: "role-verified", name: "Verified" },
  { id: "role-security", name: "Fawx Security" },
];

function resolvedRegistry() {
  const value = structuredClone(registry);
  value.boards.find((board) => board.id === "socials-os-active-admission").forumChannelId = "socials-forum";
  return value;
}

function canonicalTags(board) {
  return forumProfile.expectedTags(profiles, board.forumProfile).map((tag, index) => ({
    id: `${board.id}-tag-${index}`,
    name: tag.name,
    moderated: tag.moderated,
    emoji_id: tag.emojiId,
    emoji_name: tag.emojiName,
  }));
}

function channel(board, position = 0) {
  const expected = profiles.boards[board.id];
  return {
    id: board.forumChannelId,
    guild_id: registry.guildId,
    name: expected.name,
    topic: expected.topic,
    parent_id: expected.parentChannelId,
    type: 15,
    position,
    available_tags: canonicalTags(board),
    permission_overwrites: [
      { id: registry.guildId, type: 0, allow: "0", deny: "3072" },
      { id: "role-verified", type: 0, allow: "1024", deny: "0" },
      { id: "role-security", type: 0, allow: "3072", deny: "0" },
    ],
    default_reaction_emoji: null,
    default_sort_order: null,
    default_forum_layout: 0,
    rate_limit_per_user: 0,
    flags: 0,
    nsfw: false,
  };
}

function snapshotThread(id, name, appliedTags = []) {
  return {
    thread: { id, name, applied_tags: appliedTags, thread_metadata: { archived: true, locked: false } },
    starter: { id, content: `Legacy source for ${name}` },
    messages: [],
    messagePageCount: 1,
    messageHistoryTruncated: false,
  };
}

function fullLegacySnapshot() {
  const resolved = resolvedRegistry();
  const forums = resolved.boards.map((board) => ({
    boardId: board.id,
    forum: channel(board),
    archivedPageCount: 1,
    threadHistoryTruncated: false,
    threads: [],
  }));
  const music = forums.find((row) => row.boardId === "music-sesh-active");
  music.threads.push(snapshotThread(
    "1508141153835421798",
    "Music Sesh: Feature: Cross-service room sync and simple controls",
    ["removed-phase-tag"]
  ));
  for (let index = 0; index < 150; index += 1) {
    music.threads.push(snapshotThread(`music-history-${index}`, `Retained proof ${index}`, ["removed-legacy-tag"]));
  }
  forums.find((row) => row.boardId === "legacy-general-feedback").threads.push(
    snapshotThread("shared-intake-history", "Community history", ["orphan-shared-tag"])
  );
  return {
    schemaVersion: migration.SNAPSHOT_SCHEMA_VERSION,
    generatedAt: "2026-07-15T12:00:00.000Z",
    registry: resolved,
    identityResolution: [],
    pendingBoards: [],
    guildRoles,
    forums,
    reasonCodes: [],
    sha256: "snapshot-sha",
  };
}

function socialsExport() {
  const cards = Array.from({ length: 12 }, (_, index) => ({
    idempotency_key: `pbk_socials-os_soc-${String(index + 10).padStart(3, "0")}_v1`,
    record_kind: "project-work",
    record_status: "active",
    record: {
      card_id: `SOC-${String(index + 10).padStart(3, "0")}`,
      project_id: "socials-os",
      board_id: "discordos:project-feedback:socials-os",
      title: `Outcome ${index + 1}`,
      card_type: index === 0 ? "bug" : "reliability",
      lifecycle: index % 2 === 0 ? "ready" : "planning",
      priority: null,
      owner: "socials-os",
      updated_at: "2026-07-15T06:48:39Z",
      source_ref: `planning/roadmap.json#SOC-${index + 10}`,
    },
    content: {
      summary: `Summary ${index + 1}`,
      objective: `Objective ${index + 1}`,
      acceptance_criteria: ["Exact result"],
      discoveries: [],
      next_actions: ["Continue"],
      blockers: [],
      evidence: ["planning/roadmap.json"],
    },
    relationships: { parent_card_id: null, duplicate_of: null, superseded_by: null },
  }));
  return {
    contract_version: "atlas.project-board.owner-export.v1",
    export_id: "pbe_socials-os_test",
    project_id: "socials-os",
    board_id: "discordos:project-feedback:socials-os",
    owner: "socials-os",
    adapter_id: "socials-os-roadmap-v1",
    source_revision: "sha256:test",
    generated_at: "2026-07-15T06:48:39Z",
    cards,
    extensions: { selection: { roadmap_record_count: 21, exported_nonterminal_count: 12 } },
  };
}

test("one canonical title policy removes exact Fitness, Mazer, and type prefixes without damaging normal words", () => {
  const fitness = registry.boards.find((board) => board.id === "fitness-active");
  const mazer = registry.boards.find((board) => board.id === "mazer-active");
  const atlas = registry.boards.find((board) => board.id === "atlas-active-admission");
  const socials = registry.boards.find((board) => board.id === "socials-os-active-admission");
  assert.equal(cardContract.formatCanonicalCardTitle({ board: fitness, card: { title: "Fitness: Feature: Recovery dashboard" } }), "Recovery dashboard");
  assert.equal(cardContract.formatCanonicalCardTitle({ board: mazer, card: { title: "Mazer: Bug: Persistent login parity" } }), "Persistent login parity");
  assert.equal(cardContract.formatCanonicalCardTitle({ board: atlas, card: { title: "Canonical registry adoption" } }), "Canonical registry adoption");
  assert.equal(cardContract.formatCanonicalCardTitle({ board: socials, card: { title: "Socials OS: Feature: Admit the governed board" } }), "Admit the governed board");
  assert.equal(cardContract.formatCanonicalCardTitle({ board: fitness, card: { title: "Feature flag rollout" } }), "Feature flag rollout");
  assert.equal(cardContract.formatCanonicalCardTitle({ board: mazer, card: { title: "Bug bounty workflow" } }), "Bug bounty workflow");
});

test("Phase 8 managed adoption stays deterministic after a completed or partial retry", () => {
  const firstSnapshot = fullLegacySnapshot();
  const firstPlan = migration.buildMigrationPlan({ snapshot: firstSnapshot, profileRegistry: profiles });
  const firstEvent = migration.phase8JournalEvent(firstPlan, firstSnapshot);
  const retrySnapshot = structuredClone(firstSnapshot);
  const phase8 = retrySnapshot.forums
    .find((row) => row.boardId === "music-sesh-active")
    .threads.find((row) => row.thread.id === "1508141153835421798");
  phase8.thread.name = "Cross-service room sync and simple controls";
  phase8.starter.content = journal.buildCanonicalBody(firstEvent, phase8.starter.content);
  const retryPlan = migration.buildMigrationPlan({ snapshot: retrySnapshot, profileRegistry: profiles });
  const retryEvent = migration.phase8JournalEvent(retryPlan, retrySnapshot);
  assert.equal(retryPlan.ok, true);
  assert.equal(retryPlan.phase8ActiveManagedCount, 1);
  assert.deepEqual(retryEvent, firstEvent);
});

test("migration plan classifies exact legacy cohorts and never guesses retained semantics", () => {
  const snapshot = fullLegacySnapshot();
  const plan = migration.buildMigrationPlan({ snapshot, profileRegistry: profiles });
  assert.equal(plan.ok, true);
  assert.equal(plan.boardDenominator, 13);
  assert.equal(plan.phase8ActiveManagedCount, 1);
  assert.equal(plan.retainedLegacyHistoryCount, 150);
  assert.equal(plan.retainedSharedIntakeCount, 1);
  const phase8 = plan.threadActions.find((row) => row.classification === "active_managed_candidate");
  assert.deepEqual(phase8.desiredTagNames, ["Feature", "Blocked", "High"]);
  assert.equal(phase8.desiredTitle, "Cross-service room sync and simple controls");
  const retained = plan.threadActions.filter((row) => row.semanticStatus === "semantic_unknown_preserved");
  assert.equal(retained.length, 151);
  assert.ok(retained.every((row) => row.desiredTagNames.length === 0 && row.safeAppliedTagIds.length === 0));
  assert.equal(retained.find((row) => row.threadId === "shared-intake-history").cardId, null);
});

test("forum replacement preserves exact same-name IDs and declares canonical order", () => {
  const board = resolvedRegistry().boards.find((candidate) => candidate.id === "fitness-active");
  const live = channel(board);
  live.available_tags = [
    { id: "legacy-feature", name: "Feature", moderated: false, emoji_id: null, emoji_name: null },
    { id: "legacy-high", name: "High", moderated: false, emoji_id: null, emoji_name: null },
    { id: "ambiguous", name: "Needs Info", moderated: false, emoji_id: null, emoji_name: null },
  ];
  const patch = migration.forumPatchPayload({ board, channel: live, profileRegistry: profiles, guildRoles, guildId: registry.guildId });
  assert.deepEqual(patch.payload.available_tags.map((tag) => tag.name), profiles.tagTaxonomy.orderedTags.map((tag) => tag.name));
  assert.equal(patch.payload.available_tags.find((tag) => tag.name === "Feature").id, "legacy-feature");
  assert.equal(patch.payload.available_tags.find((tag) => tag.name === "High").id, "legacy-high");
  assert.equal(patch.payload.available_tags.some((tag) => tag.name === "Needs Info"), false);
  assert.ok(patch.payload.available_tags.every((tag) => tag.moderated === true));
});

test("Socials owner adapter validates 12 events idempotently and preserves null priority as no tag", () => {
  const ownerExport = socialsExport();
  const resolved = resolvedRegistry();
  const first = ownerSeed.buildOwnerSeedBatch({ registry: resolved, ownerExports: [ownerExport] });
  const second = ownerSeed.buildOwnerSeedBatch({ registry: resolved, ownerExports: [ownerExport] });
  assert.equal(first.ok, true);
  assert.equal(first.eventCount, 12);
  assert.deepEqual(first.events.map((event) => event.eventId), second.events.map((event) => event.eventId));
  assert.ok(first.events.every((event) => event.card.title.startsWith("Outcome ") && event.card.priority === "Unspecified"));
  const semantics = migration.deriveThreadSemantics({
    board: resolved.boards.find((board) => board.id === "socials-os-active-admission"),
    thread: { id: "new", name: "Feature: Wrong live prefix" },
    starter: { content: "" },
    ownerRecord: ownerExport.cards[1],
  });
  assert.deepEqual(semantics.desiredTagNames, ["Feature", "Planning"]);
  assert.equal(semantics.desiredTagNames.some((name) => ["Low", "Medium", "High", "Blocker"].includes(name)), false);

  const duplicate = structuredClone(ownerExport);
  duplicate.cards[1].record.card_id = duplicate.cards[0].record.card_id;
  const blocked = ownerSeed.buildOwnerSeedBatch({ registry: resolved, ownerExports: [duplicate] });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasonCodes.some((code) => code.startsWith("owner_export_card_id_duplicate:")));
});

test("scanner proves an exact 13-board canonical denominator", async () => {
  const resolved = resolvedRegistry();
  const orderedBoards = [...resolved.boards].sort((left, right) => profiles.boards[left.id].order - profiles.boards[right.id].order);
  const channels = orderedBoards.map((board, index) => channel(board, index));
  const suppliedConsistency = {
    status: "consistent",
    coverageStatus: "complete",
    registeredBoardCount: 13,
    enabledBoardCount: 13,
    uncoveredBoardCount: 0,
    cardCount: 0,
    totalThreadCount: 0,
    retainedLegacyHistoryCount: 0,
    healthyCardCount: 0,
    driftedCardCount: 0,
    supersededRecordCount: 0,
    driftCounts: {},
    rows: [],
    reasonCodes: [],
  };
  const { receipt } = await forumProfile.buildLiveForumProfileScan({
    boardRegistry: registry,
    profileRegistry: profiles,
    channels,
    guildRoles,
    consistency: suppliedConsistency,
    env: {},
    now: () => new Date("2026-07-15T12:00:00.000Z"),
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.denominator.requiredBoardCount, 13);
  assert.equal(receipt.denominator.inspectedBoardCount, 13);
  assert.equal(receipt.denominator.uncoveredBoardCount, 0);
  assert.equal(receipt.relativeOrder.matches, true);
});

test("recovery receipt never accepts partial or orphan-terminal state", () => {
  const receipt = migration.buildRecoveryReceipt({
    snapshotPath: "C:\\ATLAS\\runtime\\board-integrity\\snapshot.json",
    phases: [
      { phase: "safe_tag_preclear", ok: true },
      { phase: "canonical_forum_patch", ok: false },
    ],
  });
  assert.equal(receipt.required, true);
  assert.equal(receipt.strategy, "recover_forward_from_exact_preimage");
  assert.equal(receipt.acceptedTerminalState, false);
  assert.equal(receipt.orphanAppliedTagsAccepted, false);
  assert.deepEqual(receipt.completedPhases, ["safe_tag_preclear"]);
  assert.equal(receipt.failedPhase, "canonical_forum_patch");
});

test("migration artifacts are runtime-only and apply remains double guarded", () => {
  assert.throws(() => migration.assertRuntimePath(path.join(repoRoot, "docs", "snapshot.json")), /migration_artifact_must_be_under_atlas_runtime/);
  assert.doesNotThrow(() => migration.assertRuntimePath("C:\\ATLAS\\runtime\\board-integrity\\snapshot.json"));
  assert.equal(migration.resolveAdmission({ apply: true, allowMigration: true, env: {} }).admitted, false);
  assert.equal(migration.resolveAdmission({ apply: false, allowMigration: false, env: {} }).status, "dry_run");
});
