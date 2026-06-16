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
  assert.equal(dashboard.productRuntime.surfaceCount, 174);
  assert.equal(dashboard.productRuntime.availableCount, 174);
  assert.equal(dashboard.highestValueCategories.length, 5);
  assert.equal(dashboard.highestValueCategories[0].id, "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history");
  assert.match(dashboard.highestValueCategories[0].why, /dashboard now gives a scan-ready operator state/);
  assert.match(dashboard.highestValueCategories[0].does, /Tracks host-control/);
  assert.equal(dashboard.console.recommendationGroups[0].category, "operator-env");
  assert.equal(event.type, "discordos.operator.dashboard_ready");
  assert.equal(event.dimensions.topRecommendation, "inspect-operator-command-ergonomics");
});

test("operator dashboard exposes product runtime command tiles", () => {
  const panel = _internals.buildProductRuntimePanel();

  assert.equal(panel.surfaceCount, 174);
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
  assert(panel.tiles.some((tile) => tile.id === "music_provider_adapter_admission_guard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-metadata-contract"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-metadata-live-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-selection-button-flow"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-selection-to-queue-live-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-selection-user-button-surface"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-surface-publish-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-surface-interaction-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-live-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-gate"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-control-post"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-control-post-publish"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-channel-target-status"));
  assert(panel.tiles.some((tile) => tile.id === "music_sesh_channel_target_env_contract"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-button-router"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-session-lifecycle-buttons"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-queue-conflict-host-controls"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-controls-persisted-state-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-live-apply-reconciliation"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-live-apply-dashboard-rollup"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-rollup-history-persistence"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-history-trend-alerts"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-routing"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-history-rollup"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-history-rollup-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:testing-surface-provision"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-lifecycle-event-ingest"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:chat-command-intake"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:chat-message-listener"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:chat-message-live-ingest"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-user-response-delivery-guard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-policy-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-channel-admission-gate"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-non-testing-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-non-testing-response-live-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-policy"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-enforcement"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-observability"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history"));
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
  assert(panel.tiles.some((tile) => tile.id === "music_sesh_live_status_response_readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-button-chat-live-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:no-slash-workflow-surfaces"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:signed-interaction-endpoint-smoke"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-persistence"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-live-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-alert-target-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-alert-runbook-linking"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-alert-acknowledgement-flow"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-persistence"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-readback-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-dashboard-alert-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:signed-interaction-endpoint-smoke -- --type MESSAGE_COMPONENT --execute-route"));
  assert(panel.tiles.some((tile) => tile.id === "button_route_observability_audit"));
  assert(!panel.tiles.some((tile) => /slash-command-adapter|moderation-review-slash-command|slash-command-registration-preflight|slash-command-registration-apply-guard|slash-command-deactivation-apply-guard/.test(tile.command)));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:interaction-handler-admission"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-queue-replay-proof"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:product-workflow-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:music-sesh-feedback-board-live-sync"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-lifecycle-readback-reconciliation"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-lifecycle-sync"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-lifecycle-reaction-drift-monitor"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-auto-repair-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-auto-repair-live-apply-reconciliation"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-drift-scheduler"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-scheduler-guarded-apply"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-observability-rollup"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-rollup-alerts"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-canary"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-readback"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting"));
  assert(panel.tiles.some((tile) => tile.command === "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary"));
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
  assert(categories.some((category) => category.id === "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback"));
  assert(categories.every((category) => category.command.startsWith("npm run ops:discordos:")));
  assert(categories.every((category) => typeof category.why === "string" && category.why.length > 20));
  assert(categories.every((category) => typeof category.does === "string" && category.does.length > 20));
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
  assert(rendered.includes("category 1: `Music Sesh host control trend alert delivery rollup dashboard history alert delivery history alert delivery history`"));
  assert(rendered.includes("why: The host-control alert delivery dashboard now gives a scan-ready operator state"));
  assert(rendered.includes("does: Tracks host-control alert delivery dashboard records"));
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
  assert(rendered.includes("surface music_provider_adapter_admission_guard: `available`"));
  assert(rendered.includes("surface music_provider_metadata_live_canary: `available`"));
  assert(rendered.includes("surface music_provider_metadata_selection_preview: `available`"));
  assert(rendered.includes("surface music_provider_queue_selection_button_flow: `available`"));
  assert(rendered.includes("surface music_provider_selection_to_queue_live_canary: `available`"));
  assert(rendered.includes("surface music_provider_queue_selection_user_button_surface: `available`"));
  assert(rendered.includes("surface music_provider_queue_surface_publish_readback: `available`"));
  assert(rendered.includes("surface music_provider_queue_surface_interaction_readback: `available`"));
  assert(rendered.includes("surface music_provider_queue_interaction_live_canary: `available`"));
  assert(rendered.includes("surface music_provider_queue_interaction_admission_gate: `available`"));
  assert(rendered.includes("surface music_sesh_control_post: `available`"));
  assert(rendered.includes("surface music_sesh_control_post_publish: `available`"));
  assert(rendered.includes("surface music_sesh_channel_target_status: `available`"));
  assert(rendered.includes("surface music_sesh_channel_target_env_contract: `available`"));
  assert(rendered.includes("surface music_sesh_button_router: `available`"));
  assert(rendered.includes("surface music_sesh_queue_conflict_host_controls: `available`"));
  assert(rendered.includes("surface music_sesh_host_control_live_storage_canary: `available`"));
  assert(rendered.includes("surface music_sesh_host_controls_persisted_state_dashboard: `available`"));
  assert(rendered.includes("surface music_sesh_host_control_live_apply_reconciliation: `available`"));
  assert(rendered.includes("surface music_sesh_host_control_live_apply_dashboard_rollup: `available`"));
  assert(rendered.includes("surface music_sesh_host_control_rollup_history_persistence: `available`"));
  assert(rendered.includes("surface music_sesh_host_control_history_trend_alerts: `available`"));
  assert(rendered.includes("surface music_sesh_host_control_trend_alert_routing: `available`"));
  assert(rendered.includes("surface music_sesh_host_control_trend_alert_delivery_canary: `available`"));
  assert(rendered.includes("surface testing_surface_provision: `available`"));
  assert(rendered.includes("surface board_lifecycle_event_ingest: `available`"));
  assert(rendered.includes("surface chat_command_intake: `available`"));
  assert(rendered.includes("surface chat_message_listener: `available`"));
  assert(rendered.includes("surface chat_message_live_ingest: `available`"));
  assert(rendered.includes("surface music_sesh_user_response_delivery_guard: `available`"));
  assert(rendered.includes("surface music_sesh_response_delivery_live_canary: `available`"));
  assert(rendered.includes("surface music_sesh_response_delivery_policy_dashboard: `available`"));
  assert(rendered.includes("surface music_sesh_response_delivery_channel_admission_gate: `available`"));
  assert(rendered.includes("surface music_sesh_response_delivery_non_testing_canary: `available`"));
  assert(rendered.includes("surface music_sesh_non_testing_response_live_readback: `available`"));
  assert(rendered.includes("surface music_sesh_response_delivery_rate_limit_policy: `available`"));
  assert(rendered.includes("surface music_sesh_response_delivery_rate_limit_enforcement: `available`"));
  assert(rendered.includes("surface music_sesh_response_delivery_rate_limit_observability: `available`"));
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
  assert(rendered.includes("surface music_sesh_live_status_response_readback: `available`"));
  assert(rendered.includes("surface music_sesh_button_chat_live_canary: `available`"));
  assert(rendered.includes("surface no_slash_workflow_surfaces: `available`"));
  assert(rendered.includes("surface signed_button_interaction_smoke: `available`"));
  assert(rendered.includes("surface signed_button_route_execution_smoke: `available`"));
  assert(rendered.includes("surface button_route_observability_audit: `available`"));
  assert(rendered.includes("surface button_route_audit_live_readback: `available`"));
  assert(rendered.includes("surface button_route_audit_dashboard: `available`"));
  assert(rendered.includes("surface button_route_audit_alerting: `available`"));
  assert(rendered.includes("surface button_route_audit_alert_delivery_canary: `available`"));
  assert(rendered.includes("surface button_route_audit_alert_target_readback: `available`"));
  assert(rendered.includes("surface button_route_audit_alert_runbook_linking: `available`"));
  assert(rendered.includes("surface button_route_audit_alert_acknowledgement_flow: `available`"));
  assert(rendered.includes("surface button_route_audit_acknowledgement_persistence: `available`"));
  assert(rendered.includes("surface button_route_audit_acknowledgement_readback: `available`"));
  assert(rendered.includes("surface interaction_handler_admission: `available`"));
  assert(rendered.includes("surface music_sesh_queue_replay_proof: `available`"));
  assert(rendered.includes("surface product_workflow_alert_delivery_canary: `available`"));
  assert(rendered.includes("surface music_sesh_feedback_board_live_sync: `available`"));
  assert(rendered.includes("surface board_lifecycle_readback_reconciliation: `available`"));
  assert(rendered.includes("surface board_reaction_lifecycle_sync: `available`"));
  assert(rendered.includes("surface board_lifecycle_reaction_drift_monitor: `available`"));
  assert(rendered.includes("surface board_reaction_drift_alerting: `available`"));
  assert(rendered.includes("surface board_reaction_auto_repair_canary: `available`"));
  assert(rendered.includes("surface board_reaction_auto_repair_live_apply_reconciliation: `available`"));
  assert(rendered.includes("surface board_reaction_repair_drift_scheduler: `available`"));
  assert(rendered.includes("surface board_reaction_scheduler_guarded_apply: `available`"));
  assert(rendered.includes("surface board_reaction_repair_scheduler_observability_rollup: `available`"));
  assert(rendered.includes("surface board_reaction_repair_scheduler_rollup_alerts: `available`"));
  assert(rendered.includes("surface board_reaction_repair_scheduler_alert_delivery_canary: `available`"));
  assert(rendered.includes("surface music_sesh_feature_card_forum_post: `available`"));
  assert(rendered.includes("surface music_sesh_feature_card_reactions: `available`"));
  assert(rendered.includes("surface board_moderation_post_button_conversion: `available`"));
  assert(!rendered.includes("bot-secret"));
});
