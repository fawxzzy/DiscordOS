const { _internals: activationInternals } = require("./activation");
const { _internals: persistInternals } = require("./feedback-persist");
const { _internals: liveTransferInternals } = require("./live-transfer-status");
const { _internals: readinessInternals } = require("./readiness");

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function stateFromBlockedReasons(blockedReasons) {
  return blockedReasons.length === 0 ? "ready" : "blocked";
}

function percentFromComponents(components) {
  const values = Object.values(components);
  if (values.length === 0) {
    return 0;
  }

  const readyCount = values.filter((component) => component.state === "ready").length;
  return Math.round((readyCount / values.length) * 100);
}

function buildRuntimeHealthSnapshot({
  env = process.env,
  edgeServiceRoleStatus,
  discordBotStatus,
} = {}) {
  const activationStatus = activationInternals.getActivationGuardStatus(env);
  const persistedWriterConfig = persistInternals.getPersistedWriterConfig(env);
  const liveTransferStatusConfig = liveTransferInternals.getLiveTransferStatusConfig(env);
  const directServiceRoleStatus = readinessInternals.getServiceRoleStatus(env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY);
  const serviceRoleConfigured = directServiceRoleStatus.configured || edgeServiceRoleStatus?.configured === true;

  const components = {
    supabaseProject: {
      state: env.DISCORDOS_SUPABASE_PROJECT_REF === readinessInternals.EXPECTED_SUPABASE_REF ? "ready" : "blocked",
      blockedReasons:
        env.DISCORDOS_SUPABASE_PROJECT_REF === readinessInternals.EXPECTED_SUPABASE_REF
          ? []
          : ["supabase_project_ref_not_configured"],
    },
    serviceRole: {
      state: serviceRoleConfigured ? "ready" : "blocked",
      runtime: directServiceRoleStatus.configured
        ? "vercel-env"
        : edgeServiceRoleStatus?.configured === true
          ? "supabase-edge-function"
          : "none",
      blockedReasons: serviceRoleConfigured
        ? []
        : unique([
            directServiceRoleStatus.reason,
            edgeServiceRoleStatus?.reason || "edge_service_role_not_verified",
          ]),
    },
    discordBot: {
      state: discordBotStatus?.configured === true ? "ready" : "blocked",
      blockedReasons: discordBotStatus?.configured === true ? [] : [discordBotStatus?.reason || "discord_bot_not_verified"],
    },
    activationGuard: {
      state: activationStatus.liveCutover ? "ready" : "blocked",
      blockedReasons: activationStatus.blockedReasons,
    },
    persistedWriter: {
      state: persistedWriterConfig.canAttemptPersistence ? "ready" : "blocked",
      blockedReasons: persistedWriterConfig.blockedReasons,
    },
    liveTransferStatus: {
      state: liveTransferStatusConfig.canCheckLiveTransferStatus ? "ready" : "blocked",
      blockedReasons: liveTransferStatusConfig.blockedReasons,
    },
  };
  const blockedReasons = unique(Object.values(components).flatMap((component) => component.blockedReasons));
  const readinessPercent = percentFromComponents(components);

  return {
    ok: blockedReasons.length === 0,
    service: "discordos-runtime-health",
    runtime: "vercel-serverless-function",
    posture: blockedReasons.length === 0 ? "operational" : "action_required",
    readinessPercent,
    components,
    activation: {
      writerMode: activationStatus.writerMode,
      trafficTransferMode: activationStatus.trafficTransferMode,
      rollbackMode: activationStatus.rollbackMode,
      writerActivationAllowed: activationStatus.writerActivationAllowed,
      liveCutover: activationStatus.liveCutover,
      fitnessTrafficMoved: activationStatus.fitnessTrafficMoved,
    },
    blockedReasons,
  };
}

module.exports = async function runtimeHealth(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  const configuredSupabaseUrl = process.env.DISCORDOS_SUPABASE_URL || null;
  const edgeServiceRoleStatus = await readinessInternals.getEdgeServiceRoleStatus({
    supabaseUrl: configuredSupabaseUrl,
    anonKey: process.env.DISCORDOS_SUPABASE_ANON_KEY,
  });
  const discordBotStatus = await readinessInternals.getDiscordBotStatus({
    token: process.env.DISCORDOS_BOT_TOKEN,
  });
  const snapshot = buildRuntimeHealthSnapshot({
    edgeServiceRoleStatus,
    discordBotStatus,
  });

  return res.status(snapshot.ok ? 200 : 409).json({
    ...snapshot,
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  buildRuntimeHealthSnapshot,
  percentFromComponents,
  stateFromBlockedReasons,
};
