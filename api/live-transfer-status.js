const { _internals: activationInternals } = require("./activation");
const {
  buildSupabaseElevatedHeaders,
  buildSupabasePublicHeaders,
} = require("../scripts/supabase-api-key-headers");

const LIVE_TRANSFER_STATUS_FUNCTION = "discordos-live-transfer-status";
const LIVE_TRANSFER_STATUS_RPC = "discordos_get_live_transfer_status";
const LEGACY_SUPABASE_REF = "nwexsktuuenfdegzrbut";
const MASTER_SUPABASE_REF = "bxtcuhkotumitoqtrcej";

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanUrl(value) {
  return value.replace(/\/+$/, "");
}

function getLiveTransferStatusConfig(env = process.env) {
  const supabaseUrl = hasValue(env.DISCORDOS_SUPABASE_URL) ? cleanUrl(env.DISCORDOS_SUPABASE_URL.trim()) : null;
  const projectRef = hasValue(env.DISCORDOS_SUPABASE_PROJECT_REF) ? env.DISCORDOS_SUPABASE_PROJECT_REF.trim() : null;
  const serviceRoleKey = hasValue(env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY)
    ? env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY.trim()
    : null;
  const anonKey = hasValue(env.DISCORDOS_SUPABASE_ANON_KEY) ? env.DISCORDOS_SUPABASE_ANON_KEY.trim() : null;
  const blockedReasons = [];

  if (supabaseUrl === null) {
    blockedReasons.push("missing_supabase_url");
  }

  if (projectRef === null) {
    blockedReasons.push("missing_supabase_project_ref");
  }

  const expectedUrl = projectRef === null ? null : `https://${projectRef}.supabase.co`;
  const projectBindingMatches = supabaseUrl !== null && expectedUrl !== null && supabaseUrl === expectedUrl;
  if (supabaseUrl !== null && projectRef !== null && !projectBindingMatches) {
    blockedReasons.push("supabase_project_binding_mismatch");
  }

  const masterBound = projectRef === MASTER_SUPABASE_REF && projectBindingMatches;
  const legacyBound = projectRef === LEGACY_SUPABASE_REF && projectBindingMatches;
  const directRpcAvailable = (masterBound || legacyBound) && serviceRoleKey !== null;
  const edgeFallbackAvailable = legacyBound && anonKey !== null;
  const transport = directRpcAvailable
    ? "direct_service_role_rpc"
    : edgeFallbackAvailable
      ? "legacy_edge_fallback"
      : "none";

  if (masterBound && serviceRoleKey === null) {
    blockedReasons.push("master_direct_service_role_required");
  } else if (!directRpcAvailable && !edgeFallbackAvailable && supabaseUrl !== null && projectRef !== null && projectBindingMatches) {
    blockedReasons.push("missing_live_transfer_status_credential");
  }

  return {
    supabaseUrl,
    projectRef,
    serviceRoleKey,
    anonKey,
    masterBound,
    legacyBound,
    projectBindingMatches,
    transport,
    directRpcUrl: supabaseUrl === null ? null : `${supabaseUrl}/rest/v1/rpc/${LIVE_TRANSFER_STATUS_RPC}`,
    edgeFunctionUrl: supabaseUrl === null ? null : `${supabaseUrl}/functions/v1/${LIVE_TRANSFER_STATUS_FUNCTION}`,
    canCheckLiveTransferStatus: blockedReasons.length === 0 && transport !== "none",
    blockedReasons,
  };
}

async function invokeDirectLiveTransferStatus({ supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${cleanUrl(supabaseUrl)}/rest/v1/rpc/${LIVE_TRANSFER_STATUS_RPC}`, {
    method: "POST",
    headers: {
      ...buildSupabaseElevatedHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{}",
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      status: response.status,
      code: typeof payload?.code === "string" ? payload.code : "DIRECT_LIVE_TRANSFER_STATUS_FAILED",
      transport: "direct_service_role_rpc",
    };
  }

  return {
    ok: true,
    status: response.status,
    payload,
    transport: "direct_service_role_rpc",
  };
}

async function invokeEdgeLiveTransferStatus({ supabaseUrl, anonKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${cleanUrl(supabaseUrl)}/functions/v1/${LIVE_TRANSFER_STATUS_FUNCTION}`, {
    method: "GET",
    headers: {
      ...buildSupabasePublicHeaders(anonKey),
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
    transport: "legacy_edge_fallback",
  };
}

async function invokeLiveTransferStatus(config, { fetchImpl = fetch } = {}) {
  if (!config?.canCheckLiveTransferStatus) {
    return {
      ok: false,
      status: null,
      code: "LIVE_TRANSFER_STATUS_NOT_CONFIGURED",
      transport: config?.transport || "none",
    };
  }

  try {
    if (config.transport === "direct_service_role_rpc") {
      return await invokeDirectLiveTransferStatus({
        supabaseUrl: config.supabaseUrl,
        serviceRoleKey: config.serviceRoleKey,
        fetchImpl,
      });
    }

    return await invokeEdgeLiveTransferStatus({
      supabaseUrl: config.supabaseUrl,
      anonKey: config.anonKey,
      fetchImpl,
    });
  } catch {
    return {
      ok: false,
      status: null,
      code: "LIVE_TRANSFER_STATUS_TRANSPORT_FAILED",
      transport: config.transport,
    };
  }
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

  const status = await invokeLiveTransferStatus(config);

  if (!status.ok) {
    return res.status(502).json({
      ok: false,
      service: "discordos-live-transfer-status",
      error: "LIVE_TRANSFER_STATUS_PROBE_FAILED",
      databaseStatus: status.status,
      databaseErrorCode: status.code,
      statusRuntime: status.transport,
      activation: activationStatus,
      generatedAt: new Date().toISOString(),
    });
  }

  const liveSignedTransferReady = status.payload.liveSignedTransferReady === true;

  return res.status(200).json({
    ok: true,
    service: "discordos-live-transfer-status",
    runtime: "vercel-serverless-function",
    statusRuntime: status.transport,
    liveSignedTransferReady,
    liveWorkflowParityProved: activationStatus.liveWorkflowParityProved,
    liveTrafficProofIdPresent: activationStatus.liveTrafficProofIdPresent,
    rollbackExecutionProofIdPresent: activationStatus.rollbackExecutionProofIdPresent,
    writerActivationAllowed: activationStatus.writerActivationAllowed,
    liveCutover: activationStatus.liveCutover,
    fitnessTrafficMoved: activationStatus.fitnessTrafficMoved,
    activationBlockedReasons: activationStatus.blockedReasons,
    status: status.payload,
    edge: status.transport === "legacy_edge_fallback" ? status.payload : null,
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  LIVE_TRANSFER_STATUS_FUNCTION,
  LIVE_TRANSFER_STATUS_RPC,
  LEGACY_SUPABASE_REF,
  MASTER_SUPABASE_REF,
  getLiveTransferStatusConfig,
  invokeDirectLiveTransferStatus,
  invokeEdgeLiveTransferStatus,
  invokeLiveTransferStatus,
};
