const { _internals: activationInternals } = require("./activation");

const LIVE_TRANSFER_STATUS_FUNCTION = "discordos-live-transfer-status";

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanUrl(value) {
  return value.replace(/\/+$/, "");
}

function getLiveTransferStatusConfig(env = process.env) {
  const supabaseUrl = hasValue(env.DISCORDOS_SUPABASE_URL) ? cleanUrl(env.DISCORDOS_SUPABASE_URL.trim()) : null;
  const anonKey = hasValue(env.DISCORDOS_SUPABASE_ANON_KEY) ? env.DISCORDOS_SUPABASE_ANON_KEY.trim() : null;
  const blockedReasons = [];

  if (supabaseUrl === null) {
    blockedReasons.push("missing_supabase_url");
  }

  if (anonKey === null) {
    blockedReasons.push("missing_supabase_anon_key");
  }

  return {
    supabaseUrl,
    anonKey,
    edgeFunctionUrl: supabaseUrl === null ? null : `${supabaseUrl}/functions/v1/${LIVE_TRANSFER_STATUS_FUNCTION}`,
    canCheckLiveTransferStatus: supabaseUrl !== null && anonKey !== null,
    blockedReasons,
  };
}

async function invokeEdgeLiveTransferStatus({ supabaseUrl, anonKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${cleanUrl(supabaseUrl)}/functions/v1/${LIVE_TRANSFER_STATUS_FUNCTION}`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok !== true) {
    return {
      ok: false,
      status: response.status,
      code: typeof payload?.error === "string" ? payload.error : "EDGE_LIVE_TRANSFER_STATUS_FAILED",
      payload,
    };
  }

  return {
    ok: true,
    status: response.status,
    payload,
  };
}

module.exports = async function liveTransferStatus(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  const config = getLiveTransferStatusConfig();
  const activationStatus = activationInternals.getActivationGuardStatus();
  if (!config.canCheckLiveTransferStatus) {
    return res.status(409).json({
      ok: false,
      service: "discordos-live-transfer-status",
      error: "LIVE_TRANSFER_STATUS_NOT_CONFIGURED",
      blockedReasons: config.blockedReasons,
      activation: activationStatus,
      generatedAt: new Date().toISOString(),
    });
  }

  const status = await invokeEdgeLiveTransferStatus({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.anonKey,
  });

  if (!status.ok) {
    return res.status(502).json({
      ok: false,
      service: "discordos-live-transfer-status",
      error: "EDGE_LIVE_TRANSFER_STATUS_FAILED",
      edgeStatus: status.status,
      edgeErrorCode: status.code,
      activation: activationStatus,
      generatedAt: new Date().toISOString(),
    });
  }

  const liveSignedTransferReady = status.payload.liveSignedTransferReady === true;

  return res.status(200).json({
    ok: true,
    service: "discordos-live-transfer-status",
    runtime: "vercel-serverless-function",
    liveSignedTransferReady,
    liveWorkflowParityProved: activationStatus.liveWorkflowParityProved,
    liveTrafficProofIdPresent: activationStatus.liveTrafficProofIdPresent,
    rollbackExecutionProofIdPresent: activationStatus.rollbackExecutionProofIdPresent,
    writerActivationAllowed: activationStatus.writerActivationAllowed,
    liveCutover: activationStatus.liveCutover,
    fitnessTrafficMoved: activationStatus.fitnessTrafficMoved,
    activationBlockedReasons: activationStatus.blockedReasons,
    edge: status.payload,
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  LIVE_TRANSFER_STATUS_FUNCTION,
  getLiveTransferStatusConfig,
  invokeEdgeLiveTransferStatus,
};
