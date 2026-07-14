const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-registry");

const REGISTRY_PATH = path.resolve(__dirname, "..", "config", "discordos-board-registry.json");

function canonicalRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
}

test("canonical registry covers the full discovered and required denominator", () => {
  const registry = canonicalRegistry();
  const result = _internals.validateBoardRegistry(registry);

  assert.equal(result.ok, true);
  assert.equal(result.boardCount, 12);
  assert.equal(result.requiredBoardCount, 12);
  assert.equal(result.enabledBoardCount, 5);
  assert.equal(result.blockedBoardCount, 7);
  assert.deepEqual(
    result.boards.filter((board) => board.status === "enabled").map((board) => board.id),
    ["legacy-general-feedback", "fitness-active", "mazer-active", "music-sesh-active", "shared-completed"],
  );
  assert.deepEqual(
    result.boards.filter((board) => board.status === "blocked").map((board) => board.project),
    ["Atlas", "DiscordOS", "Foundation", "Lifeline", "Cortex", "_stack", "Playbook"],
  );
});

test("duplicate board identities, channels, namespaces, and ownership are invalid", () => {
  const registry = canonicalRegistry();
  const duplicate = structuredClone(registry.boards.find((board) => board.id === "fitness-active"));
  registry.boards.push(duplicate);

  const result = _internals.validateBoardRegistry(registry);

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("duplicate_board_id:fitness-active"));
  assert(result.reasonCodes.includes("duplicate_board_channel_id:1508144612957622313"));
  assert(result.reasonCodes.includes("duplicate_stable_card_namespace:fitness"));
  assert(result.reasonCodes.some((code) => code.startsWith("overlapping_board_ownership:fitness:active:")));
});

test("invalid states, roles, adapters, and completion targets are rejected", () => {
  const registry = canonicalRegistry();
  registry.lifecycleNormalizationPolicies["active-canonical-v1"].allowedStates.push("invented");
  Object.assign(registry.boards[1], {
    role: "queue",
    sourceAdapter: "missing-adapter",
    completionDestination: "missing-target",
  });

  const result = _internals.validateBoardRegistry(registry);

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("lifecycle_policy_state_invalid:active-canonical-v1:invented"));
  assert(result.reasonCodes.includes("board_role_invalid:fitness-active"));
  assert(result.reasonCodes.includes("board_source_adapter_missing:fitness-active"));
  assert(result.reasonCodes.includes("board_completion_destination_unknown:fitness-active"));
});
