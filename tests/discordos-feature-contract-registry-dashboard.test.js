const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-feature-contract-registry-dashboard");

test("feature registry dashboard args default to committed registry", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    registryPath: _internals.DEFAULT_REGISTRY_PATH,
  });
});

test("feature registry dashboard passes current committed registry", async () => {
  const result = await _internals.buildFeatureContractRegistryDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.featureCount, 3);
  assert.equal(result.blockedFeatureCount, 0);
  assert.equal(result.liveBehaviorAdmittedCount, 0);
  assert.equal(result.event.type, "discordos.feature_contract.registry_dashboard_ready");
});

test("feature registry dashboard blocks live behavior below active", () => {
  const result = _internals.buildDashboardReadModel({
    version: 1,
    features: [
      {
        id: "music_sesh",
        label: "Music Sesh",
        domain: "music_sesh",
        status: "preflight_only",
        docsPath: "docs/contracts/music.md",
        sourcePath: "src/contracts/music.ts",
        statusCommand: "npm run ops:discordos:music-sesh-status",
        liveBehaviorAdmitted: true,
      },
    ],
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("live_behavior_admitted_below_active"));
});

test("feature registry dashboard supports explicit registry path", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-registry-dashboard-"));
  const registryPath = path.join(dir, "registry.json");
  await fs.writeFile(registryPath, JSON.stringify({
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
    ],
  }), "utf8");

  const result = await _internals.buildFeatureContractRegistryDashboard({ registryPath });

  assert.equal(result.ok, true);
  assert.equal(result.featureCount, 1);
});

test("feature registry dashboard renders bounded output", async () => {
  const result = await _internals.buildFeatureContractRegistryDashboard();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Feature Contract Registry Dashboard"));
  assert(rendered.includes("live behavior admitted: `0`"));
  assert(!rendered.includes("DISCORDOS_BOT_TOKEN="));
});
