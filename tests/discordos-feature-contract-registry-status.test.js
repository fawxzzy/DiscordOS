const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-feature-contract-registry-status");

test("feature registry status args default to committed registry", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    registryPath: _internals.DEFAULT_REGISTRY_PATH,
  });
});

test("feature registry status passes current committed registry", async () => {
  const result = await _internals.buildFeatureContractRegistryStatus();

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.featureCount, 3);
  assert.equal(result.liveBehaviorAdmittedCount, 0);
  assert.equal(result.event.type, "discordos.feature_contract.registry_ready");
});

test("feature registry detects duplicate feature ids", () => {
  const result = _internals.classifyRegistry({
    version: 1,
    features: [
      {
        id: "board",
        label: "Board",
        domain: "board",
        status: "contract_only",
        docsPath: "docs/contracts/board.md",
        sourcePath: "src/contracts/board.ts",
        statusCommand: "npm run ops:discordos:board-card-status",
        liveBehaviorAdmitted: false,
      },
      {
        id: "board",
        label: "Board duplicate",
        domain: "board",
        status: "contract_only",
        docsPath: "docs/contracts/board-2.md",
        sourcePath: "src/contracts/board.ts",
        statusCommand: "npm run ops:discordos:board-card-status",
        liveBehaviorAdmitted: false,
      },
    ],
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("registry_feature_id_collision"));
});

test("feature registry blocks invalid paths and commands", () => {
  const result = _internals.classifyFeatureRecord({
    id: "bad",
    label: "Bad",
    domain: "bad",
    status: "done",
    docsPath: "tmp/bad.md",
    sourcePath: "api/bad.js",
    statusCommand: "curl example.invalid",
    liveBehaviorAdmitted: "no",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("feature_status_not_admitted"));
  assert(result.reasonCodes.includes("feature_docs_path_invalid"));
  assert(result.reasonCodes.includes("feature_source_path_invalid"));
  assert(result.reasonCodes.includes("feature_status_command_invalid"));
  assert(result.reasonCodes.includes("feature_live_behavior_flag_invalid"));
});

test("feature registry status renders bounded output", async () => {
  const result = await _internals.buildFeatureContractRegistryStatus();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Feature Contract Registry Status"));
  assert(rendered.includes("live behavior admitted: `0`"));
});
