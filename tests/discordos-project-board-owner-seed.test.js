const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { _internals } = require("../scripts/discordos-project-board-owner-seed");

const registry = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "config", "discordos-board-registry.json"), "utf8"));

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

test("CLI requires exports and an output artifact", () => {
  assert.throws(() => _internals.parseArgs([]), /owner_export_path_missing/);
  assert.throws(() => _internals.parseArgs(["--owner-export", "owner.json"]), /output_path_missing/);
  const options = _internals.parseArgs(["--owner-export", "owner.json", "--output", "batch.json", "--json"]);
  assert.equal(options.exportPaths.length, 1);
  assert.equal(options.json, true);
});
