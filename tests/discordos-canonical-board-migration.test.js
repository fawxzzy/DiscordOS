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
const SOCIALS_OWNER_CARD_IDS = [
  "SOC-009", "SOC-010", "SOC-011", "SOC-012", "SOC-013", "SOC-015",
  "SOC-016", "SOC-017", "SOC-018", "SOC-020", "SOC-021", "SOC-022",
];

function runtimeFixturePath(name) {
  return path.join(migration.DEFAULT_RUNTIME_ROOT, "board-integrity", name);
}

function response({ ok = true, status = 200, payload = null } = {}) {
  return { ok, status, json: async () => payload };
}

function ownerExportRaw(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ownerExportBlobOid(value) {
  return ownerSeed.gitBlobOid(ownerExportRaw(value));
}

function buildResidualPlan({ snapshot, socialsOwnerExport }) {
  return migration.buildResidualRecoveryPlan({
    snapshot,
    socialsOwnerExport,
    socialsOwnerExportBlobOid: ownerExportBlobOid(socialsOwnerExport),
  });
}

function resolvedRegistry(socialsOwnerExport = socialsExport()) {
  const value = structuredClone(registry);
  if (socialsOwnerExport) {
    value.sourceAdapters["socials-os-roadmap-v1"].acceptedPreimage.ownerExportBlob = ownerExportBlobOid(socialsOwnerExport);
  }
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
  const cards = SOCIALS_OWNER_CARD_IDS.map((cardId, index) => ({
    idempotency_key: `pbk_socials-os_${cardId.toLowerCase()}_v1`,
    record_kind: "project-work",
    record_status: "active",
    record: {
      card_id: cardId,
      project_id: "socials-os",
      board_id: "discordos:project-feedback:socials-os",
      title: `Outcome ${index + 1}`,
      card_type: cardId === "SOC-010" ? "bug" : "reliability",
      lifecycle: Number(cardId.slice(4)) % 2 === 0 ? "ready" : "planning",
      priority: null,
      owner: "socials-os",
      updated_at: "2026-07-15T06:48:39Z",
      source_ref: `planning/roadmap.json#${cardId}`,
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
    export_id: "pbe_socials-os_773fe3821635",
    project_id: "socials-os",
    board_id: "discordos:project-feedback:socials-os",
    owner: "socials-os",
    adapter_id: "socials-os-roadmap-v1",
    source_revision: "sha256:773fe3821635533a72ec6949bb3e716c5ed93d233df29363f1bbca4d1aeb94fe",
    generated_at: "2026-07-15T06:48:39Z",
    cards,
    extensions: { selection: { roadmap_record_count: 23, exported_nonterminal_count: 12 } },
  };
}

function residualSnapshot(socialIdentityCount = 11, {
  phase8Open = false,
  canonicalPhase8Title = false,
  currentSocialJournals = true,
  currentSocialTags = true,
} = {}) {
  const snapshot = fullLegacySnapshot();
  const ownerExport = socialsExport();
  const seed = ownerSeed.buildOwnerSeedBatch({
    registry: snapshot.registry,
    ownerExports: [ownerExport],
    observedBlobOids: [ownerExportBlobOid(ownerExport)],
  });
  const socialsForum = snapshot.forums.find((row) => row.boardId === "socials-os-active-admission");
  const socialTagByName = new Map(socialsForum.forum.available_tags.map((tag) => [tag.name, tag.id]));
  socialsForum.threads = seed.events.slice(0, socialIdentityCount).map((event, index) => ({
    thread: {
      id: `social-thread-${index}`,
      name: event.card.title,
      applied_tags: currentSocialTags
        ? [migration.typeTagName(event.card.type), migration.stateTagName(event.card.state), migration.priorityTagName(event.card.priority)]
          .filter(Boolean)
          .map((name) => socialTagByName.get(name))
        : [],
      thread_metadata: { archived: false, locked: false },
    },
    starter: { id: `social-thread-${index}`, content: journal.buildCanonicalBody(event, "") },
    messages: currentSocialJournals
      ? [{ id: `social-message-${index}`, content: journal.buildJournalMessage(event) }]
      : [],
    messagePageCount: 1,
    messageHistoryTruncated: false,
  }));
  const music = snapshot.forums.find((row) => row.boardId === "music-sesh-active");
  const phase8 = music.threads.find((row) => row.thread.id === "1508141153835421798");
  const migrationPlan = migration.buildMigrationPlan({ snapshot, profileRegistry: profiles });
  phase8.starter.content = journal.buildCanonicalBody(migration.phase8JournalEvent(migrationPlan, snapshot), "");
  phase8.thread.name = canonicalPhase8Title ? "Cross-service room sync and simple controls" : "Music Sesh: Feature: Cross-service room sync and simple controls";
  phase8.thread.thread_metadata = { archived: !phase8Open, locked: !phase8Open };
  return snapshot;
}

function managedSnapshotThread({ cardId, threadId, title, state = "review", archived = false, completedThreadIdLink = null, sourceThreadIdLink = null }) {
  const content = [
    journal.CARD_START,
    `ATLAS-CARD-ID: \`${cardId}\``,
    "- project: `Fixture`",
    "- type: `feature`",
    `- state: \`${state}\``,
    "- priority: `High`",
    "- owner: `Fixture`",
    "- progress: `fixture`",
    "- updated: `2026-07-15T00:00:00.000Z`",
    completedThreadIdLink ? `ATLAS-COMPLETED-CARD: https://discord.com/channels/guild/${completedThreadIdLink}` : null,
    sourceThreadIdLink ? `original card: https://discord.com/channels/guild/${sourceThreadIdLink}` : null,
    journal.CARD_END,
  ].filter(Boolean).join("\n");
  return {
    thread: { id: threadId, name: title, applied_tags: [], thread_metadata: { archived, locked: false } },
    starter: { id: threadId, content },
    messages: [{ id: `${threadId}-journal`, content: `ATLAS-JOURNAL-EVENT-ID: \`${threadId}-event\`` }],
    messagePageCount: 1,
    messageHistoryTruncated: false,
  };
}

function addCompletionPair(snapshot, index, overrides = {}) {
  const cardId = overrides.cardId || `PAIR-${String(index).padStart(2, "0")}`;
  const sourceThreadId = overrides.sourceThreadId || `91${String(index).padStart(16, "0")}`;
  const completedThreadId = overrides.completedThreadId || `92${String(index).padStart(16, "0")}`;
  const sourceLink = Object.hasOwn(overrides, "sourceCompletedThreadIdLink")
    ? overrides.sourceCompletedThreadIdLink
    : completedThreadId;
  const destinationLink = Object.hasOwn(overrides, "completedSourceThreadIdLink")
    ? overrides.completedSourceThreadIdLink
    : sourceThreadId;
  snapshot.forums.find((forum) => forum.boardId === (overrides.sourceBoardId || "mazer-active")).threads.push(managedSnapshotThread({
    cardId,
    threadId: sourceThreadId,
    title: overrides.title || `Pair ${index}`,
    state: "completed",
    archived: overrides.sourceArchived !== false,
    completedThreadIdLink: sourceLink,
  }));
  snapshot.forums.find((forum) => forum.boardId === "shared-completed").threads.push(managedSnapshotThread({
    cardId,
    threadId: completedThreadId,
    title: overrides.title || `Pair ${index}`,
    state: "completed",
    archived: false,
    sourceThreadIdLink: destinationLink,
  }));
  return { cardId, sourceThreadId, completedThreadId };
}

test("one canonical title policy removes exact Fitness, Mazer, and type prefixes without damaging normal words", () => {
  const fitness = registry.boards.find((board) => board.id === "fitness-active");
  const mazer = registry.boards.find((board) => board.id === "mazer-active");
  const atlas = registry.boards.find((board) => board.id === "atlas-active-admission");
  const socials = registry.boards.find((board) => board.id === "socials-os-active-admission");
  assert.equal(cardContract.formatCanonicalCardTitle({ board: fitness, card: { title: "Fitness: Feature: Recovery dashboard" } }), "Recovery dashboard");
  assert.equal(cardContract.formatCanonicalCardTitle({ board: mazer, card: { title: "mazer: Bug: Persistent login parity" } }), "Persistent login parity");
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
  const observedBlobOids = [ownerExportBlobOid(ownerExport)];
  const first = ownerSeed.buildOwnerSeedBatch({ registry: resolved, ownerExports: [ownerExport], observedBlobOids });
  const second = ownerSeed.buildOwnerSeedBatch({ registry: resolved, ownerExports: [ownerExport], observedBlobOids });
  assert.equal(first.ok, true);
  assert.equal(first.eventCount, 12);
  assert.deepEqual(first.events.map((event) => event.eventId), second.events.map((event) => event.eventId));
  assert.ok(first.events.every((event) => event.card.title.startsWith("Outcome ") && event.card.priority === "Unspecified"));
  const semantics = migration.deriveThreadSemantics({
    board: resolved.boards.find((board) => board.id === "socials-os-active-admission"),
    thread: { id: "new", name: "Feature: Wrong live prefix" },
    starter: { content: "" },
    ownerRecord: ownerExport.cards.find((card) => card.record.card_id === "SOC-011"),
  });
  assert.deepEqual(semantics.desiredTagNames, ["Feature", "Planning"]);
  assert.equal(semantics.desiredTagNames.some((name) => ["Low", "Medium", "High", "Blocker"].includes(name)), false);

  const duplicate = structuredClone(ownerExport);
  duplicate.cards[1].record.card_id = duplicate.cards[0].record.card_id;
  const blocked = ownerSeed.buildOwnerSeedBatch({
    registry: resolved,
    ownerExports: [duplicate],
    observedBlobOids: [ownerExportBlobOid(duplicate)],
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasonCodes.some((code) => code.startsWith("owner_export_card_id_duplicate:")));
});

test("Socials owner adapter fails closed when the accepted 12-card nonterminal count drifts", () => {
  const drifted = socialsExport();
  drifted.cards.pop();
  drifted.extensions.selection.exported_nonterminal_count = 11;
  const blocked = ownerSeed.buildOwnerSeedBatch({
    registry: resolvedRegistry(),
    ownerExports: [drifted],
    observedBlobOids: [ownerExportBlobOid(drifted)],
  });
  assert.equal(blocked.ok, false);
  assert(blocked.reasonCodes.includes("owner_export_preimage_card_count_mismatch"));
  assert(blocked.reasonCodes.includes("owner_export_preimage_exported_nonterminal_count_mismatch"));
});

test("canonical migration fails closed before mutation when the raw Socials blob identity is unavailable", async () => {
  const snapshot = fullLegacySnapshot();
  const ownerExport = socialsExport();
  let captured = 0;
  const result = await migration.runCanonicalBoardMigration({
    registry: snapshot.registry,
    profileRegistry: profiles,
    socialsOwnerExport: ownerExport,
    snapshotPath: runtimeFixturePath("missing-owner-export-blob.json"),
    allowMigration: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      [migration.MIGRATION_ENV]: migration.MIGRATION_ENV_VALUE,
    },
    fetchImpl: async () => { throw new Error("accepted-preimage failure must precede Discord I/O"); },
    fsImpl: { mkdir: async () => {}, writeFile: async () => {} },
    captureSnapshotImpl: async () => {
      captured += 1;
      return snapshot;
    },
  });
  assert.equal(captured, 1);
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("owner_export_preimage_blob_unverified"));
  assert.equal(result.mutatesDiscord, false);
  assert.equal(result.sendsMessages, false);
  assert.deepEqual(result.phases, []);
});

test("residual recovery planning suppresses Socials events without the raw blob identity", () => {
  const plan = migration.buildResidualRecoveryPlan({
    snapshot: residualSnapshot(),
    socialsOwnerExport: socialsExport(),
  });
  assert.equal(plan.ok, false);
  assert(plan.reasonCodes.includes("owner_export_preimage_blob_unverified"));
  assert.equal(plan.socials.missingIdentityCount, 0);
  assert.deepEqual(plan.socials.missingEvents, []);
});

test("exact current Socials cards are residual no-ops", () => {
  const plan = buildResidualPlan({
    snapshot: residualSnapshot(12, { phase8Open: true, canonicalPhase8Title: true }),
    socialsOwnerExport: socialsExport(),
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.socials.existingIdentityCount, 12);
  assert.equal(plan.socials.existingBodyUpdateCount, 0);
  assert.equal(plan.socials.existingTagUpdateCount, 0);
  assert.equal(plan.socials.missingJournalEventCount, 0);
  assert.equal(plan.socials.missingIdentityCount, 0);
  assert.equal(plan.expectedMutations.writes.total, 0);
  assert.equal(plan.expectedMutations.messages.total, 0);
});

test("Socials residual reconciliation plans authoritative Ready to Planning and Ready to Review bodies and tags", () => {
  const ownerExport = socialsExport();
  const snapshot = residualSnapshot(12, { phase8Open: true, canonicalPhase8Title: true });
  ownerExport.cards.find((card) => card.record.card_id === "SOC-010").record.lifecycle = "planning";
  ownerExport.cards.find((card) => card.record.card_id === "SOC-012").record.lifecycle = "review";
  snapshot.registry.sourceAdapters["socials-os-roadmap-v1"].acceptedPreimage.ownerExportBlob = ownerExportBlobOid(ownerExport);
  for (const cardId of ["SOC-010", "SOC-012"]) {
    const row = snapshot.forums.find((forum) => forum.boardId === "socials-os-active-admission").threads
      .find((thread) => cardContract.parseCanonicalCardBody(thread.starter.content).id === cardId);
    row.starter.content = `operator note\n${row.starter.content}\nretained history`;
  }
  const plan = buildResidualPlan({ snapshot, socialsOwnerExport: ownerExport });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.socials.existingBodyUpdateCardIds, ["SOC-010", "SOC-012"]);
  assert.deepEqual(plan.socials.existingTagUpdateCardIds, ["SOC-010", "SOC-012"]);
  assert.deepEqual(plan.socials.existingTagActions.map((action) => action.desiredTagNames), [
    ["Bug", "Planning"],
    ["Feature", "Review"],
  ]);
  assert.ok(plan.socials.existingBodyActions.every((action) => action.canonicalBody.startsWith("operator note\n")));
  assert.ok(plan.socials.existingBodyActions.every((action) => action.canonicalBody.endsWith("\nretained history")));
});

test("null Socials priority removes stale priority semantics without guessing a replacement", () => {
  const snapshot = residualSnapshot(12, { phase8Open: true, canonicalPhase8Title: true });
  const socials = snapshot.forums.find((forum) => forum.boardId === "socials-os-active-admission");
  const row = socials.threads.find((thread) => cardContract.parseCanonicalCardBody(thread.starter.content).id === "SOC-010");
  row.thread.applied_tags.push(socials.forum.available_tags.find((tag) => tag.name === "High").id);
  const plan = buildResidualPlan({ snapshot, socialsOwnerExport: socialsExport() });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.socials.existingTagUpdateCardIds, ["SOC-010"]);
  const action = plan.socials.existingTagActions[0];
  assert.deepEqual(action.desiredTagNames, ["Bug", "Ready"]);
  assert.equal(action.desiredTagNames.some((name) => ["Low", "Medium", "High", "Blocker"].includes(name)), false);
});

test("missing Socials owner event appends once, preserves history, and replays with zero messages", async () => {
  const snapshot = residualSnapshot(12, { phase8Open: true, canonicalPhase8Title: true });
  const socials = snapshot.forums.find((forum) => forum.boardId === "socials-os-active-admission");
  const row = socials.threads.find((thread) => cardContract.parseCanonicalCardBody(thread.starter.content).id === "SOC-010");
  row.messages = [{ id: "history-1", content: "Existing unrelated journal history" }];
  const plan = buildResidualPlan({ snapshot, socialsOwnerExport: socialsExport() });
  assert.equal(plan.ok, true);
  assert.equal(plan.socials.missingJournalEventCount, 1);
  const messages = [...row.messages];
  let postCount = 0;
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    const pathname = new URL(url).pathname;
    if (method === "GET" && pathname.endsWith(`/channels/${row.thread.id}/messages`)) return response({ payload: messages });
    if (method === "POST" && pathname.endsWith(`/channels/${row.thread.id}/messages`)) {
      postCount += 1;
      const message = { id: "owner-event-1", content: JSON.parse(init.body).content };
      messages.unshift(message);
      return response({ payload: message });
    }
    if (method === "GET" && pathname.endsWith(`/channels/${row.thread.id}/messages/owner-event-1`)) {
      return response({ payload: messages.find((message) => message.id === "owner-event-1") });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  const first = await migration.applyExistingSocialJournalEvents({
    actions: plan.socials.missingJournalActions,
    token: "token",
    fetchImpl,
  });
  const second = await migration.applyExistingSocialJournalEvents({
    actions: plan.socials.missingJournalActions,
    token: "token",
    fetchImpl,
  });
  assert.equal(first.ok, true);
  assert.equal(first.rows[0].status, "created");
  assert.equal(second.ok, true);
  assert.equal(second.rows[0].status, "reused");
  assert.equal(postCount, 1);
  assert.equal(messages.some((message) => message.id === "history-1"), true);
});

test("malformed and duplicate Socials identities fail closed", async (t) => {
  await t.test("malformed managed block blocks", () => {
    const snapshot = residualSnapshot(12, { phase8Open: true, canonicalPhase8Title: true });
    const row = snapshot.forums.find((forum) => forum.boardId === "socials-os-active-admission").threads[0];
    row.starter.content += `\n${journal.CARD_START}\n${journal.CARD_END}`;
    const cardId = cardContract.parseCanonicalCardBody(row.starter.content).id.toLowerCase();
    const plan = buildResidualPlan({ snapshot, socialsOwnerExport: socialsExport() });
    assert.equal(plan.ok, false);
    assert(plan.reasonCodes.includes(`residual_socials_managed_body_malformed:${cardId}`));
  });
  await t.test("duplicate stable identity blocks", () => {
    const snapshot = residualSnapshot(12, { phase8Open: true, canonicalPhase8Title: true });
    const socials = snapshot.forums.find((forum) => forum.boardId === "socials-os-active-admission");
    const duplicate = structuredClone(socials.threads[0]);
    duplicate.thread.id = "social-duplicate";
    duplicate.starter.id = "social-duplicate";
    socials.threads.push(duplicate);
    const cardId = cardContract.parseCanonicalCardBody(duplicate.starter.content).id.toLowerCase();
    const plan = buildResidualPlan({ snapshot, socialsOwnerExport: socialsExport() });
    assert.equal(plan.ok, false);
    assert(plan.reasonCodes.includes(`residual_socials_identity_duplicate:${cardId}`));
    assert(plan.reasonCodes.includes(`residual_managed_identity_duplicate:${cardId}`));
  });
});

const savedResidualSnapshotPath = path.resolve(repoRoot, "..", "..", "runtime", "board-integrity", "canonical-13-board-residual-reciprocal-snapshot-v2.json");
const currentSocialsExportPath = path.resolve(repoRoot, "..", "socials-os", "exports", "atlas.project-board.owner-export.v1.json");

function assertAcceptedSocialsPreimage(ownerExport, observedBlobOid = ownerExportBlobOid(ownerExport)) {
  const result = ownerSeed.buildOwnerSeedBatch({
    registry: resolvedRegistry(null),
    ownerExports: [ownerExport],
    observedBlobOids: [observedBlobOid],
  });
  assert.equal(result.ok, true, result.reasonCodes.join(","));
  assert.equal(result.eventCount, 12);
}

test("saved Socials preimage digest guard fails closed on unreviewed owner-export drift", {
  skip: !fs.existsSync(currentSocialsExportPath),
}, () => {
  const drifted = JSON.parse(fs.readFileSync(currentSocialsExportPath, "utf8"));
  drifted.export_id = "pbe_socials-os_unreviewed";
  assert.throws(() => assertAcceptedSocialsPreimage(drifted), { name: "AssertionError" });
});

test("saved v2 preimage plans the exact bounded Socials reconciliation", {
  skip: !fs.existsSync(savedResidualSnapshotPath) || !fs.existsSync(currentSocialsExportPath),
}, () => {
  const snapshot = JSON.parse(fs.readFileSync(savedResidualSnapshotPath, "utf8")).residualPreimage;
  const ownerExportRawBytes = fs.readFileSync(currentSocialsExportPath);
  const ownerExport = JSON.parse(ownerExportRawBytes.toString("utf8"));
  const observedBlobOid = ownerSeed.gitBlobOid(ownerExportRawBytes);
  const plan = migration.buildResidualRecoveryPlan({
    snapshot,
    socialsOwnerExport: ownerExport,
    socialsOwnerExportBlobOid: observedBlobOid,
  });
  assertAcceptedSocialsPreimage(ownerExport, observedBlobOid);
  assert.equal(plan.ok, true);
  assert.equal(plan.boardDenominator, 13);
  assert.equal(plan.linkedLifecyclePairCount, 16);
  assert.equal(plan.trueDuplicateIdentityCount, 0);
  assert.equal(plan.retainedMusicHistoryCount, 150);
  assert.equal(plan.socials.existingIdentityCount, 11);
  assert.deepEqual(plan.socials.existingBodyUpdateCardIds, ["SOC-010", "SOC-013", "SOC-016", "SOC-017"]);
  assert.deepEqual(plan.socials.existingTagUpdateCardIds, ["SOC-010", "SOC-013", "SOC-016", "SOC-017"]);
  assert.equal(plan.socials.missingJournalEventCount, 11);
  assert.equal(plan.socials.missingJournalEventIds.length, 11);
  assert.deepEqual(plan.socials.missingCardIds, ["SOC-022"]);
  assert.deepEqual(plan.titleActions.map((action) => action.threadId), ["1525337748830031875"]);
  assert.equal(plan.phase8StateAction.threadId, "1508141153835421798");
  assert.equal(plan.phase8StateAction.action, "unarchive_unlock");
  assert.equal(plan.expectedMutations.writes.total, 12);
  assert.equal(plan.expectedMutations.messages.total, 12);
});

test("residual plan selects only noncanonical managed titles, exact Phase 8 state, and missing Socials identities", () => {
  const plan = buildResidualPlan({ snapshot: residualSnapshot(), socialsOwnerExport: socialsExport() });
  assert.equal(plan.ok, true);
  assert.equal(plan.boardDenominator, 13);
  assert.equal(plan.retainedMusicHistoryCount, 150);
  assert.equal(plan.socials.expectedEventCount, 12);
  assert.equal(plan.socials.existingIdentityCount, 11);
  assert.equal(plan.socials.missingIdentityCount, 1);
  assert.deepEqual(plan.titleActions.map((action) => action.threadId), ["1508141153835421798"]);
  assert.equal(plan.phase8StateAction.action, "unarchive_unlock");
  assert.deepEqual(plan.forbiddenReplay, {
    forumProvision: false,
    forumProfileReplacement: false,
    appliedTagPreclear: false,
    fullThreadMigration: false,
  });
});

test("residual plan admits and reports 16 authoritative reciprocal completion pairs", () => {
  const snapshot = residualSnapshot();
  for (let index = 0; index < 16; index += 1) addCompletionPair(snapshot, index);
  const plan = buildResidualPlan({ snapshot, socialsOwnerExport: socialsExport() });
  assert.equal(plan.ok, true);
  assert.equal(plan.linkedLifecyclePairCount, 16);
  assert.equal(plan.trueDuplicateIdentityCount, 0);
  assert.equal(plan.linkedLifecyclePairs.length, 16);
  assert.ok(plan.linkedLifecyclePairs.every((pair) => pair.locations.length === 2));
});

test("residual completion-pair classification fails closed for every malformed identity shape", async (t) => {
  const cases = [
    {
      name: "broken source link blocks",
      cardId: "BROKEN-SOURCE",
      arrange(snapshot) { addCompletionPair(snapshot, 1, { cardId: this.cardId, sourceCompletedThreadIdLink: "wrong-destination" }); },
    },
    {
      name: "broken destination link blocks",
      cardId: "BROKEN-DESTINATION",
      arrange(snapshot) { addCompletionPair(snapshot, 1, { cardId: this.cardId, completedSourceThreadIdLink: "wrong-source" }); },
    },
    {
      name: "unarchived source blocks",
      cardId: "UNARCHIVED-SOURCE",
      arrange(snapshot) { addCompletionPair(snapshot, 1, { cardId: this.cardId, sourceArchived: false }); },
    },
    {
      name: "two active rows block",
      cardId: "TWO-ACTIVE",
      arrange(snapshot) {
        const forum = snapshot.forums.find((row) => row.boardId === "mazer-active");
        forum.threads.push(
          managedSnapshotThread({ cardId: this.cardId, threadId: "active-one", title: "Active one" }),
          managedSnapshotThread({ cardId: this.cardId, threadId: "active-two", title: "Active two" }),
        );
      },
    },
    {
      name: "two completed rows block",
      cardId: "TWO-COMPLETED",
      arrange(snapshot) {
        const forum = snapshot.forums.find((row) => row.boardId === "shared-completed");
        forum.threads.push(
          managedSnapshotThread({ cardId: this.cardId, threadId: "completed-one", title: "Completed one", state: "completed", sourceThreadIdLink: "source-one" }),
          managedSnapshotThread({ cardId: this.cardId, threadId: "completed-two", title: "Completed two", state: "completed", sourceThreadIdLink: "source-two" }),
        );
      },
    },
    {
      name: "more than two locations blocks",
      cardId: "THREE-LOCATIONS",
      arrange(snapshot) {
        addCompletionPair(snapshot, 1, { cardId: this.cardId });
        snapshot.forums.find((row) => row.boardId === "fitness-active").threads.push(
          managedSnapshotThread({ cardId: this.cardId, threadId: "third-location", title: "Third location" }),
        );
      },
    },
    {
      name: "unrelated wrong-role duplicate blocks",
      cardId: "UNRELATED-DUPLICATE",
      arrange(snapshot) {
        snapshot.forums.find((row) => row.boardId === "legacy-general-feedback").threads.push(
          managedSnapshotThread({ cardId: this.cardId, threadId: "legacy-location", title: "Legacy location" }),
        );
        snapshot.forums.find((row) => row.boardId === "fitness-active").threads.push(
          managedSnapshotThread({ cardId: this.cardId, threadId: "active-location", title: "Active location" }),
        );
      },
    },
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, () => {
      const snapshot = residualSnapshot();
      candidate.arrange(snapshot);
      const plan = buildResidualPlan({ snapshot, socialsOwnerExport: socialsExport() });
      assert.equal(plan.ok, false);
      assert.equal(plan.trueDuplicateIdentityCount, 1);
      assert(plan.reasonCodes.includes(`residual_managed_identity_duplicate:${candidate.cardId.toLowerCase()}`));
    });
  }
});

test("guarded residual recovery creates only the missing Socials identity, reopens exact Phase 8, and is idempotent", async () => {
  const ownerExport = socialsExport();
  const firstSnapshot = residualSnapshot();
  const lastCardId = ownerExport.cards.at(-1).record.card_id;
  const patches = [];
  let phase8State = {
    id: "1508141153835421798",
    name: "Music Sesh: Feature: Cross-service room sync and simple controls",
    thread_metadata: { archived: true, locked: true },
  };
  let journalCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    const threadId = url.match(/\/channels\/([^/?]+)$/)?.[1];
    if (threadId === "1508141153835421798") {
      if (method === "PATCH") {
        const body = JSON.parse(init.body);
        patches.push({ threadId, body });
        phase8State = {
          ...phase8State,
          ...body,
          thread_metadata: {
            ...phase8State.thread_metadata,
            ...(Object.hasOwn(body, "archived") ? { archived: body.archived } : {}),
            ...(Object.hasOwn(body, "locked") ? { locked: body.locked } : {}),
          },
        };
        return response({ payload: phase8State });
      }
      return response({ payload: phase8State });
    }
    if (threadId === "social-new" && method === "PATCH") {
      patches.push({ threadId, body: JSON.parse(init.body) });
      return response({ payload: { id: threadId } });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  const scanImpl = async () => ({ receipt: {
    ok: true,
    status: "consistent",
    denominator: { requiredBoardCount: 13, inspectedBoardCount: 13 },
    reasonCodes: [],
  } });
  const fsImpl = { mkdir: async () => {}, writeFile: async () => {} };
  const first = await migration.runResidualBoardRecovery({
    registry: firstSnapshot.registry,
    profileRegistry: profiles,
    socialsOwnerExport: ownerExport,
    socialsOwnerExportBlobOid: ownerExportBlobOid(ownerExport),
    snapshotPath: runtimeFixturePath("residual-test.json"),
    allowRecovery: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      [migration.RECOVERY_ENV]: migration.RECOVERY_ENV_VALUE,
    },
    fetchImpl,
    fsImpl,
    captureSnapshotImpl: async () => firstSnapshot,
    journalImpl: async ({ payload }) => {
      journalCalls += 1;
      assert.equal(payload.events.length, 1);
      assert.equal(payload.events[0].card.id, lastCardId);
      return {
        ok: true,
        eventCount: 1,
        results: [{ cardId: lastCardId, threadId: "social-new", cardAction: "created", reasonCodes: [] }],
        reasonCodes: [],
      };
    },
    scanImpl,
  });
  assert.equal(first.ok, true);
  assert.equal(journalCalls, 1);
  assert.equal(first.mutationTruth.socialsCreated, 1);
  assert.equal(first.mutationTruth.retainedMusicHistoryWrites, 0);
  assert.deepEqual([...new Set(patches.map((row) => row.threadId))].sort(), ["1508141153835421798", "social-new"]);
  assert.equal(patches.some((row) => row.threadId.startsWith("music-history-")), false);

  const secondSnapshot = residualSnapshot(12, { phase8Open: true, canonicalPhase8Title: true });
  patches.length = 0;
  const second = await migration.runResidualBoardRecovery({
    registry: secondSnapshot.registry,
    profileRegistry: profiles,
    socialsOwnerExport: ownerExport,
    socialsOwnerExportBlobOid: ownerExportBlobOid(ownerExport),
    snapshotPath: runtimeFixturePath("residual-test-2.json"),
    allowRecovery: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "token",
      [migration.RECOVERY_ENV]: migration.RECOVERY_ENV_VALUE,
    },
    fetchImpl,
    fsImpl,
    captureSnapshotImpl: async () => secondSnapshot,
    journalImpl: async () => { throw new Error("idempotent recovery must not replay existing Socials identities"); },
    scanImpl,
  });
  assert.equal(second.ok, true);
  assert.equal(second.plan.socials.missingIdentityCount, 0);
  assert.equal(second.mutationTruth.writeCount, 0);
  assert.deepEqual(patches, []);
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
    snapshotPath: runtimeFixturePath("snapshot.json"),
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
  assert.doesNotThrow(() => migration.assertRuntimePath(runtimeFixturePath("snapshot.json")));
  assert.equal(migration.resolveAdmission({ apply: true, allowMigration: true, env: {} }).admitted, false);
  assert.equal(migration.resolveAdmission({ apply: false, allowMigration: false, env: {} }).status, "dry_run");
  assert.equal(migration.resolveRecoveryAdmission({ apply: true, allowRecovery: true, env: {} }).admitted, false);
  assert.equal(migration.resolveRecoveryAdmission({
    apply: true,
    allowRecovery: true,
    env: { [migration.RECOVERY_ENV]: migration.RECOVERY_ENV_VALUE },
  }).admitted, true);
  const options = migration.parseArgs([
    "--recover-residual",
    "--allow-recovery",
    "--snapshot-output", runtimeFixturePath("snapshot.json"),
    "--output", runtimeFixturePath("receipt.json"),
  ]);
  assert.equal(options.recoverResidual, true);
  assert.equal(options.allowRecovery, true);
  assert.equal(options.apply, false);
});
