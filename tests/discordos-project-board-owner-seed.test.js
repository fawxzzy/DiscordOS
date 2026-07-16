const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { _internals } = require("../scripts/discordos-project-board-owner-seed");
const { _internals: boardRegistry } = require("../scripts/discordos-board-registry");

const registry = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "config", "discordos-board-registry.json"), "utf8"));
const socialsAcceptedPreimage = registry.sourceAdapters["socials-os-roadmap-v1"].acceptedPreimage;

function ownerExport(overrides = {}) {
  return {
    contract_version: _internals.OWNER_EXPORT_CONTRACT,
    export_id: "pbe_discordos_test",
    project_id: "discordos",
    board_id: "discordos:project-feedback:discordos",
    owner: "discordos",
    adapter_id: "discordos-owner-registry-v1",
    source_revision: "sha256:test",
    generated_at: "2026-07-15T00:00:00.000Z",
    cards: [{
      idempotency_key: "pbk_discordos_dos-999_v1",
      record: {
        card_id: "DOS-999", project_id: "discordos", board_id: "discordos:project-feedback:discordos", title: "Seed adapter test", card_type: "automation",
        lifecycle: "planning", priority: null, owner: "discordos", updated_at: "2026-07-15T00:00:00.000Z",
        source_ref: "repos/DiscordOS/config/test.json#DOS-999",
      },
      content: {
        summary: "Prove deterministic owner export conversion.", objective: "Prove deterministic owner export conversion.",
        acceptance_criteria: ["The journal event is deterministic."], discoveries: [], next_actions: [], blockers: [], evidence: ["repos/DiscordOS/tests/test.js"],
      },
    }],
    ...overrides,
  };
}

function resolvedSocialsRegistry(ownerExportValue = socialsOwnerExport()) {
  const value = structuredClone(registry);
  value.boards.find((board) => board.id === "socials-os-active-admission").forumChannelId = "socials-forum";
  value.sourceAdapters["socials-os-roadmap-v1"].acceptedPreimage.ownerExportBlob = ownerExportBlobOid(ownerExportValue);
  return value;
}

function ownerExportRaw(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ownerExportBlobOid(value) {
  return _internals.gitBlobOid(ownerExportRaw(value));
}

function socialsOwnerExport() {
  const cards = socialsAcceptedPreimage.orderedCardIds.map((cardId, index) => ({
    idempotency_key: `pbk_socials-os_${cardId.toLowerCase()}_v1`,
    record: {
      card_id: cardId,
      project_id: "socials-os",
      board_id: "discordos:project-feedback:socials-os",
      title: `Accepted Socials outcome ${index + 1}`,
      card_type: "reliability",
      lifecycle: "planning",
      priority: null,
      owner: "socials-os",
      updated_at: "2026-07-16T00:21:19Z",
      source_ref: `planning/roadmap.json#${cardId}`,
    },
    content: {
      summary: `Accepted Socials summary ${index + 1}`,
      objective: `Accepted Socials objective ${index + 1}`,
      acceptance_criteria: ["Exact accepted owner preimage is required."],
      discoveries: [],
      next_actions: [],
      blockers: [],
      evidence: ["planning/roadmap.json"],
    },
  }));
  return {
    contract_version: _internals.OWNER_EXPORT_CONTRACT,
    export_id: socialsAcceptedPreimage.exportId,
    project_id: "socials-os",
    board_id: "discordos:project-feedback:socials-os",
    owner: "socials-os",
    adapter_id: "socials-os-roadmap-v1",
    source_revision: socialsAcceptedPreimage.sourceRevision,
    generated_at: "2026-07-16T00:21:19Z",
    cards,
    extensions: {
      selection: {
        roadmap_record_count: socialsAcceptedPreimage.roadmapRecordCount,
        exported_nonterminal_count: socialsAcceptedPreimage.exportedNonterminalCount,
      },
    },
  };
}

test("owner export converts to one deterministic journal event", () => {
  const first = _internals.buildOwnerSeedBatch({ registry, ownerExports: [ownerExport()] });
  const second = _internals.buildOwnerSeedBatch({ registry, ownerExports: [ownerExport()] });
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.eventCount, 1);
  assert.equal(first.events[0].card.sourceForumChannelId, "1526814473267187864");
  assert.equal(first.events[0].card.state, "planning");
  assert.equal(first.events[0].card.priority, "Unspecified");
  assert.match(first.events[0].eventId, /^owner-seed-discordos-[a-f0-9]{20}$/);
});

test("terminal owner history is explicit and excluded from active seeding", () => {
  const terminal = ownerExport();
  terminal.cards[0].record.lifecycle = "completed";
  const result = _internals.buildOwnerSeedBatch({ registry, ownerExports: [terminal] });
  assert.equal(result.ok, true);
  assert.equal(result.eventCount, 0);
  assert.deepEqual(result.excluded, [{ projectId: "discordos", cardId: "DOS-999", lifecycle: "completed", reason: "terminal_owner_history" }]);
});

test("adapter mismatch and duplicate cross-export identities fail closed", () => {
  const mismatch = ownerExport({ adapter_id: "foundation-roadmap-v1" });
  const duplicate = ownerExport({ export_id: "pbe_discordos_duplicate" });
  const result = _internals.buildOwnerSeedBatch({ registry, ownerExports: [mismatch, duplicate] });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("owner_export_adapter_mismatch"));
  assert(result.reasonCodes.includes("owner_export_card_id_duplicate:dos-999"));
  assert.equal(result.eventCount, 0);
});

test("mojibake in an owner export blocks before journal generation", () => {
  const corrupt = ownerExport();
  corrupt.cards[0].record.title = "Broken Ã¢â‚¬â€ title";
  const result = _internals.buildOwnerSeedBatch({ registry, ownerExports: [corrupt] });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("owner_export_text_integrity_failed"));
  assert.equal(result.eventCount, 0);
});

test("Socials registry records the authoritative accepted owner-export preimage", () => {
  assert.deepEqual(socialsAcceptedPreimage, {
    repository: "fawxzzy/socials-os",
    repositoryCommit: "99335e2f9a6fc4339d5577b41dd46fdfa7dcd85a",
    ownerExportBlob: "e70bd79135c99b89483e6edbd5a417d135aba753",
    exportId: "pbe_socials-os_773fe3821635",
    sourceRevision: "sha256:773fe3821635533a72ec6949bb3e716c5ed93d233df29363f1bbca4d1aeb94fe",
    roadmapRecordCount: 23,
    exportedNonterminalCount: 12,
    orderedCardIds: [
      "SOC-009", "SOC-010", "SOC-011", "SOC-012", "SOC-013", "SOC-015",
      "SOC-016", "SOC-017", "SOC-018", "SOC-020", "SOC-021", "SOC-022",
    ],
  });
});

test("exact accepted Socials preimage produces the ordered 12-event seed", () => {
  const accepted = socialsOwnerExport();
  const result = _internals.buildOwnerSeedBatch({
    registry: resolvedSocialsRegistry(accepted),
    ownerExports: [accepted],
    observedBlobOids: [ownerExportBlobOid(accepted)],
  });
  assert.equal(result.ok, true);
  assert.equal(result.eventCount, 12);
  assert.deepEqual(result.events.map((event) => event.card.id), socialsAcceptedPreimage.orderedCardIds);
});

test("every Socials accepted-preimage drift fails closed before all journal generation", async (t) => {
  const cases = [
    {
      name: "wrong export id",
      reason: "owner_export_preimage_export_id_mismatch",
      mutate(value) { value.export_id = "pbe_socials-os_wrong"; },
    },
    {
      name: "wrong adapter id",
      reason: "owner_export_preimage_adapter_mismatch",
      mutate(value) { value.adapter_id = "foundation-roadmap-v1"; },
    },
    {
      name: "wrong source digest",
      reason: "owner_export_preimage_source_revision_mismatch",
      mutate(value) { value.source_revision = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"; },
    },
    {
      name: "missing card",
      reason: "owner_export_preimage_card_count_mismatch",
      mutate(value) { value.cards.pop(); },
    },
    {
      name: "extra card",
      reason: "owner_export_preimage_card_count_mismatch",
      mutate(value) {
        const extra = structuredClone(value.cards.at(-1));
        extra.record.card_id = "SOC-999";
        extra.idempotency_key = "pbk_socials-os_soc-999_v1";
        value.cards.push(extra);
      },
    },
    {
      name: "substituted same-count card",
      reason: "owner_export_preimage_ordered_card_ids_mismatch",
      mutate(value) {
        value.cards[5].record.card_id = "SOC-014";
        value.cards[5].idempotency_key = "pbk_socials-os_soc-014_v1";
      },
    },
    {
      name: "reordered cards",
      reason: "owner_export_preimage_ordered_card_ids_mismatch",
      mutate(value) { [value.cards[4], value.cards[5]] = [value.cards[5], value.cards[4]]; },
    },
    {
      name: "roadmap count drift",
      reason: "owner_export_preimage_roadmap_record_count_mismatch",
      mutate(value) { value.extensions.selection.roadmap_record_count += 1; },
    },
    {
      name: "selection count drift",
      reason: "owner_export_preimage_exported_nonterminal_count_mismatch",
      mutate(value) { value.extensions.selection.exported_nonterminal_count += 1; },
    },
    {
      name: "same-envelope card content drift",
      reason: "owner_export_preimage_blob_mismatch",
      mutate(value) { value.cards[0].record.title = "Unreviewed replacement title"; },
    },
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, () => {
      const drifted = socialsOwnerExport();
      candidate.mutate(drifted);
      const result = _internals.buildOwnerSeedBatch({
        registry: resolvedSocialsRegistry(),
        ownerExports: [ownerExport(), drifted],
        observedBlobOids: [null, ownerExportBlobOid(drifted)],
      });
      assert.equal(result.ok, false);
      assert(result.reasonCodes.includes(candidate.reason));
      assert.equal(result.eventCount, 0);
      assert.deepEqual(result.events, []);
    });
  }
});

test("accepted-preimage validation fails closed when raw blob identity is unavailable", () => {
  const accepted = socialsOwnerExport();
  const result = _internals.buildOwnerSeedBatch({
    registry: resolvedSocialsRegistry(accepted),
    ownerExports: [accepted],
  });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("owner_export_preimage_blob_unverified"));
  assert.equal(result.eventCount, 0);
  assert.deepEqual(result.events, []);
});

test("path-backed production validation checks the exact owner-export Git blob", async () => {
  const accepted = socialsOwnerExport();
  const acceptedRaw = ownerExportRaw(accepted);
  const pathRegistry = resolvedSocialsRegistry();
  pathRegistry.sourceAdapters["socials-os-roadmap-v1"].acceptedPreimage.ownerExportBlob = _internals.gitBlobOid(acceptedRaw);
  const files = new Map([
    ["registry.json", Buffer.from(JSON.stringify(pathRegistry), "utf8")],
    ["owner.json", acceptedRaw],
  ]);
  const fsImpl = {
    async readFile(filePath, encoding) {
      const value = files.get(filePath);
      if (!value) throw new Error(`missing_test_file:${filePath}`);
      return encoding ? value.toString(encoding) : value;
    },
  };

  const admitted = await _internals.buildOwnerSeedBatchFromPaths({
    registryPath: "registry.json",
    exportPaths: ["owner.json"],
    fsImpl,
  });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.eventCount, 12);

  files.set("owner.json", Buffer.concat([acceptedRaw, Buffer.from(" ", "utf8")]));
  const blocked = await _internals.buildOwnerSeedBatchFromPaths({
    registryPath: "registry.json",
    exportPaths: ["owner.json"],
    fsImpl,
  });
  assert.equal(blocked.ok, false);
  assert(blocked.reasonCodes.includes("owner_export_preimage_blob_mismatch"));
  assert.equal(blocked.eventCount, 0);
});

test("registry requires orderedCardIds to be an actual array even for an empty accepted preimage", () => {
  for (const malformedValue of [undefined, null, "", {}]) {
    const malformed = structuredClone(registry);
    const accepted = malformed.sourceAdapters["socials-os-roadmap-v1"].acceptedPreimage;
    accepted.exportedNonterminalCount = 0;
    if (malformedValue === undefined) delete accepted.orderedCardIds;
    else accepted.orderedCardIds = malformedValue;
    const result = boardRegistry.validateBoardRegistry(malformed);
    assert.equal(result.ok, false);
    assert(result.reasonCodes.includes("source_adapter_preimage_card_ids_invalid:socials-os-roadmap-v1"));
  }
});

test("CLI requires exports and an output artifact", () => {
  assert.throws(() => _internals.parseArgs([]), /owner_export_path_missing/);
  assert.throws(() => _internals.parseArgs(["--owner-export", "owner.json"]), /output_path_missing/);
  const options = _internals.parseArgs(["--owner-export", "owner.json", "--output", "batch.json", "--json"]);
  assert.equal(options.exportPaths.length, 1);
  assert.equal(options.json, true);
});
