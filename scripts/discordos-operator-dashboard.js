const fs = require("node:fs");
const path = require("node:path");

const {
  _internals: nextWorkInternals,
} = require("./discordos-next-work-recommender");

const DEFAULT_OPS_DOCS_DIR = path.resolve(__dirname, "..", "docs", "ops");
const CLOSEOUT_RECEIPT_FILE_PATTERN = /closeout/i;
const HIGHEST_VALUE_CATEGORY_LIMIT = 10;
const HIGHEST_VALUE_LANE_PRIORITY = [
  { pattern: /^testing_surface_provision$/, score: 140 },
  { pattern: /^chat_command_intake$/, score: 135 },
  { pattern: /^chat_message_listener$/, score: 132 },
  { pattern: /^chat_message_live_ingest$/, score: 129 },
  { pattern: /^music_sesh_user_response_delivery_guard$/, score: 126 },
  { pattern: /^music_sesh_response_delivery_live_canary$/, score: 123 },
  { pattern: /^music_sesh_response_delivery_policy_dashboard$/, score: 120 },
  { pattern: /^music_sesh_response_delivery_channel_admission_gate$/, score: 117 },
  { pattern: /^music_sesh_response_delivery_non_testing_canary$/, score: 114 },
  { pattern: /^music_sesh_non_testing_response_live_readback$/, score: 111 },
  { pattern: /^music_sesh_response_delivery_rate_limit_/, score: 108 },
  { pattern: /^interaction_doctrine_status$/, score: 105 },
  { pattern: /^music_sesh_write_adapter_guard$/, score: 102 },
  { pattern: /^music_sesh_live_readback$/, score: 99 },
  { pattern: /^music_sesh_host_control_/, score: 92 },
  { pattern: /^music_provider_/, score: 88 },
  { pattern: /^button_route_/, score: 84 },
  { pattern: /^board_reaction_/, score: 80 },
  { pattern: /^board_/, score: 76 },
];

const HIGHEST_VALUE_CATEGORIES = [
  {
    id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
    label: "Music Sesh host-control delivery history",
    command: null,
    why: "After the host-control delivery dashboard, the next value is bounded repeated history for guarded route decisions.",
    does: "Tracks host-control alert delivery dashboard records while preserving route visibility and no-send/no-playback/no-provider boundaries.",
  },
  {
    id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
    label: "Music provider admission delivery readback",
    command: null,
    why: "After provider admission delivery canary, the next value is metadata-only readback for repeated signature-backed routing decisions.",
    does: "Reads back provider admission alert delivery decisions while preserving signature proof and no-provider/no-playback boundaries.",
  },
  {
    id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
    label: "Button acknowledgement delivery dashboard",
    command: null,
    why: "After acknowledgement delivery readback, the next value is a scan-ready summary of redacted repeated delivery decisions.",
    does: "Summarizes acknowledgement alert delivery readback while preserving actor/token redaction and avoiding Discord API sends.",
  },
  {
    id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
    label: "Music Sesh rate-limit delivery history alerting",
    command: null,
    why: "After bounded rate-limit delivery history, the next value is repeated-state classification for private delivery decisions.",
    does: "Classifies rate-limit alert delivery history while preserving hidden user content, mention safety, and no-send boundaries.",
  },
  {
    id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
    label: "Board scheduler delivery readback",
    command: null,
    why: "After board scheduler delivery canary, the next value is metadata-only readback for repeated guarded repair decisions.",
    does: "Reads back board scheduler alert delivery decisions while preserving custom-reaction guards and no-send behavior.",
  },
  {
    id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
    label: "Music Sesh host-control delivery history alerting",
    command: null,
    why: "After bounded host-control delivery history, the next value is repeated-state classification across guarded route decisions.",
    does: "Classifies host-control alert delivery history while preserving route visibility and no-send/no-playback/no-provider boundaries.",
  },
  {
    id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
    label: "Music provider admission delivery dashboard",
    command: null,
    why: "After provider admission delivery readback, the next value is a scan-ready summary of repeated metadata-only routing decisions.",
    does: "Summarizes provider admission alert delivery readback while preserving signature proof and no-provider/no-playback boundaries.",
  },
  {
    id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
    label: "Button acknowledgement delivery history",
    command: null,
    why: "After the acknowledgement delivery dashboard, the next value is bounded repeated history for redacted delivery decisions.",
    does: "Tracks acknowledgement alert delivery dashboard records while preserving actor/token redaction and avoiding Discord API sends.",
  },
  {
    id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
    label: "Music Sesh rate-limit delivery canary",
    command: null,
    why: "After rate-limit delivery history alerting, the next value is guarded admission proof for private repeated delivery decisions.",
    does: "Validates rate-limit alert delivery admission while preserving hidden user content, mention safety, and no-send boundaries.",
  },
  {
    id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
    label: "Board scheduler delivery dashboard",
    command: null,
    why: "After board scheduler delivery readback, the next value is a scan-ready summary of repeated guarded repair decisions.",
    does: "Summarizes board scheduler alert delivery readback while preserving custom-reaction guards and no-send behavior.",
  },
];

function parseArgs(args) {
  return nextWorkInternals.parseArgs(args);
}

function buildOperatorSummary(nextWork) {
  return {
    ok: nextWork.operatorStatus.ok,
    eventType: nextWork.operatorStatus.eventType,
    probeLive: nextWork.operatorStatus.probeLive,
    runtimeOk: nextWork.operatorStatus.runtimeOk,
    publicationOk: nextWork.operatorStatus.publicationOk,
    publicationAuditOk: nextWork.operatorStatus.publicationAuditOk,
    atlasHealthOk: nextWork.operatorStatus.atlasHealthOk,
    notificationPolicyOk: nextWork.operatorStatus.notificationPolicyOk,
  };
}

function buildCommandHint(recommendation) {
  if (!recommendation?.command) {
    return null;
  }

  return {
    id: recommendation.id,
    command: recommendation.command,
    reasonCodes: recommendation.reasonCodes,
  };
}

function buildHealthTiles(nextWork) {
  const operator = nextWork.operatorStatus;
  return [
    {
      id: "runtime",
      label: "Runtime",
      status: operator.runtimeOk ? "pass" : "fail",
    },
    {
      id: "publication",
      label: "Publication",
      status: operator.publicationOk ? "pass" : "fail",
    },
    {
      id: "publication_audit",
      label: "Publication audit",
      status: operator.publicationAuditOk ? "pass" : "fail",
    },
    {
      id: "atlas_health",
      label: "ATLAS health",
      status: operator.atlasHealthOk ? "pass" : "fail",
    },
    {
      id: "notification_policy",
      label: "Notification policy",
      status: operator.notificationPolicyOk ? "pass" : "fail",
    },
  ];
}

function groupRecommendationsByCategory(recommendations) {
  const groupsByCategory = new Map();

  for (const recommendation of Array.isArray(recommendations) ? recommendations : []) {
    const category = recommendation.category || "uncategorized";
    const group = groupsByCategory.get(category) || {
      category,
      count: 0,
      topRecommendationId: null,
      topScore: null,
      commands: [],
    };

    group.count += 1;
    if (group.topScore === null || recommendation.score > group.topScore) {
      group.topScore = recommendation.score;
      group.topRecommendationId = recommendation.id;
    }
    if (recommendation.command) {
      group.commands.push({
        id: recommendation.id,
        command: recommendation.command,
      });
    }
    groupsByCategory.set(category, group);
  }

  return [...groupsByCategory.values()].sort((left, right) => {
    if ((right.topScore ?? 0) !== (left.topScore ?? 0)) {
      return (right.topScore ?? 0) - (left.topScore ?? 0);
    }
    return left.category.localeCompare(right.category);
  });
}

function buildDashboardConsole(nextWork) {
  const healthTiles = buildHealthTiles(nextWork);
  const failingTileCount = healthTiles.filter((tile) => tile.status !== "pass").length;
  const groupedRecommendations = groupRecommendationsByCategory(nextWork.recommendations);

  return {
    statusLine: failingTileCount === 0
      ? "ready"
      : "action_required",
    healthTiles,
    failingTileCount,
    recommendationGroups: groupedRecommendations,
    primaryCommand: nextWork.topRecommendation?.command || null,
  };
}

function buildProductRuntimeTiles() {
  return [
    {
      id: "board_task_runtime",
      label: "Board task runtime",
      status: "available",
      command: "npm run ops:discordos:board-task-runtime",
    },
    {
      id: "board_shadow_persistence",
      label: "Board shadow persistence",
      status: "available",
      command: "npm run ops:discordos:board-card-shadow-persistence",
    },
    {
      id: "moderation_audit_shadow_persistence",
      label: "Moderation audit shadow persistence",
      status: "available",
      command: "npm run ops:discordos:moderation-audit-shadow-persistence",
    },
    {
      id: "board_feature_activation_pilot",
      label: "Board activation pilot",
      status: "available",
      command: "npm run ops:discordos:board-feature-activation-pilot",
    },
    {
      id: "board_active_admission_canary",
      label: "Board active canary",
      status: "available",
      command: "npm run ops:discordos:board-active-admission-canary",
    },
    {
      id: "board_active_write_adapter_guard",
      label: "Board write adapter guard",
      status: "available",
      command: "npm run ops:discordos:board-active-write-adapter-guard",
    },
    {
      id: "board_lifecycle_sync",
      label: "Board lifecycle sync",
      status: "available",
      command: "npm run ops:discordos:board-lifecycle-sync",
    },
    {
      id: "moderation_audit_write_adapter_guard",
      label: "Moderation audit write adapter guard",
      status: "available",
      command: "npm run ops:discordos:moderation-audit-write-adapter-guard",
    },
    {
      id: "moderation_audit_review_search",
      label: "Moderation audit review search",
      status: "available",
      command: "npm run ops:discordos:moderation-audit-review-search",
    },
    {
      id: "supabase_apply_readback_proof",
      label: "Supabase apply readback proof",
      status: "available",
      command: "npm run ops:discordos:supabase-apply-readback-proof",
    },
    {
      id: "product_workflow_live_readback",
      label: "Product workflow live readback",
      status: "available",
      command: "npm run ops:discordos:product-workflow-live-readback",
    },
    {
      id: "product_workflow_dashboard",
      label: "Product workflow dashboard",
      status: "available",
      command: "npm run ops:discordos:product-workflow-dashboard",
    },
    {
      id: "music_sesh_runtime",
      label: "Music Sesh runtime",
      status: "available",
      command: "npm run ops:discordos:music-sesh-runtime",
    },
    {
      id: "music_provider_adapter_admission_guard",
      label: "Music provider admission guard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-runtime -- --provider-action search --allow-provider-admission",
    },
    {
      id: "music_provider_metadata_contract",
      label: "Music provider metadata contract",
      status: "available",
      command: "npm run ops:discordos:music-provider-metadata-contract",
    },
    {
      id: "music_provider_metadata_live_canary",
      label: "Music provider metadata live canary",
      status: "available",
      command: "npm run ops:discordos:music-provider-metadata-live-canary",
    },
    {
      id: "music_provider_metadata_selection_preview",
      label: "Music provider metadata selection preview",
      status: "available",
      command: "npm run ops:discordos:music-provider-metadata-selection-preview",
    },
    {
      id: "music_provider_queue_selection_button_flow",
      label: "Music provider queue selection button flow",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-selection-button-flow",
    },
    {
      id: "music_provider_selection_to_queue_live_canary",
      label: "Music provider selection-to-queue live canary",
      status: "available",
      command: "npm run ops:discordos:music-provider-selection-to-queue-live-canary",
    },
    {
      id: "music_provider_queue_selection_user_button_surface",
      label: "Music provider queue selection user button surface",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-selection-user-button-surface",
    },
    {
      id: "music_provider_queue_surface_publish_readback",
      label: "Music provider queue surface publish readback",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-surface-publish-readback",
    },
    {
      id: "music_provider_queue_surface_interaction_readback",
      label: "Music provider queue surface interaction readback",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-surface-interaction-readback",
    },
    {
      id: "music_provider_queue_interaction_live_canary",
      label: "Music provider queue interaction live canary",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-live-canary",
    },
    {
      id: "music_provider_queue_interaction_admission_gate",
      label: "Music provider queue interaction admission gate",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-gate",
    },
    {
      id: "music_provider_queue_interaction_admission_readback",
      label: "Music provider queue interaction admission readback",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-readback",
    },
    {
      id: "music_provider_queue_interaction_admission_dashboard",
      label: "Music provider queue interaction admission dashboard",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-dashboard",
    },
    {
      id: "music_provider_queue_interaction_admission_history",
      label: "Music provider queue interaction admission history",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alerting",
      label: "Music provider queue interaction admission history alerting",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alerting",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_canary",
      label: "Music provider queue interaction admission history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-canary",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_readback",
      label: "Music provider queue interaction admission history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-readback",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_dashboard",
      label: "Music provider queue interaction admission history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-dashboard",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history",
      label: "Music provider queue interaction admission history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alerting",
      label: "Music provider queue interaction admission history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alerting",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_canary",
      label: "Music provider queue interaction admission history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_readback",
      label: "Music provider queue interaction admission history alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music provider queue interaction admission history alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history",
      label: "Music provider queue interaction admission history alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music provider queue interaction admission history alert delivery history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music provider queue interaction admission history alert delivery history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Music provider queue interaction admission history alert delivery history alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music provider queue interaction admission history alert delivery history alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Music provider queue interaction admission history alert delivery history alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music provider queue interaction admission history alert delivery history alert delivery history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music provider queue interaction admission history alert delivery history alert delivery history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_control_post",
      label: "Music Sesh control post",
      status: "available",
      command: "npm run ops:discordos:music-sesh-control-post",
    },
    {
      id: "music_sesh_control_post_publish",
      label: "Music Sesh control post publish",
      status: "available",
      command: "npm run ops:discordos:music-sesh-control-post-publish",
    },
    {
      id: "music_sesh_channel_target_status",
      label: "Music Sesh channel target",
      status: "available",
      command: "npm run ops:discordos:music-sesh-channel-target-status",
    },
    {
      id: "music_sesh_channel_target_env_contract",
      label: "Music Sesh channel env contract",
      status: "available",
      command: "npm run ops:discordos:music-sesh-channel-target-status -- --require-env",
    },
    {
      id: "music_sesh_button_router",
      label: "Music Sesh button router",
      status: "available",
      command: "npm run ops:discordos:music-sesh-button-router",
    },
    {
      id: "music_sesh_session_lifecycle_buttons",
      label: "Music Sesh session lifecycle buttons",
      status: "available",
      command: "npm run ops:discordos:music-sesh-session-lifecycle-buttons",
    },
    {
      id: "music_sesh_queue_conflict_host_controls",
      label: "Music Sesh queue conflict host controls",
      status: "available",
      command: "npm run ops:discordos:music-sesh-queue-conflict-host-controls",
    },
    {
      id: "music_sesh_host_control_live_storage_canary",
      label: "Music Sesh host control live storage canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-live-storage-canary",
    },
    {
      id: "music_sesh_host_controls_persisted_state_dashboard",
      label: "Music Sesh host controls persisted state dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-controls-persisted-state-dashboard",
    },
    {
      id: "music_sesh_host_control_live_apply_reconciliation",
      label: "Music Sesh host control live apply reconciliation",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-live-apply-reconciliation",
    },
    {
      id: "music_sesh_host_control_live_apply_dashboard_rollup",
      label: "Music Sesh host control live apply dashboard rollup",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-live-apply-dashboard-rollup",
    },
    {
      id: "music_sesh_host_control_rollup_history_persistence",
      label: "Music Sesh host control rollup history persistence",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-rollup-history-persistence",
    },
    {
      id: "music_sesh_host_control_history_trend_alerts",
      label: "Music Sesh host control history trend alerts",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-history-trend-alerts",
    },
    {
      id: "music_sesh_host_control_trend_alert_routing",
      label: "Music Sesh host control trend alert routing",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-routing",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_canary",
      label: "Music Sesh host control trend alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-canary",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_readback",
      label: "Music Sesh host control trend alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-readback",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_dashboard",
      label: "Music Sesh host control trend alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-dashboard",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_history",
      label: "Music Sesh host control trend alert delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-history",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_history_rollup",
      label: "Music Sesh host control trend alert delivery history rollup",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-history-rollup",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_history_rollup_dashboard",
      label: "Music Sesh host control trend alert delivery history rollup dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-history-rollup-dashboard",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history",
      label: "Music Sesh host control trend alert delivery rollup dashboard history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alerting",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alerting",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_canary",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_readback",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-readback",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-dashboard",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alerting",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alerting",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_canary",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_readback",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery history alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery history alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "testing_surface_provision",
      label: "Testing surface provision",
      status: "available",
      command: "npm run ops:discordos:testing-surface-provision",
    },
    {
      id: "board_lifecycle_event_ingest",
      label: "Board event ingest",
      status: "available",
      command: "npm run ops:discordos:board-lifecycle-event-ingest",
    },
    {
      id: "chat_command_intake",
      label: "Chat command intake",
      status: "available",
      command: "npm run ops:discordos:chat-command-intake",
    },
    {
      id: "chat_message_listener",
      label: "Chat message listener",
      status: "available",
      command: "npm run ops:discordos:chat-message-listener",
    },
    {
      id: "chat_message_live_ingest",
      label: "Chat message live ingest",
      status: "available",
      command: "npm run ops:discordos:chat-message-live-ingest",
    },
    {
      id: "music_sesh_user_response_delivery_guard",
      label: "Music Sesh user response delivery guard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-user-response-delivery-guard",
    },
    {
      id: "music_sesh_response_delivery_live_canary",
      label: "Music Sesh response delivery live canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-live-canary",
    },
    {
      id: "music_sesh_response_delivery_policy_dashboard",
      label: "Music Sesh response delivery policy dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-policy-dashboard",
    },
    {
      id: "music_sesh_response_delivery_channel_admission_gate",
      label: "Music Sesh response delivery channel admission gate",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-channel-admission-gate",
    },
    {
      id: "music_sesh_response_delivery_non_testing_canary",
      label: "Music Sesh response delivery non-testing canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-non-testing-canary",
    },
    {
      id: "music_sesh_non_testing_response_live_readback",
      label: "Music Sesh non-testing response live readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-non-testing-response-live-readback",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_policy",
      label: "Music Sesh response delivery rate-limit policy",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-policy",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_enforcement",
      label: "Music Sesh response delivery rate-limit enforcement",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-enforcement",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_observability",
      label: "Music Sesh response delivery rate-limit observability",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-observability",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alerting",
      label: "Music Sesh response delivery rate-limit alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alerting",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_canary",
      label: "Music Sesh response delivery rate-limit alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-canary",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_readback",
      label: "Music Sesh response delivery rate-limit alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-readback",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_dashboard",
      label: "Music Sesh response delivery rate-limit alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-dashboard",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history",
      label: "Music Sesh response delivery rate-limit alert delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alerting",
      label: "Music Sesh response delivery rate-limit alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alerting",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_canary",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_readback",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_dashboard",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "product_workflow_monitor",
      label: "Product workflow monitor",
      status: "available",
      command: "npm run ops:discordos:product-workflow-monitor",
    },
    {
      id: "operator_activation_runbook",
      label: "Operator activation runbook",
      status: "available",
      command: "npm run ops:discordos:operator-activation-runbook",
    },
    {
      id: "music_sesh_storage_contract",
      label: "Music Sesh storage contract",
      status: "available",
      command: "npm run ops:discordos:music-sesh-storage-contract",
    },
    {
      id: "interaction_doctrine_status",
      label: "Interaction doctrine status",
      status: "available",
      command: "npm run ops:discordos:interaction-doctrine-status",
    },
    {
      id: "discord_interaction_signature_preflight",
      label: "Discord interaction signature preflight",
      status: "available",
      command: "npm run ops:discordos:discord-interaction-signature-preflight",
    },
    {
      id: "moderation_audit_dashboard",
      label: "Moderation audit dashboard",
      status: "available",
      command: "npm run ops:discordos:moderation-audit-dashboard",
    },
    {
      id: "product_workflow_alert_drill",
      label: "Product workflow alert drill",
      status: "available",
      command: "npm run ops:discordos:product-workflow-alert-drill",
    },
    {
      id: "music_sesh_feature_activation_ratchet",
      label: "Music Sesh activation ratchet",
      status: "available",
      command: "npm run ops:discordos:music-sesh-feature-activation-ratchet",
    },
    {
      id: "music_sesh_feedback_board",
      label: "Music Sesh feedback board",
      status: "available",
      command: "npm run ops:discordos:music-sesh-feedback-board",
    },
    {
      id: "music_sesh_write_adapter_guard",
      label: "Music Sesh write adapter guard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-write-adapter-guard",
    },
    {
      id: "music_sesh_live_readback",
      label: "Music Sesh live readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-live-readback",
    },
    {
      id: "music_sesh_queue_status",
      label: "Music Sesh queue status",
      status: "available",
      command: "npm run ops:discordos:music-sesh-queue-status",
    },
    {
      id: "music_sesh_live_status_response_readback",
      label: "Music Sesh live status response readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-queue-status -- --live",
    },
    {
      id: "music_sesh_button_chat_live_canary",
      label: "Music Sesh button/chat live canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-button-chat-live-canary",
    },
    {
      id: "no_slash_workflow_surfaces",
      label: "No-slash workflow surfaces",
      status: "available",
      command: "npm run ops:discordos:no-slash-workflow-surfaces",
    },
    {
      id: "signed_button_interaction_smoke",
      label: "Signed button interaction smoke",
      status: "available",
      command: "npm run ops:discordos:signed-interaction-endpoint-smoke",
    },
    {
      id: "signed_button_route_execution_smoke",
      label: "Signed button route execution smoke",
      status: "available",
      command: "npm run ops:discordos:signed-interaction-endpoint-smoke -- --type MESSAGE_COMPONENT --execute-route",
    },
    {
      id: "button_route_observability_audit",
      label: "Button route observability audit",
      status: "available",
      command: "npm run ops:discordos:signed-interaction-endpoint-smoke -- --type MESSAGE_COMPONENT --execute-route",
    },
    {
      id: "button_route_audit_persistence",
      label: "Button route audit persistence",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-persistence",
    },
    {
      id: "button_route_audit_live_readback",
      label: "Button route audit live readback",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-live-readback",
    },
    {
      id: "button_route_audit_dashboard",
      label: "Button route audit dashboard",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-dashboard",
    },
    {
      id: "button_route_audit_alerting",
      label: "Button route audit alerting",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-alerting",
    },
    {
      id: "button_route_audit_alert_delivery_canary",
      label: "Button route audit alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-alert-delivery-canary",
    },
    {
      id: "button_route_audit_alert_target_readback",
      label: "Button route audit alert target readback",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-alert-target-readback",
    },
    {
      id: "button_route_audit_alert_runbook_linking",
      label: "Button route audit alert runbook linking",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-alert-runbook-linking",
    },
    {
      id: "button_route_audit_alert_acknowledgement_flow",
      label: "Button route audit alert acknowledgement flow",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-alert-acknowledgement-flow",
    },
    {
      id: "button_route_audit_acknowledgement_persistence",
      label: "Button route audit acknowledgement persistence",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-persistence",
    },
    {
      id: "button_route_audit_acknowledgement_readback",
      label: "Button route audit acknowledgement readback",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-readback",
    },
    {
      id: "button_route_audit_acknowledgement_readback_dashboard",
      label: "Button route audit acknowledgement readback dashboard",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-readback-dashboard",
    },
    {
      id: "button_route_audit_acknowledgement_dashboard_alert_history",
      label: "Button route audit acknowledgement dashboard alert history",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-dashboard-alert-history",
    },
    {
      id: "button_route_audit_acknowledgement_history_alerting",
      label: "Button route audit acknowledgement history alerting",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-history-alerting",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_canary",
      label: "Button route audit acknowledgement alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-canary",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_readback",
      label: "Button route audit acknowledgement alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-readback",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_dashboard",
      label: "Button route audit acknowledgement alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-dashboard",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history",
      label: "Button route audit acknowledgement alert delivery history",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alerting",
      label: "Button route audit acknowledgement alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alerting",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_canary",
      label: "Button route audit acknowledgement alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_readback",
      label: "Button route audit acknowledgement alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_dashboard",
      label: "Button route audit acknowledgement alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history",
      label: "Button route audit acknowledgement alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alerting",
      label: "Button route audit acknowledgement alert delivery history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Button route audit acknowledgement alert delivery history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Button route audit acknowledgement alert delivery history alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Button route audit acknowledgement alert delivery history alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Button route audit acknowledgement alert delivery history alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Button route audit acknowledgement alert delivery history alert delivery history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Button route audit acknowledgement alert delivery history alert delivery history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Button route audit acknowledgement alert delivery history alert delivery history alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "interaction_handler_admission",
      label: "Interaction handler admission",
      status: "available",
      command: "npm run ops:discordos:interaction-handler-admission",
    },
    {
      id: "music_sesh_queue_replay_proof",
      label: "Music Sesh queue replay proof",
      status: "available",
      command: "npm run ops:discordos:music-sesh-queue-replay-proof",
    },
    {
      id: "product_workflow_alert_delivery_canary",
      label: "Product workflow alert canary",
      status: "available",
      command: "npm run ops:discordos:product-workflow-alert-delivery-canary",
    },
    {
      id: "music_sesh_feedback_board_live_sync",
      label: "Music Sesh board live sync",
      status: "available",
      command: "npm run ops:discordos:music-sesh-feedback-board-live-sync",
    },
    {
      id: "board_lifecycle_readback_reconciliation",
      label: "Board lifecycle readback reconciliation",
      status: "available",
      command: "npm run ops:discordos:board-lifecycle-readback-reconciliation",
    },
    {
      id: "board_reaction_lifecycle_sync",
      label: "Board reaction lifecycle sync",
      status: "available",
      command: "npm run ops:discordos:board-reaction-lifecycle-sync",
    },
    {
      id: "board_lifecycle_reaction_drift_monitor",
      label: "Board lifecycle reaction drift monitor",
      status: "available",
      command: "npm run ops:discordos:board-lifecycle-reaction-drift-monitor",
    },
    {
      id: "board_reaction_drift_alerting",
      label: "Board reaction drift alerting",
      status: "available",
      command: "npm run ops:discordos:board-reaction-drift-alerting",
    },
    {
      id: "board_reaction_auto_repair_canary",
      label: "Board reaction auto-repair canary",
      status: "available",
      command: "npm run ops:discordos:board-reaction-auto-repair-canary",
    },
    {
      id: "board_reaction_auto_repair_live_apply_reconciliation",
      label: "Board reaction auto-repair live apply reconciliation",
      status: "available",
      command: "npm run ops:discordos:board-reaction-auto-repair-live-apply-reconciliation",
    },
    {
      id: "board_reaction_repair_drift_scheduler",
      label: "Board reaction repair drift scheduler",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-drift-scheduler",
    },
    {
      id: "board_reaction_scheduler_guarded_apply",
      label: "Board reaction scheduler guarded apply",
      status: "available",
      command: "npm run ops:discordos:board-reaction-scheduler-guarded-apply",
    },
    {
      id: "board_reaction_repair_scheduler_observability_rollup",
      label: "Board reaction repair scheduler observability rollup",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-observability-rollup",
    },
    {
      id: "board_reaction_repair_scheduler_rollup_alerts",
      label: "Board reaction repair scheduler rollup alerts",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-rollup-alerts",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_canary",
      label: "Board reaction repair scheduler alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-canary",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_readback",
      label: "Board reaction repair scheduler alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-readback",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_dashboard",
      label: "Board reaction repair scheduler alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-dashboard",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history",
      label: "Board reaction repair scheduler alert delivery history",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alerting",
      label: "Board reaction repair scheduler alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alerting",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_canary",
      label: "Board reaction repair scheduler alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_readback",
      label: "Board reaction repair scheduler alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_dashboard",
      label: "Board reaction repair scheduler alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history",
      label: "Board reaction repair scheduler alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alerting",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery history alert delivery readback",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery history alert delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery history alert delivery history",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery history alert delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery history alert delivery history alert delivery canary",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music Sesh host-control delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music provider admission delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Button acknowledgement delivery readback",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Music Sesh rate-limit delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Board scheduler delivery canary",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Music Sesh host-control deep delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music Sesh host-control deep delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Music provider deep delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music provider deep delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Button acknowledgement deep delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Button acknowledgement deep delivery history",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music Sesh rate-limit deep delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music Sesh rate-limit deep delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Board scheduler deep delivery readback",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Board scheduler deep delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music Sesh host-control deep delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Music Sesh host-control deep delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Music Sesh host-control delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Music provider deep delivery history",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Music provider admission delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music provider deep delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Button acknowledgement delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Button acknowledgement deep delivery alerting",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Button acknowledgement deep delivery canary",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music Sesh rate-limit delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Music Sesh rate-limit deep delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music Sesh rate-limit deep delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Board scheduler delivery readback",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Board scheduler deep delivery history",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Board scheduler deep delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music Sesh host-control delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music provider admission delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Button acknowledgement delivery history",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music Sesh rate-limit delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Board scheduler delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music Sesh host-control delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Music provider admission delivery history",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Button acknowledgement delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Music Sesh rate-limit delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Board scheduler delivery history",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Music Sesh host-control final delivery readback",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Music provider final delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Button acknowledgement final delivery canary",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music Sesh rate-limit final delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting",
      label: "Board scheduler final delivery history alerting",
      status: "available",
      command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting",
    },
    {
      id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard",
      label: "Music Sesh host-control final delivery dashboard",
      status: "available",
      command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard",
    },
    {
      id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
      label: "Music provider final delivery canary",
      status: "available",
      command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-canary",
    },
    {
      id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_readback",
      label: "Button acknowledgement final delivery readback",
      status: "available",
      command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-readback",
    },
    {
      id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history",
      label: "Music Sesh rate-limit final delivery history",
      status: "available",
      command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history",
    },
    {
      id: "music_sesh_feature_card_forum_post",
      label: "Music Sesh card forum post",
      status: "available",
      command: "npm run ops:discordos:music-sesh-feature-card-forum-post",
    },
    {
      id: "music_sesh_feature_card_reactions",
      label: "Music Sesh card reactions",
      status: "available",
      command: "npm run ops:discordos:music-sesh-feature-card-reactions",
    },
    {
      id: "board_moderation_post_button_conversion",
      label: "Board moderation post/button conversion",
      status: "available",
      command: "npm run ops:discordos:board-moderation-post-button-conversion",
    },
  ];
}

function loadCloseoutReceiptCorpus({
  opsDocsDir = DEFAULT_OPS_DOCS_DIR,
  fsImpl = fs,
} = {}) {
  const fileNames = fsImpl.readdirSync(opsDocsDir)
    .filter((name) => name.endsWith(".md") && CLOSEOUT_RECEIPT_FILE_PATTERN.test(name));

  return fileNames
    .map((name) => fsImpl.readFileSync(path.join(opsDocsDir, name), "utf8"))
    .join("\n");
}

function buildClosedProductRuntimeTileIdSet({
  tiles = buildProductRuntimeTiles(),
  closeoutCorpus = null,
  opsDocsDir = DEFAULT_OPS_DOCS_DIR,
  fsImpl = fs,
} = {}) {
  const corpus = typeof closeoutCorpus === "string"
    ? closeoutCorpus
    : loadCloseoutReceiptCorpus({ opsDocsDir, fsImpl });
  const closedTileIds = new Set();

  for (const tile of tiles) {
    const idDash = tile.id.replace(/_/g, "-");
    const matched = (tile.command && corpus.includes(`\`${tile.command}\``))
      || corpus.includes(`\`${idDash}\``)
      || corpus.includes(`\`${tile.id}\``);
    if (matched) {
      closedTileIds.add(tile.id);
    }
  }

  return closedTileIds;
}

function normalizeProductRuntimeTiles({
  tiles = buildProductRuntimeTiles(),
  closedTileIds = new Set(),
} = {}) {
  return tiles.map((tile) => ({
    ...tile,
    status: closedTileIds.has(tile.id) ? "completed" : tile.status,
  }));
}

function inferHighestValueBoundary(tile) {
  if (/^music_provider_/.test(tile.id)) {
    return "signature proof and no-provider/no-playback boundaries";
  }
  if (/^music_sesh_host_control_/.test(tile.id)) {
    return "route visibility and no-send/no-playback/no-provider boundaries";
  }
  if (/^button_route_/.test(tile.id)) {
    return "actor/token redaction and avoiding Discord API sends";
  }
  if (/rate_limit/.test(tile.id)) {
    return "hidden user content, mention safety, and no-send boundaries";
  }
  if (/^board_reaction_/.test(tile.id)) {
    return "custom-reaction guards and no-send behavior";
  }
  if (/^board_/.test(tile.id)) {
    return "guarded board state and no-send boundaries";
  }
  if (/^moderation_audit_/.test(tile.id)) {
    return "moderation audit visibility and no-send boundaries";
  }
  if (/^product_workflow_/.test(tile.id)) {
    return "workflow visibility and no-send boundaries";
  }
  if (/^music_sesh_/.test(tile.id)) {
    return "no-send/no-playback boundaries";
  }
  return "no-send boundaries";
}

function inferHighestValueStage(tile) {
  if (/canary/i.test(tile.label) || /_canary$/.test(tile.id)) {
    return "canary";
  }
  if (/readback/i.test(tile.label) || /_readback$/.test(tile.id)) {
    return "readback";
  }
  if (/dashboard/i.test(tile.label) || /_dashboard$/.test(tile.id)) {
    return "dashboard";
  }
  if (/alerting/i.test(tile.label) || /_alerting$/.test(tile.id)) {
    return "alerting";
  }
  if (/history/i.test(tile.label) || /_history$/.test(tile.id)) {
    return "history";
  }
  if (/sync/i.test(tile.label) || /_sync$/.test(tile.id)) {
    return "sync";
  }
  if (/guard/i.test(tile.label) || /_guard$/.test(tile.id)) {
    return "guard";
  }
  if (/status/i.test(tile.label) || /_status$/.test(tile.id)) {
    return "status";
  }
  if (/publish/i.test(tile.label) || /_publish$/.test(tile.id)) {
    return "publish";
  }
  return "runtime";
}

function countPatternOccurrences(value, pattern) {
  return String(value || "").match(pattern)?.length || 0;
}

function inferHighestValueLanePriority(tile) {
  for (const candidate of HIGHEST_VALUE_LANE_PRIORITY) {
    if (candidate.pattern.test(tile.id)) {
      return candidate.score;
    }
  }
  return 60;
}

function measureHighestValueTailPenalty(tile) {
  const id = String(tile.id || "");
  const penalties = [
    { pattern: /alert_delivery/g, weight: 35 },
    { pattern: /history/g, weight: 20 },
    { pattern: /dashboard/g, weight: 12 },
    { pattern: /readback/g, weight: 10 },
    { pattern: /alerting/g, weight: 8 },
    { pattern: /rollup/g, weight: 6 },
  ];

  return penalties.reduce((total, penalty) => {
    const occurrences = countPatternOccurrences(id, penalty.pattern);
    return total + (Math.max(0, occurrences - 1) * penalty.weight);
  }, 0);
}

function scoreHighestValueTile(tile, index = 0) {
  return inferHighestValueLanePriority(tile)
    - measureHighestValueTailPenalty(tile)
    - (index / 1000);
}

function rankHighestValueTiles(tiles = []) {
  return tiles
    .map((tile, index) => ({
      tile,
      index,
      score: scoreHighestValueTile(tile, index),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.tile);
}

function buildHighestValueCategoryNarrative(tile, previousTile = null) {
  const boundary = inferHighestValueBoundary(tile);
  const stage = inferHighestValueStage(tile);
  const previousLabel = previousTile ? previousTile.label.toLowerCase() : null;
  const scope = tile.label.charAt(0).toLowerCase() + tile.label.slice(1);
  const whyByStage = {
    runtime: `The next value is the baseline guarded runtime contract for ${scope}.`,
    guard: `Before wider live mutation or publication, the next value is a fail-closed boundary for ${scope}.`,
    status: `After the upstream setup work, the next value is operator-visible status for ${scope}.`,
    publish: `After the upstream contract and status work, the next value is guarded publication proof for ${scope}.`,
    sync: `After the write and readback surfaces, the next value is deterministic reconciliation for ${scope}.`,
    dashboard: `After ${previousLabel || "the upstream readback"}, the next value is a scan-ready summary for ${scope}.`,
    history: `After ${previousLabel || "the upstream dashboard"}, the next value is bounded repeated history for ${scope}.`,
    alerting: `After ${previousLabel || "bounded history"}, the next value is repeated-state classification for ${scope}.`,
    canary: `After ${previousLabel || "the upstream guard"}, the next value is guarded admission proof for ${scope}.`,
    readback: `After ${previousLabel || "the upstream canary"}, the next value is metadata-only readback for ${scope}.`,
  };
  const doesByStage = {
    runtime: `Defines ${scope} while preserving ${boundary}.`,
    guard: `Guards ${scope} while preserving ${boundary}.`,
    status: `Reports ${scope} while preserving ${boundary}.`,
    publish: `Publishes ${scope} while preserving ${boundary}.`,
    sync: `Reconciles ${scope} while preserving ${boundary}.`,
    dashboard: `Summarizes ${scope} while preserving ${boundary}.`,
    history: `Tracks ${scope} while preserving ${boundary}.`,
    alerting: `Classifies ${scope} while preserving ${boundary}.`,
    canary: `Validates ${scope} while preserving ${boundary}.`,
    readback: `Reads back ${scope} while preserving ${boundary}.`,
  };

  return {
    why: whyByStage[stage] || whyByStage.runtime,
    does: doesByStage[stage] || doesByStage.runtime,
  };
}

function buildProductRuntimePanel(options = {}) {
  const tiles = options.tiles || buildProductRuntimeTiles();
  const closedTileIds = options.closedTileIds || buildClosedProductRuntimeTileIdSet({
    tiles,
    closeoutCorpus: options.closeoutCorpus ?? null,
    opsDocsDir: options.opsDocsDir || DEFAULT_OPS_DOCS_DIR,
    fsImpl: options.fsImpl || fs,
  });
  const normalizedTiles = normalizeProductRuntimeTiles({
    tiles,
    closedTileIds,
  });

  return {
    surfaceCount: normalizedTiles.length,
    availableCount: normalizedTiles.filter((tile) => tile.status === "available").length,
    completedCount: normalizedTiles.filter((tile) => tile.status === "completed").length,
    tiles: normalizedTiles,
  };
}

function buildHighestValueCategories(options = {}) {
  const productRuntime = options.productRuntime || buildProductRuntimePanel(options);
  const openTiles = rankHighestValueTiles(
    productRuntime.tiles.filter((tile) => tile.status === "available")
  ).slice(0, options.limit || HIGHEST_VALUE_CATEGORY_LIMIT);

  return openTiles.map((tile, index) => ({
    rank: index + 1,
    id: tile.id,
    label: tile.label,
    command: tile.command,
    ...buildHighestValueCategoryNarrative(tile, index > 0 ? openTiles[index - 1] : null),
  }));
}

function classifyDashboardEvent(result) {
  return {
    type: result.operator.ok
      ? "discordos.operator.dashboard_ready"
      : "discordos.operator.dashboard_action_required",
    severity: result.operator.ok ? "info" : "warning",
    subject: "discordos.operator.dashboard",
    status: result.operator.ok ? "pass" : "fail",
    dimensions: {
      recommendationCount: result.nextWork.recommendationCount,
      topRecommendation: result.nextWork.topRecommendationId,
      operatorStatus: result.operator.ok ? "pass" : "fail",
    },
  };
}

async function buildDiscordOSOperatorDashboard(options = {}) {
  const nextWork = await nextWorkInternals.buildDiscordOSNextWorkRecommendations(options);
  const topRecommendation = nextWork.topRecommendation || null;
  const productRuntime = buildProductRuntimePanel();
  const highestValueCategories = buildHighestValueCategories({ productRuntime });
  const result = {
    ok: nextWork.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: nextWork.operatorStatus.ok ? "ready" : "action_required",
    operator: buildOperatorSummary(nextWork),
    nextWork: {
      status: nextWork.status,
      recommendationCount: nextWork.recommendations.length,
      topRecommendationId: topRecommendation?.id || "none",
      reasonCodes: nextWork.reasonCodes,
    },
    commandHint: buildCommandHint(topRecommendation),
    recommendations: nextWork.recommendations,
    highestValueCategories,
    console: buildDashboardConsole(nextWork),
    productRuntime,
    receiptState: nextWork.receiptState,
  };

  return {
    ...result,
    event: classifyDashboardEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Operator Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    "",
    "## Operator",
    "",
    `- result: \`${result.operator.ok ? "pass" : "fail"}\``,
    `- probe live: \`${result.operator.probeLive ? "true" : "false"}\``,
    `- runtime: \`${result.operator.runtimeOk ? "pass" : "fail"}\``,
    `- publication: \`${result.operator.publicationOk ? "pass" : "fail"}\``,
    `- publication audit: \`${result.operator.publicationAuditOk ? "pass" : "fail"}\``,
    `- ATLAS health: \`${result.operator.atlasHealthOk ? "pass" : "fail"}\``,
    `- notification policy: \`${result.operator.notificationPolicyOk ? "pass" : "fail"}\``,
    "",
    "## Next Work",
    "",
    `- recommendations: \`${result.nextWork.recommendationCount}\``,
    `- top recommendation: \`${result.nextWork.topRecommendationId}\``,
    `- reason codes: \`${result.nextWork.reasonCodes.join(",") || "none"}\``,
    `- command: \`${result.commandHint?.command || "none"}\``,
    `- highest value categories: \`${result.highestValueCategories.length}\``,
    "",
    "## Console",
    "",
    `- status line: \`${result.console.statusLine}\``,
    `- failing tiles: \`${result.console.failingTileCount}\``,
    `- primary command: \`${result.console.primaryCommand || "none"}\``,
    `- recommendation groups: \`${result.console.recommendationGroups.length}\``,
  ];

  for (const tile of result.console.healthTiles) {
    lines.push(`- tile ${tile.id}: \`${tile.status}\``);
  }

  for (const group of result.console.recommendationGroups) {
    lines.push(`- group ${group.category}: \`${group.count}\` top \`${group.topRecommendationId || "none"}\``);
  }

  for (const category of result.highestValueCategories) {
    lines.push(
      `- category ${category.rank}: \`${category.label}\`${category.command ? ` command \`${category.command}\`` : " command `projected`"}`
    );
    lines.push(`  - why: ${category.why}`);
    lines.push(`  - does: ${category.does}`);
  }

  lines.push(
    "",
    "## Product Runtime",
    "",
    `- surfaces: \`${result.productRuntime.surfaceCount}\``,
    `- available: \`${result.productRuntime.availableCount}\``,
    `- completed: \`${result.productRuntime.completedCount ?? 0}\``
  );

  for (const tile of result.productRuntime.tiles) {
    lines.push(`- surface ${tile.id}: \`${tile.status}\` command \`${tile.command}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordOSOperatorDashboard(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  _internals: {
    parseArgs,
    buildOperatorSummary,
    buildCommandHint,
    buildHealthTiles,
    groupRecommendationsByCategory,
    buildDashboardConsole,
    buildProductRuntimeTiles,
    loadCloseoutReceiptCorpus,
    buildClosedProductRuntimeTileIdSet,
    normalizeProductRuntimeTiles,
    inferHighestValueBoundary,
    inferHighestValueStage,
    countPatternOccurrences,
    inferHighestValueLanePriority,
    measureHighestValueTailPenalty,
    scoreHighestValueTile,
    rankHighestValueTiles,
    buildHighestValueCategoryNarrative,
    buildProductRuntimePanel,
    buildHighestValueCategories,
    classifyDashboardEvent,
    buildDiscordOSOperatorDashboard,
    renderMarkdown,
  },
};
