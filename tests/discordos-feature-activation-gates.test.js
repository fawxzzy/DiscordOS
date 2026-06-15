const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-feature-activation-gates");

async function writeRegistry(registry) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-feature-gates-"));
  const registryPath = path.join(dir, "registry.json");
  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return registryPath;
}

function feature(overrides = {}) {
  return {
    id: "board",
    label: "Board",
    domain: "board",
    status: "contract_only",
    docsPath: "docs/contracts/discordos-board-card-workflow-v0.md",
    sourcePath: "src/contracts/board.ts",
    statusCommand: "npm run ops:discordos:board-card-status",
    liveBehaviorAdmitted: false,
    ...overrides,
  };
}

test("feature activation gates parse registry args", () => {
  const parsed = _internals.parseArgs(["--json", "--registry", "registry.json"]);

  assert.equal(parsed.json, true);
  assert(parsed.registryPath.endsWith("registry.json"));
});

test("feature activation gates classify current contract and preflight features as blocked", () => {
  const contractGate = _internals.classifyFeatureActivationGate(feature());
  const preflightGate = _internals.classifyFeatureActivationGate(feature({
    id: "music_sesh",
    status: "preflight_only",
  }));

  assert.equal(contractGate.activationAllowed, false);
  assert.equal(contractGate.nextGate, "preflight_admission_required");
  assert(contractGate.reasonCodes.includes("contract_feature_requires_preflight_admission"));
  assert.equal(preflightGate.activationAllowed, false);
  assert.equal(preflightGate.nextGate, "shadow_or_active_admission_required");
});

test("feature activation gates allow only active features with live admission", () => {
  const gate = _internals.classifyFeatureActivationGate(feature({
    status: "active",
    liveBehaviorAdmitted: true,
  }));

  assert.equal(gate.activationAllowed, true);
  assert.equal(gate.nextGate, "active_live_behavior_admitted");
  assert.deepEqual(gate.reasonCodes, []);
});

test("feature activation gates fail closed on impossible live admission", async () => {
  const registryPath = await writeRegistry({
    version: 1,
    features: [
      feature({
        status: "preflight_only",
        liveBehaviorAdmitted: true,
      }),
    ],
  });
  const result = await _internals.buildFeatureActivationGates({ registryPath });

  assert.equal(result.ok, false);
  assert.equal(result.impossibleLiveAdmissionCount, 1);
  assert(result.reasonCodes.includes("live_behavior_admitted_below_active"));
});

test("feature activation gates build current registry read model", async () => {
  const result = await _internals.buildFeatureActivationGates();

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.liveBehaviorChanges, false);
  assert.equal(result.featureCount, 3);
  assert.equal(result.activationAllowedCount, 0);
  assert.equal(result.blockedFeatureCount, 3);
  assert.equal(result.features.find((candidate) => candidate.id === "board").status, "active");
  assert.equal(
    result.features.find((candidate) => candidate.id === "board").nextGate,
    "live_behavior_admission_required"
  );
  assert.equal(result.event.type, "discordos.feature_activation.gates_ready");
});

test("feature activation gates render bounded markdown", async () => {
  const result = await _internals.buildFeatureActivationGates();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Feature Activation Gates"));
  assert(rendered.includes("activation allowed: `0`"));
  assert(rendered.includes("board: status `active`"));
  assert(rendered.includes("music_sesh: status `shadow`"));
  assert(!rendered.includes("bot-secret"));
});
