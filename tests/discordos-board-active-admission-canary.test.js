const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-active-admission-canary");

async function writeRegistry(boardStatus, liveBehaviorAdmitted = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-board-canary-"));
  const registryPath = path.join(dir, "registry.json");
  await fs.writeFile(registryPath, JSON.stringify({
    version: 1,
    features: [
      {
        id: "board",
        label: "Board",
        domain: "board",
        status: boardStatus,
        docsPath: "docs/contracts/discordos-board-card-workflow-v0.md",
        sourcePath: "src/contracts/board.ts",
        statusCommand: "npm run ops:discordos:board-card-status",
        liveBehaviorAdmitted,
      },
    ],
  }), "utf8");
  return registryPath;
}

test("board active admission canary parses registry and migration args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--registry",
    "registry.json",
    "--migration-file",
    "migration.sql",
  ]);

  assert.equal(parsed.json, true);
  assert(parsed.registryPath.endsWith("registry.json"));
  assert(parsed.migrationPath.endsWith("migration.sql"));
});

test("board active admission canary passes current active no-live posture", async () => {
  const result = await _internals.buildBoardActiveAdmissionCanary();

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.status, "canary_ready");
  assert.equal(result.registryStatus, "active");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.liveBehaviorAdmitted, false);
  assert.equal(result.nextGate, "live_behavior_admission_required");
  assert.equal(result.storageProof.ok, true);
  assert.equal(result.storageProof.rlsEnabled, true);
  assert.equal(result.storageProof.serviceRoleOnly, true);
  assert.equal(result.canaryWritesAllowed, false);
  assert.equal(result.liveBehaviorChanges, false);
  assert.equal(result.event.type, "discordos.board_feature.active_admission_canary_ready");
});

test("board active admission canary blocks non-active registry status", async () => {
  const registryPath = await writeRegistry("shadow");
  const result = await _internals.buildBoardActiveAdmissionCanary({ registryPath });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("board_feature_not_active_canary"));
});

test("board active admission canary blocks live behavior admission", async () => {
  const registryPath = await writeRegistry("active", true);
  const result = await _internals.buildBoardActiveAdmissionCanary({ registryPath });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("board_canary_cannot_admit_live_behavior"));
});

test("board active admission canary renders bounded markdown", async () => {
  const result = await _internals.buildBoardActiveAdmissionCanary();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Active Admission Canary"));
  assert(rendered.includes("registry status: `active`"));
  assert(rendered.includes("canary writes allowed: `false`"));
  assert(!rendered.includes("DISCORDOS_BOT_TOKEN="));
});
