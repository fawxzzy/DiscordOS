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
  assert.equal(result.storageProofReadyCount, 3);
  assert.equal(result.liveBehaviorAdmittedCount, 0);
  assert.equal(result.event.type, "discordos.product_workflow.dashboard_ready");

  const board = result.workflows.find((workflow) => workflow.id === "board");
  const moderation = result.workflows.find((workflow) => workflow.id === "moderation");
  const music = result.workflows.find((workflow) => workflow.id === "music_sesh");

  assert.equal(board.registryStatus, "active");
  assert.equal(board.persistenceStatus, "storage_migration_rls_ready");
  assert.equal(board.nextGate, "board_lifecycle_sync");
  assert.equal(moderation.registryStatus, "shadow");
  assert.equal(moderation.persistenceStatus, "storage_migration_rls_ready");
  assert.equal(moderation.nextGate, "moderation_audit_review_search");
  assert.equal(music.registryStatus, "active");
  assert.equal(music.persistenceStatus, "storage_migration_rls_ready");
  assert.equal(music.nextGate, "continue_governed_verification");
  assert.equal(result.releaseSummary.status, "operator_ready");
  assert.equal(result.releaseSummary.storageBackedWorkflowCount, 3);
  assert.equal(result.releaseSummary.guardedAdapterWorkflowCount, 2);
  assert.equal(result.releaseSummary.nextReleaseGate, "lifecycle_sync_and_review_search");
  assert.equal(result.operatorSummary.proofCommand, "npm run ops:discordos:supabase-apply-readback-proof");
  assert.equal(result.operatorSummary.liveReadbackCommand, "npm run ops:discordos:product-workflow-live-readback -- --live");
  assert.equal(result.operatorSummary.musicCommand, "npm run ops:discordos:music-sesh-write-adapter-guard");
});

test("product workflow dashboard command helpers are stable", () => {
  assert.equal(
    _internals.commandForFeature("board"),
    "npm run ops:discordos:board-lifecycle-sync"
  );
  assert.equal(
    _internals.commandForFeature("moderation"),
    "npm run ops:discordos:moderation-audit-review-search"
  );
  assert.equal(
    _internals.commandForFeature("music_sesh"),
    "npm run ops:discordos:music-sesh-runtime"
  );
});

test("product workflow dashboard renders bounded markdown", async () => {
  const result = await _internals.buildDiscordOSProductWorkflowDashboard();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Product Workflow Dashboard"));
  assert(rendered.includes("next release gate: `lifecycle_sync_and_review_search`"));
  assert(rendered.includes("proof command: `npm run ops:discordos:supabase-apply-readback-proof`"));
  assert(rendered.includes("live readback command: `npm run ops:discordos:product-workflow-live-readback -- --live`"));
  assert(rendered.includes("board: registry `active`"));
  assert(rendered.includes("moderation: registry `shadow`"));
  assert(rendered.includes("music_sesh: registry `active`"));
  assert(!rendered.includes("SUPABASE_SERVICE_ROLE_KEY="));
});
