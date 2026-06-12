const { _internals: activationInternals } = require("./activation");
const { _internals: persistInternals } = require("./feedback-persist");
const { _internals: shadowInternals } = require("./feedback-shadow");

function getTransferProofConfig(env = process.env) {
  const activationStatus = activationInternals.getActivationGuardStatus(env);
  const writerConfig = persistInternals.getPersistedWriterConfig(env);
  const shadowTransferAllowed = activationStatus.trafficTransferMode === "shadow";
  const blockedReasons = [];

  if (!shadowTransferAllowed) {
    blockedReasons.push("traffic_transfer_mode_not_shadow");
  }

  if (!writerConfig.canAttemptPersistence) {
    blockedReasons.push(...writerConfig.blockedReasons);
  }

  return {
    activationStatus,
    writerConfig,
    shadowTransferAllowed,
    canAttemptShadowTransferProof: shadowTransferAllowed && writerConfig.canAttemptPersistence,
    blockedReasons: [...new Set(blockedReasons)],
  };
}

function parityChecksForRow(row) {
  return {
    reportIdentity: typeof row.report_id === "string" && row.report_id.startsWith("shadow-transfer-proof-"),
    lifecycleState: row.status === "new" && row.completion_review_status === "not_required",
    reporterReference: row.reporter_user_kind === "automation" || row.reporter_user_kind === "human",
    runtimeState: Array.isArray(row.runtime_warnings) && row.runtime_warnings.includes("discordos_shadow_transfer_proof_only"),
  };
}

async function persistProofRow(row, writerConfig) {
  if (writerConfig.serviceRoleConfigured) {
    return persistInternals.insertFeedbackReport(row, {
      supabaseUrl: process.env.DISCORDOS_SUPABASE_URL,
      serviceRoleKey: process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY,
    });
  }

  return persistInternals.invokeEdgePersistWriter(row, {
    supabaseUrl: process.env.DISCORDOS_SUPABASE_URL,
    anonKey: process.env.DISCORDOS_SUPABASE_ANON_KEY,
  });
}

module.exports = async function feedbackTransferProof(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  const parsed = await shadowInternals.readJsonBody(req);
  if (!parsed.ok) {
    return res.status(parsed.status).json({
      ok: false,
      error: parsed.error,
      persisted: false,
      shadowTrafficTransferProved: false,
      liveTrafficMoved: false,
    });
  }

  const normalized = shadowInternals.normalizeShadowFeedbackPayload(parsed.value, {
    runtimeWarnings: [
      "discordos_shadow_transfer_proof_only",
      "discordos_persisted_writer_no_live_cutover",
      "discordos_no_discord_write",
      "discordos_no_fitness_write",
    ],
  });
  if (!normalized.ok) {
    return res.status(400).json({
      ok: false,
      error: normalized.code,
      errors: normalized.errors,
      persisted: false,
      shadowTrafficTransferProved: false,
      liveTrafficMoved: false,
    });
  }

  if (!normalized.value.report_id.startsWith("shadow-transfer-proof-")) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_INPUT",
      errors: ["shadow_transfer_report_id_prefix_required"],
      persisted: false,
      shadowTrafficTransferProved: false,
      liveTrafficMoved: false,
    });
  }

  const config = getTransferProofConfig();
  if (!config.canAttemptShadowTransferProof) {
    return res.status(409).json({
      ok: false,
      service: "discordos-feedback-transfer-proof",
      error: "SHADOW_TRANSFER_PROOF_NOT_ENABLED",
      persisted: false,
      shadowTrafficTransferProved: false,
      shadowWorkflowParityProved: config.activationStatus.shadowWorkflowParityProved,
      liveWorkflowParityProved: false,
      liveTrafficMoved: false,
      rollbackExecutionProved: false,
      writerMode: config.activationStatus.writerMode,
      trafficTransferMode: config.activationStatus.trafficTransferMode,
      rollbackMode: config.activationStatus.rollbackMode,
      blockedReasons: config.blockedReasons,
      rowPreview: normalized.value,
      generatedAt: new Date().toISOString(),
    });
  }

  const persisted = await persistProofRow(normalized.value, config.writerConfig);
  if (!persisted.ok) {
    return res.status(502).json({
      ok: false,
      service: "discordos-feedback-transfer-proof",
      error: "PERSISTENCE_FAILED",
      persisted: false,
      shadowTrafficTransferProved: false,
      liveTrafficMoved: false,
      rollbackExecutionProved: false,
      persistenceRuntime: config.writerConfig.serviceRoleConfigured ? "vercel-env-service-role" : "supabase-edge-function",
      databaseStatus: persisted.status,
      databaseErrorCode: persisted.code,
      generatedAt: new Date().toISOString(),
    });
  }

  const row = config.writerConfig.serviceRoleConfigured ? persisted.row : persisted.payload.row;
  const parityChecks = parityChecksForRow(row);
  const shadowWorkflowParityProved = Object.values(parityChecks).every(Boolean);

  return res.status(201).json({
    ok: true,
    service: "discordos-feedback-transfer-proof",
    persisted: true,
    persistenceRuntime: config.writerConfig.serviceRoleConfigured ? "vercel-env-service-role" : "supabase-edge-function",
    writerMode: config.activationStatus.writerMode,
    trafficTransferMode: config.activationStatus.trafficTransferMode,
    rollbackMode: config.activationStatus.rollbackMode,
    shadowTrafficTransferProved: true,
    shadowWorkflowParityProved,
    liveWorkflowParityProved: false,
    liveTrafficMoved: false,
    writesDiscord: false,
    writesFitness: false,
    trafficMoved: false,
    rollbackExecutionProved: false,
    rollbackPosture: "fitness-primary-retained",
    parityChecks,
    row,
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  getTransferProofConfig,
  parityChecksForRow,
};
