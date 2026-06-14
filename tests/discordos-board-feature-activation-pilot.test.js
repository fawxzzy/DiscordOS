const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-feature-activation-pilot");

async function writeRegistry(registry) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-board-pilot-"));
  const registryPath = path.join(dir, "registry.json");
  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return registryPath;
}

function boardFeature(overrides = {}) {
  return {
    id: "board",
    label: "DiscordOS Board Card Workflow v0",
    domain: "board",
    status: "shadow",
    docsPath: "docs/contracts/discordos-board-card-workflow-v0.md",
    sourcePath: "src/contracts/board.ts",
    statusCommand: "npm run ops:discordos:board-card-status",
    liveBehaviorAdmitted: false,
    ...overrides,
  };
}

test("board feature activation pilot parses registry and feature args", () => {
  const parsed = _internals.parseArgs(["--json", "--registry", "registry.json", "--feature", "board"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.feature, "board");
  assert(parsed.registryPath.endsWith("registry.json"));
});

test("board feature activation pilot passes current shadow registry posture", async () => {
  const result = await _internals.buildBoardFeatureActivationPilot();

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.status, "pilot_ready");
  assert.equal(result.feature, "board");
  assert.equal(result.pilotStatus, "shadow");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.liveBehaviorAdmitted, false);
  assert.equal(result.nextGate, "active_admission_required");
  assert.equal(result.registryMutated, false);
  assert.equal(result.liveBehaviorChanges, false);
  assert.equal(result.event.type, "discordos.board_feature.activation_pilot_ready");
});

test("board feature activation pilot blocks non-shadow board status", async () => {
  const registryPath = await writeRegistry({
    version: 1,
    features: [
      boardFeature({ status: "contract_only" }),
    ],
  });
  const result = await _internals.buildBoardFeatureActivationPilot({ registryPath });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("feature_not_in_shadow_pilot"));
});

test("board feature activation pilot blocks live behavior admission", async () => {
  const registryPath = await writeRegistry({
    version: 1,
    features: [
      boardFeature({ status: "shadow", liveBehaviorAdmitted: true }),
    ],
  });
  const result = await _internals.buildBoardFeatureActivationPilot({ registryPath });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("live_behavior_admitted_below_active"));
  assert(result.reasonCodes.includes("pilot_cannot_admit_live_behavior"));
});

test("board feature activation pilot renders bounded markdown", async () => {
  const result = await _internals.buildBoardFeatureActivationPilot();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Feature Activation Pilot"));
  assert(rendered.includes("pilot status: `shadow`"));
  assert(rendered.includes("live behavior admitted: `false`"));
  assert(!rendered.includes("DISCORDOS_BOT_TOKEN="));
});
