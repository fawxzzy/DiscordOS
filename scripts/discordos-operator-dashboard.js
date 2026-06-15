const {
  _internals: nextWorkInternals,
} = require("./discordos-next-work-recommender");

const HIGHEST_VALUE_CATEGORIES = [
  {
    id: "music_sesh_host_control_trend_alert_delivery_rollup_dashboard_history_alert_delivery_dashboard",
    label: "Music Sesh host control trend alert delivery rollup dashboard history alert delivery dashboard",
    command: "npm run ops:discordos:music-sesh-host-control-trend-alert-delivery-rollup-dashboard-history-alert-delivery-readback",
    why: "The host-control rollup dashboard history alert delivery readback now confirms guarded no-send decisions; the next value is a scan-ready dashboard for that path.",
    does: "Summarizes host-control rollup dashboard history alert delivery readback without sends, playback, or provider calls.",
  },
  {
    id: "music_provider_queue_interaction_admission_history_alert_delivery_history_alert_delivery_canary",
    label: "Music provider queue interaction admission history alert delivery history alert delivery canary",
    command: "npm run ops:discordos:music-provider-queue-interaction-admission-history-alert-delivery-history-alerting",
    why: "The provider alert delivery history alerting now classifies repeated metadata-only states; the next value is proving no-send alert delivery admission for that path.",
    does: "Canaries provider admission alert delivery history while preserving signature proof and no-provider/no-playback boundaries.",
  },
  {
    id: "button_route_audit_acknowledgement_alert_delivery_history_alert_delivery_readback",
    label: "Button route audit acknowledgement alert delivery history alert delivery readback",
    command: "npm run ops:discordos:button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-canary",
    why: "The acknowledgement alert delivery history canary now proves redacted no-send admission; the next value is readback for that path.",
    does: "Reads acknowledgement alert delivery history decisions while keeping actor/token data redacted and no-send.",
  },
  {
    id: "music_sesh_response_delivery_rate_limit_alert_delivery_history_alert_delivery_history",
    label: "Music Sesh response delivery rate-limit alert delivery history alert delivery history",
    command: "npm run ops:discordos:music-sesh-response-delivery-rate-limit-alert-delivery-history-alert-delivery-dashboard",
    why: "The rate-limit history alert delivery dashboard is now scan-ready; the next value is bounded history for those privacy-preserving dashboard states.",
    does: "Tracks rate-limit history alert delivery dashboard states while keeping user content hidden and avoiding Discord sends.",
  },
  {
    id: "board_reaction_repair_scheduler_alert_delivery_history_alert_delivery_history_alert_delivery_canary",
    label: "Board reaction repair scheduler alert delivery history alert delivery history alert delivery canary",
    command: "npm run ops:discordos:board-reaction-repair-scheduler-alert-delivery-history-alert-delivery-history-alerting",
    why: "The board scheduler history alert delivery history alerting now classifies guarded repeated states; the next value is proving no-send alert delivery admission for that path.",
    does: "Canaries board scheduler history alert delivery history while preserving custom-reaction guards and no-send behavior.",
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

function buildProductRuntimePanel() {
  const tiles = buildProductRuntimeTiles();

  return {
    surfaceCount: tiles.length,
    availableCount: tiles.filter((tile) => tile.status === "available").length,
    tiles,
  };
}

function buildHighestValueCategories() {
  return HIGHEST_VALUE_CATEGORIES.map((category, index) => ({
    rank: index + 1,
    ...category,
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
    highestValueCategories: buildHighestValueCategories(),
    console: buildDashboardConsole(nextWork),
    productRuntime: buildProductRuntimePanel(),
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
    lines.push(`- category ${category.rank}: \`${category.label}\` command \`${category.command}\``);
    lines.push(`  - why: ${category.why}`);
    lines.push(`  - does: ${category.does}`);
  }

  lines.push(
    "",
    "## Product Runtime",
    "",
    `- surfaces: \`${result.productRuntime.surfaceCount}\``,
    `- available: \`${result.productRuntime.availableCount}\``
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
    buildProductRuntimePanel,
    buildHighestValueCategories,
    classifyDashboardEvent,
    buildDiscordOSOperatorDashboard,
    renderMarkdown,
  },
};
