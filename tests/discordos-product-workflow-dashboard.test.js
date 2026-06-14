const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-product-workflow-dashboard");

test("product workflow dashboard args reuse registry dashboard args", () => {
  const parsed = _internals.parseArgs(["--json", "--registry", "registry.json"]);

  assert.equal(parsed.json, true);
  assert(parsed.registryPath.endsWith("registry.json"));
});

test("product workflow dashboard builds board, moderation, and music rows", async () => {
  const result = await _internals.buildDiscordOSProductWorkflowDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.status, "ready");
  assert.equal(result.workflowCount, 3);
  assert.equal(result.storageProofReadyCount, 2);
  assert.equal(result.liveBehaviorAdmittedCount, 0);
  assert.equal(result.event.type, "discordos.product_workflow.dashboard_ready");

  const board = result.workflows.find((workflow) => workflow.id === "board");
  const moderation = result.workflows.find((workflow) => workflow.id === "moderation");
  const music = result.workflows.find((workflow) => workflow.id === "music_sesh");

  assert.equal(board.registryStatus, "active");
  assert.equal(board.persistenceStatus, "storage_migration_rls_ready");
  assert.equal(board.nextGate, "explicit_live_behavior_admission");
  assert.equal(moderation.registryStatus, "shadow");
  assert.equal(moderation.persistenceStatus, "storage_migration_rls_ready");
  assert.equal(music.registryStatus, "preflight_only");
  assert.equal(music.persistenceStatus, "preflight_only");
});

test("product workflow dashboard command helpers are stable", () => {
  assert.equal(
    _internals.commandForFeature("board"),
    "npm run ops:discordos:board-active-admission-canary"
  );
  assert.equal(
    _internals.commandForFeature("moderation"),
    "npm run ops:discordos:moderation-storage-migration-rls-proof"
  );
  assert.equal(
    _internals.commandForFeature("music_sesh"),
    "npm run ops:discordos:music-sesh-preflight"
  );
});

test("product workflow dashboard renders bounded markdown", async () => {
  const result = await _internals.buildDiscordOSProductWorkflowDashboard();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Product Workflow Dashboard"));
  assert(rendered.includes("board: registry `active`"));
  assert(rendered.includes("moderation: registry `shadow`"));
  assert(rendered.includes("music_sesh: registry `preflight_only`"));
  assert(!rendered.includes("SUPABASE_SERVICE_ROLE_KEY="));
});
