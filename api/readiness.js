const EXPECTED_SUPABASE_REF = "nwexsktuuenfdegzrbut";
const SERVICE_ROLE = "service_role";
const EDGE_READINESS_FUNCTION = "discordos-readiness";

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function decodeBase64UrlJson(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function decodeJwtPayload(token) {
  if (!hasValue(token)) {
    return { ok: false, reason: "missing" };
  }

  const parts = token.split(".");
  if (parts.length !== 3 || !hasValue(parts[1])) {
    return { ok: false, reason: "malformed" };
  }

  try {
    return { ok: true, payload: decodeBase64UrlJson(parts[1]) };
  } catch {
    return { ok: false, reason: "unreadable_payload" };
  }
}

function getServiceRoleStatus(token) {
  const decoded = decodeJwtPayload(token);
  if (!decoded.ok) {
    return {
      present: hasValue(token),
      configured: false,
      roleMatches: false,
      projectRefMatches: false,
      reason: decoded.reason,
    };
  }

  const roleMatches = decoded.payload.role === SERVICE_ROLE;
  const projectRefMatches = decoded.payload.ref === EXPECTED_SUPABASE_REF;

  return {
    present: true,
    configured: roleMatches && projectRefMatches,
    roleMatches,
    projectRefMatches,
    reason: roleMatches && projectRefMatches ? "valid" : "metadata_mismatch",
  };
}

function edgeReadinessUrl(supabaseUrl) {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${EDGE_READINESS_FUNCTION}`;
}

async function getEdgeServiceRoleStatus({ supabaseUrl, anonKey, fetchImpl = fetch }) {
  if (!hasValue(supabaseUrl) || !hasValue(anonKey)) {
    return {
      configured: false,
      reachable: false,
      keyPresent: false,
      probeOk: false,
      reason: "missing_edge_probe_config",
    };
  }

  try {
    const response = await fetchImpl(edgeReadinessUrl(supabaseUrl), {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    const payload = await response.json().catch(() => null);
    const projectRefMatches = payload?.supabaseProjectRef === EXPECTED_SUPABASE_REF;
    const probeOk = payload?.serviceRoleProbeOk === true;

    return {
      configured: response.ok && projectRefMatches && probeOk,
      reachable: response.ok,
      keyPresent: payload?.serviceRoleKeyPresent === true,
      probeOk,
      projectRefMatches,
      status: response.status,
      reason: response.ok
        ? payload?.serviceRoleProbeReason || (probeOk ? "edge_service_role_probe_ok" : "edge_service_role_probe_failed")
        : "edge_readiness_unreachable",
    };
  } catch {
    return {
      configured: false,
      reachable: false,
      keyPresent: false,
      probeOk: false,
      reason: "edge_readiness_fetch_failed",
    };
  }
}

module.exports = async function readiness(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  const configuredProjectRef = process.env.DISCORDOS_SUPABASE_PROJECT_REF || null;
  const configuredSupabaseUrl = process.env.DISCORDOS_SUPABASE_URL || null;
  const serviceRoleStatus = getServiceRoleStatus(process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY);
  const edgeServiceRoleStatus = await getEdgeServiceRoleStatus({
    supabaseUrl: configuredSupabaseUrl,
    anonKey: process.env.DISCORDOS_SUPABASE_ANON_KEY,
  });
  const serviceRoleConfigured = serviceRoleStatus.configured || edgeServiceRoleStatus.configured;

  return res.status(200).json({
    ok: true,
    service: "discordos-readiness",
    runtime: "vercel-serverless-function",
    supabaseProjectRefConfigured: configuredProjectRef === EXPECTED_SUPABASE_REF,
    supabaseUrlConfigured: hasValue(configuredSupabaseUrl),
    serviceRoleConfigured,
    serviceRoleRuntime: serviceRoleStatus.configured
      ? "vercel-env"
      : edgeServiceRoleStatus.configured
        ? "supabase-edge-function"
        : "none",
    serviceRolePresent: serviceRoleStatus.present,
    serviceRoleRoleMatches: serviceRoleStatus.roleMatches,
    serviceRoleProjectRefMatches: serviceRoleStatus.projectRefMatches,
    serviceRoleReason: serviceRoleStatus.reason,
    edgeServiceRoleConfigured: edgeServiceRoleStatus.configured,
    edgeServiceRoleReachable: edgeServiceRoleStatus.reachable,
    edgeServiceRoleKeyPresent: edgeServiceRoleStatus.keyPresent,
    edgeServiceRoleProbeOk: edgeServiceRoleStatus.probeOk,
    edgeServiceRoleProjectRefMatches: edgeServiceRoleStatus.projectRefMatches || false,
    edgeServiceRoleReason: edgeServiceRoleStatus.reason,
    discordBotTokenConfigured: hasValue(process.env.DISCORDOS_BOT_TOKEN),
    liveCutover: false,
    fitnessTrafficMoved: false,
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  EXPECTED_SUPABASE_REF,
  SERVICE_ROLE,
  decodeJwtPayload,
  getServiceRoleStatus,
  getEdgeServiceRoleStatus,
};
