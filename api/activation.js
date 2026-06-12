const WRITER_MODES = new Set(["disabled", "shadow", "active"]);
const TRAFFIC_TRANSFER_MODES = new Set(["none", "shadow", "active"]);
const ROLLBACK_MODES = new Set(["fitness-primary", "discordos-primary-with-fitness-rollback"]);

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeMode(value, { allowed, fallback, invalidReason, blockedReasons }) {
  if (!hasValue(value)) {
    return fallback;
  }

  const normalized = value.trim();
  if (!allowed.has(normalized)) {
    blockedReasons.push(invalidReason);
    return fallback;
  }

  return normalized;
}

function getActivationGuardStatus(env = process.env) {
  const blockedReasons = [];
  const writerMode = normalizeMode(env.DISCORDOS_WRITER_MODE, {
    allowed: WRITER_MODES,
    fallback: "disabled",
    invalidReason: "invalid_writer_mode",
    blockedReasons,
  });
  const trafficTransferMode = normalizeMode(env.DISCORDOS_TRAFFIC_TRANSFER_MODE, {
    allowed: TRAFFIC_TRANSFER_MODES,
    fallback: "none",
    invalidReason: "invalid_traffic_transfer_mode",
    blockedReasons,
  });
  const rollbackMode = normalizeMode(env.DISCORDOS_ROLLBACK_MODE, {
    allowed: ROLLBACK_MODES,
    fallback: "fitness-primary",
    invalidReason: "invalid_rollback_mode",
    blockedReasons,
  });
  const parityProofId = hasValue(env.DISCORDOS_LIVE_PARITY_PROOF_ID)
    ? env.DISCORDOS_LIVE_PARITY_PROOF_ID.trim()
    : null;
  const shadowParityProofId = hasValue(env.DISCORDOS_SHADOW_PARITY_PROOF_ID)
    ? env.DISCORDOS_SHADOW_PARITY_PROOF_ID.trim()
    : null;
  const liveTrafficProofId = hasValue(env.DISCORDOS_LIVE_TRAFFIC_PROOF_ID)
    ? env.DISCORDOS_LIVE_TRAFFIC_PROOF_ID.trim()
    : null;
  const rollbackExecutionProofId = hasValue(env.DISCORDOS_ROLLBACK_EXECUTION_PROOF_ID)
    ? env.DISCORDOS_ROLLBACK_EXECUTION_PROOF_ID.trim()
    : null;

  if (writerMode !== "active") {
    blockedReasons.push("writer_mode_not_active");
  }

  if (trafficTransferMode !== "active") {
    blockedReasons.push("traffic_transfer_not_active");
  }

  if (rollbackMode !== "discordos-primary-with-fitness-rollback") {
    blockedReasons.push("rollback_mode_not_cutover_ready");
  }

  if (parityProofId === null) {
    blockedReasons.push("missing_live_workflow_parity_proof");
  }

  if (liveTrafficProofId === null) {
    blockedReasons.push("missing_live_traffic_transfer_proof");
  }

  if (rollbackExecutionProofId === null) {
    blockedReasons.push("missing_rollback_execution_proof");
  }

  const liveCutover =
    writerMode === "active" &&
    trafficTransferMode === "active" &&
    rollbackMode === "discordos-primary-with-fitness-rollback" &&
    parityProofId !== null &&
    liveTrafficProofId !== null &&
    rollbackExecutionProofId !== null &&
    blockedReasons.length === 0;

  return {
    writerMode,
    trafficTransferMode,
    rollbackMode,
    shadowWorkflowParityProved: shadowParityProofId !== null,
    liveWorkflowParityProved: liveCutover,
    liveParityProofIdPresent: parityProofId !== null,
    liveTrafficProofIdPresent: liveTrafficProofId !== null,
    rollbackExecutionProofIdPresent: rollbackExecutionProofId !== null,
    writerActivationAllowed: liveCutover,
    liveCutover,
    fitnessTrafficMoved: liveCutover,
    blockedReasons: [...new Set(blockedReasons)],
  };
}

module.exports = function activation(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  return res.status(200).json({
    ok: true,
    service: "discordos-activation-guard",
    runtime: "vercel-serverless-function",
    ...getActivationGuardStatus(),
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  getActivationGuardStatus,
};
