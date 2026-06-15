const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-operator-dashboard");

function nextWorkResult(overrides = {}) {
  return {
    ok: true,
    operatorStatus: {
      ok: true,
      eventType: "discordos.operator.status_ready",
      probeLive: false,
      runtimeOk: true,
      publicationOk: true,
      publicationAuditOk: true,
      atlasHealthOk: true,
      notificationPolicyOk: true,
    },
    status: "ready",
    reasonCodes: ["operator_status_ready_for_command_ergonomics"],
    recommendations: [
      {
        id: "inspect-operator-command-ergonomics",
        score: 52,
        status: "recommended",
        category: "operator-env",
        title: "Inspect operator command ergonomics for the next low-friction workflow improvement",
        command: "npm run ops:discordos:dashboard:prod",
        reasonCodes: ["operator_status_ready_for_command_ergonomics"],
      },
    ],
    topRecommendation: {
      id: "inspect-operator-command-ergonomics",
      command: "npm run ops:discordos:dashboard:prod",
      reasonCodes: ["operator_status_ready_for_command_ergonomics"],
    },
    receiptState: {},
    ...overrides,
  };
}

test("operator dashboard args reuse next-work args", () => {
  const parsed = _internals.parseArgs(["--json", "--max", "1", "--probe-live"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.max, 1);
  assert.equal(parsed.probeLive, true);
});

test("operator dashboard summarizes next-work result into command hint", async () => {
  const original = nextWorkResult();
  const console = _internals.buildDashboardConsole(original);
  const dashboard = {
    ok: original.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: original.operatorStatus.ok ? "ready" : "action_required",
    operator: _internals.buildOperatorSummary(original),
    nextWork: {
      status: original.status,
      recommendationCount: original.recommendations.length,
      topRecommendationId: original.topRecommendation.id,
      reasonCodes: original.reasonCodes,
    },
    commandHint: _internals.buildCommandHint(original.topRecommendation),
    recommendations: original.recommendations,
    highestValueCategories: _internals.buildHighestValueCategories(),
    console,
    productRuntime: _internals.buildProductRuntimePanel(),
    receiptState: original.receiptState,
  };
  const event = _internals.classifyDashboardEvent(dashboard);

  assert.equal(dashboard.operator.runtimeOk, true);
  assert.equal(dashboard.operator.notificationPolicyOk, true);
  assert.equal(dashboard.nextWork.recommendationCount, 1);
  assert.equal(dashboard.commandHint.command, "npm run ops:discordos:dashboard:prod");
  assert.equal(dashboard.console.statusLine, "ready");
  assert.equal(dashboard.console.failingTileCount, 0);
  assert.equal(dashboard.console.healthTiles.length, 5);
  assert.equal(dashboard.productRuntime.surfaceCount, 44);
  assert.equal(dashboard.productRuntime.availableCount, 44);
  assert.equal(dashboard.highestValueCategories.length, 5);
  assert.equal(dashboard.highestValueCategories[0].id, "music_sesh_live_canary_depth");
  assert.equal(dashboard.console.recommendationGroups[0].category, "operator-env");
  assert.equal(event.type, "discordos.operator.dashboard_ready");
  assert.equal(event.dimensions.topRecommendation, "inspect-operator-command-ergonomics");
});

test("operator dashboard exposes product runtime command tiles", () => {
  const panel = _internals.buildProductRuntimePanel();

  assert.equal(panel.surfaceCount, 44);
  assert(panel.tiles.some((tile) => tile.id === "board_shadow_persistence"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-feature-activation-pilot"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-active-admission-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-active-write-adapter-guard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-lifecycle-sync"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:moderation-audit-write-adapter-guard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:moderation-audit-review-search"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:supabase-apply-readback-proof"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:product-workflow-live-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:product-workflow-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-runtime"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-control-post"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-control-post-publish"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-button-router"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:testing-surface-provision"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-lifecycle-event-ingest"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:chat-command-intake"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:chat-message-listener"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:chat-message-live-ingest"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:product-workflow-monitor"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:operator-activation-runbook"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-storage-contract"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:interaction-doctrine-status"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:discord-interaction-signature-preflight"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:moderation-audit-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:product-workflow-alert-drill"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-feature-activation-ratchet"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-feedback-board"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-write-adapter-guard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-live-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-queue-status"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-button-chat-live-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:no-slash-workflow-surfaces"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:signed-interaction-endpoint-smoke"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:signed-interaction-endpoint-smoke -- --type MESSAGE_COMPONENT --execute-route"));
  assert(!panel.tiles.some((tile) => /slash-command-adapter|moderation-review-slash-command|slash-command-registration-preflight|slash-command-registration-apply-guard|slash-command-deactivation-apply-guard/.test(tile.command)));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:interaction-handler-admission"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-queue-replay-proof"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:product-workflow-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-feedback-board-live-sync"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-feature-card-forum-post"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-feature-card-reactions"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-moderation-post-button-conversion"));
});

test("operator dashboard groups recommendations by category and highest score", () => {
  const groups = _internals.groupRecommendationsByCategory([
    {
      id: "low-runtime",
      category: "runtime",
      score: 10,
      command: "npm run low",
    },
    {
      id: "top-runtime",
      category: "runtime",
      score: 90,
      command: "npm run top",
    },
    {
      id: "publication",
      category: "publication",
      score: 50,
      command: null,
    },
  ]);

  assert.equal(groups[0].category, "runtime");
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].topRecommendationId, "top-runtime");
  assert.deepEqual(groups[0].commands, [
    { id: "low-runtime", command: "npm run low" },
    { id: "top-runtime", command: "npm run top" },
  ]);
  assert.equal(groups[1].category, "publication");
});

test("operator dashboard exposes ranked highest-value categories", () => {
  const categories = _internals.buildHighestValueCategories();

  assert.equal(categories.length, 5);
  assert.deepEqual(
    categories.map((category) => category.rank),
    [1, 2, 3, 4, 5]
  );
  assert(categories.some((category) => category.id === "product_workflow_monitor_thresholds"));
  assert(categories.every((category) => category.command.startsWith("npm run ops:discordos:")));
});

test("operator dashboard renders compact markdown without target values", () => {
  const source = nextWorkResult();
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: "ready",
    event: {
      type: "discordos.operator.dashboard_ready",
      severity: "info",
    },
    operator: _internals.buildOperatorSummary(nextWorkResult()),
    nextWork: {
      recommendationCount: 1,
      topRecommendationId: "inspect-operator-command-ergonomics",
      reasonCodes: ["operator_status_ready_for_command_ergonomics"],
    },
    commandHint: {
      command: "npm run ops:discordos:dashboard:prod",
    },
    highestValueCategories: _internals.buildHighestValueCategories(),
    console: _internals.buildDashboardConsole(source),
    productRuntime: _internals.buildProductRuntimePanel(),
  });

  assert(rendered.includes("# DiscordOS Operator Dashboard"));
  assert(rendered.includes("runtime: `pass`"));
  assert(rendered.includes("notification policy: `pass`"));
  assert(rendered.includes("top recommendation: `inspect-operator-command-ergonomics`"));
  assert(rendered.includes("command: `npm run ops:discordos:dashboard:prod`"));
  assert(rendered.includes("status line: `ready`"));
  assert(rendered.includes("highest value categories: `5`"));
  assert(rendered.includes("category 1: `Music Sesh live canary depth`"));
  assert(rendered.includes("group operator-env: `1` top `inspect-operator-command-ergonomics`"));
  assert(rendered.includes("surface board_shadow_persistence: `available`"));
  assert(rendered.includes("surface board_feature_activation_pilot: `available`"));
  assert(rendered.includes("surface board_active_admission_canary: `available`"));
  assert(rendered.includes("surface board_active_write_adapter_guard: `available`"));
  assert(rendered.includes("surface board_lifecycle_sync: `available`"));
  assert(rendered.includes("surface moderation_audit_write_adapter_guard: `available`"));
  assert(rendered.includes("surface moderation_audit_review_search: `available`"));
  assert(rendered.includes("surface supabase_apply_readback_proof: `available`"));
  assert(rendered.includes("surface product_workflow_live_readback: `available`"));
  assert(rendered.includes("surface product_workflow_dashboard: `available`"));
  assert(rendered.includes("surface music_sesh_runtime: `available`"));
  assert(rendered.includes("surface music_sesh_control_post: `available`"));
  assert(rendered.includes("surface music_sesh_control_post_publish: `available`"));
  assert(rendered.includes("surface music_sesh_button_router: `available`"));
  assert(rendered.includes("surface testing_surface_provision: `available`"));
  assert(rendered.includes("surface board_lifecycle_event_ingest: `available`"));
  assert(rendered.includes("surface chat_command_intake: `available`"));
  assert(rendered.includes("surface chat_message_listener: `available`"));
  assert(rendered.includes("surface chat_message_live_ingest: `available`"));
  assert(rendered.includes("surface product_workflow_monitor: `available`"));
  assert(rendered.includes("surface operator_activation_runbook: `available`"));
  assert(rendered.includes("surface music_sesh_storage_contract: `available`"));
  assert(rendered.includes("surface interaction_doctrine_status: `available`"));
  assert(rendered.includes("surface discord_interaction_signature_preflight: `available`"));
  assert(rendered.includes("surface moderation_audit_dashboard: `available`"));
  assert(rendered.includes("surface product_workflow_alert_drill: `available`"));
  assert(rendered.includes("surface music_sesh_feature_activation_ratchet: `available`"));
  assert(rendered.includes("surface music_sesh_feedback_board: `available`"));
  assert(rendered.includes("surface music_sesh_write_adapter_guard: `available`"));
  assert(rendered.includes("surface music_sesh_live_readback: `available`"));
  assert(rendered.includes("surface music_sesh_queue_status: `available`"));
  assert(rendered.includes("surface music_sesh_button_chat_live_canary: `available`"));
  assert(rendered.includes("surface no_slash_workflow_surfaces: `available`"));
  assert(rendered.includes("surface signed_button_interaction_smoke: `available`"));
  assert(rendered.includes("surface signed_button_route_execution_smoke: `available`"));
  assert(rendered.includes("surface interaction_handler_admission: `available`"));
  assert(rendered.includes("surface music_sesh_queue_replay_proof: `available`"));
  assert(rendered.includes("surface product_workflow_alert_delivery_canary: `available`"));
  assert(rendered.includes("surface music_sesh_feedback_board_live_sync: `available`"));
  assert(rendered.includes("surface music_sesh_feature_card_forum_post: `available`"));
  assert(rendered.includes("surface music_sesh_feature_card_reactions: `available`"));
  assert(rendered.includes("surface board_moderation_post_button_conversion: `available`"));
  assert(!rendered.includes("bot-secret"));
});
