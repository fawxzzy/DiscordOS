const EXPECTED_SUPABASE_REF = "nwexsktuuenfdegzrbut";
const MASTER_SUPABASE_REF = "bxtcuhkotumitoqtrcej";
const SERVICE_ROLE = "service_role";
const EDGE_READINESS_FUNCTION = "discordos-readiness";
const DISCORD_API_BASE = "https://discord.com/api/v10";
const { _internals: activationInternals } = require("./activation");
const {
  buildSupabaseElevatedHeaders,
  buildSupabasePublicHeaders,
  isModernSupabasePublishableKey,
  isModernSupabaseSecretKey,
} = require("../scripts/supabase-api-key-headers");

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

function getServiceRoleStatus(token, expectedProjectRef = EXPECTED_SUPABASE_REF) {
  if (isModernSupabaseSecretKey(token)) {
    return {
      present: true,
      configured: false,
      roleMatches: true,
      projectRefMatches: false,
      reason: "modern_secret_requires_live_probe",
    };
  }
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
  const projectRefMatches = decoded.payload.ref === expectedProjectRef;

  return {
    present: true,
    configured: roleMatches && projectRefMatches,
    roleMatches,
    projectRefMatches,
    reason: roleMatches && projectRefMatches ? "valid" : "metadata_mismatch",
  };
}

function isAllowedSupabaseProjectRef(value) {
  return value === EXPECTED_SUPABASE_REF || value === MASTER_SUPABASE_REF;
}

function getPublicKeyStatus(token, projectRef) {
  if (isModernSupabasePublishableKey(token)) {
    const projectRefMatches = projectRef === MASTER_SUPABASE_REF;
    return {
      configured: projectRefMatches,
      keyClass: "modern_publishable",
      projectRefMatches,
      reason: projectRefMatches ? "valid" : "public_key_binding_mismatch",
    };
  }
  if (isModernSupabaseSecretKey(token)) {
    return { configured: false, keyClass: "modern_secret", projectRefMatches: false, reason: "public_key_class_mismatch" };
  }
  const decoded = decodeJwtPayload(token);
  if (!decoded.ok) {
    return { configured: false, keyClass: "invalid", projectRefMatches: false, reason: decoded.reason };
  }
  const roleMatches = decoded.payload.role === "anon";
  const projectRefMatches = projectRef === EXPECTED_SUPABASE_REF && decoded.payload.ref === EXPECTED_SUPABASE_REF;
  return {
    configured: roleMatches && projectRefMatches,
    keyClass: roleMatches ? "legacy_anon" : "legacy_wrong_role",
    projectRefMatches,
    reason: roleMatches && projectRefMatches ? "valid" : "public_key_binding_mismatch",
  };
}

async function getDirectServiceRoleStatus({ supabaseUrl, projectRef, serviceRoleKey, fetchImpl = fetch }) {
  if (!hasValue(supabaseUrl) || !hasValue(projectRef) || !hasValue(serviceRoleKey)) {
    return { configured: false, reachable: false, probeOk: false, reason: "missing_direct_probe_config" };
  }
  const expectedUrl = `https://${projectRef}.supabase.co`;
  if (supabaseUrl.replace(/\/+$/, "") !== expectedUrl) {
    return { configured: false, reachable: false, probeOk: false, reason: "direct_probe_project_binding_mismatch" };
  }
  const modernSecret = isModernSupabaseSecretKey(serviceRoleKey);
  const legacyServiceRole = getServiceRoleStatus(serviceRoleKey, EXPECTED_SUPABASE_REF);
  const credentialBindingMatches = modernSecret
    ? projectRef === MASTER_SUPABASE_REF
    : projectRef === EXPECTED_SUPABASE_REF && legacyServiceRole.configured;
  if (!credentialBindingMatches) {
    return { configured: false, reachable: false, probeOk: false, reason: "direct_probe_credential_binding_mismatch" };
  }
  try {
    const response = await fetchImpl(`${expectedUrl}/rest/v1/`, {
      method: "GET",
      headers: { ...buildSupabaseElevatedHeaders(serviceRoleKey), Accept: "application/openapi+json" },
    });
    return {
      configured: response.ok,
      reachable: true,
      probeOk: response.ok,
      status: response.status,
      reason: response.ok ? "direct_service_key_probe_ok" : "direct_service_key_probe_rejected",
    };
  } catch {
    return { configured: false, reachable: false, probeOk: false, reason: "direct_service_key_probe_failed" };
  }
}

function edgeReadinessUrl(supabaseUrl) {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${EDGE_READINESS_FUNCTION}`;
}

async function getEdgeServiceRoleStatus({ supabaseUrl, projectRef, anonKey, fetchImpl = fetch }) {
  if (!hasValue(supabaseUrl) || !hasValue(projectRef) || !hasValue(anonKey)) {
    return {
      configured: false,
      reachable: false,
      keyPresent: false,
      probeOk: false,
      reason: "missing_edge_probe_config",
    };
  }

  const expectedUrl = `https://${projectRef}.supabase.co`;
  if (!isAllowedSupabaseProjectRef(projectRef) || supabaseUrl.replace(/\/+$/, "") !== expectedUrl) {
    return {
      configured: false,
      reachable: false,
      keyPresent: false,
      probeOk: false,
      projectRefMatches: false,
      reason: "edge_probe_project_binding_mismatch",
    };
  }
  const publicKeyStatus = getPublicKeyStatus(anonKey, projectRef);
  if (!publicKeyStatus.configured) {
    return {
      configured: false,
      reachable: false,
      keyPresent: true,
      probeOk: false,
      projectRefMatches: publicKeyStatus.projectRefMatches,
      reason: "edge_probe_credential_binding_mismatch",
    };
  }

  try {
    const response = await fetchImpl(edgeReadinessUrl(expectedUrl), {
      method: "GET",
      headers: buildSupabasePublicHeaders(anonKey),
    });
    const payload = await response.json().catch(() => null);
    const projectRefMatches = payload?.supabaseProjectRef === projectRef;
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

async function getDiscordBotStatus({ token, fetchImpl = fetch }) {
  if (!hasValue(token)) {
    return {
      configured: false,
      reachable: false,
      tokenPresent: false,
      botUserOk: false,
      reason: "missing_bot_token",
    };
  }

  try {
    const response = await fetchImpl(`${DISCORD_API_BASE}/users/@me`, {
      method: "GET",
      headers: {
        Authorization: `Bot ${token}`,
      },
    });
    const payload = await response.json().catch(() => null);
    const botUserOk = payload?.bot === true;

    return {
      configured: response.ok && botUserOk,
      reachable: response.ok,
      tokenPresent: true,
      botUserOk,
      status: response.status,
      reason: response.ok && botUserOk ? "discord_bot_user_ok" : "discord_bot_token_invalid",
    };
  } catch {
    return {
      configured: false,
      reachable: false,
      tokenPresent: true,
      botUserOk: false,
      reason: "discord_bot_fetch_failed",
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
  const serviceRoleKey = process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY;
  const serviceRoleStatus = getServiceRoleStatus(serviceRoleKey, configuredProjectRef || EXPECTED_SUPABASE_REF);
  const directServiceRoleStatus = await getDirectServiceRoleStatus({
    supabaseUrl: configuredSupabaseUrl,
    projectRef: configuredProjectRef,
    serviceRoleKey,
  });
  const edgeServiceRoleStatus = await getEdgeServiceRoleStatus({
    supabaseUrl: configuredSupabaseUrl,
    projectRef: configuredProjectRef,
    anonKey: process.env.DISCORDOS_SUPABASE_ANON_KEY,
  });
  const discordBotStatus = await getDiscordBotStatus({
    token: process.env.DISCORDOS_BOT_TOKEN,
  });
  const activationGuardStatus = activationInternals.getActivationGuardStatus();
  const serviceRoleConfigured = directServiceRoleStatus.configured || edgeServiceRoleStatus.configured;

  return res.status(200).json({
    ok: true,
    service: "discordos-readiness",
    runtime: "vercel-serverless-function",
    supabaseProjectRefConfigured: isAllowedSupabaseProjectRef(configuredProjectRef),
    supabaseUrlConfigured: hasValue(configuredSupabaseUrl),
    serviceRoleConfigured,
    serviceRoleRuntime: directServiceRoleStatus.configured
      ? "vercel-env"
      : edgeServiceRoleStatus.configured
        ? "supabase-edge-function"
        : "none",
    serviceRolePresent: serviceRoleStatus.present,
    serviceRoleRoleMatches: serviceRoleStatus.roleMatches,
    serviceRoleProjectRefMatches: serviceRoleStatus.projectRefMatches,
    serviceRoleReason: serviceRoleStatus.reason,
    directServiceRoleConfigured: directServiceRoleStatus.configured,
    directServiceRoleReachable: directServiceRoleStatus.reachable,
    directServiceRoleProbeOk: directServiceRoleStatus.probeOk,
    directServiceRoleReason: directServiceRoleStatus.reason,
    edgeServiceRoleConfigured: edgeServiceRoleStatus.configured,
    edgeServiceRoleReachable: edgeServiceRoleStatus.reachable,
    edgeServiceRoleKeyPresent: edgeServiceRoleStatus.keyPresent,
    edgeServiceRoleProbeOk: edgeServiceRoleStatus.probeOk,
    edgeServiceRoleProjectRefMatches: edgeServiceRoleStatus.projectRefMatches || false,
    edgeServiceRoleReason: edgeServiceRoleStatus.reason,
    discordBotTokenConfigured: discordBotStatus.tokenPresent,
    discordBotTokenValid: discordBotStatus.configured,
    discordBotTokenPresent: discordBotStatus.tokenPresent,
    discordBotApiReachable: discordBotStatus.reachable,
    discordBotUserOk: discordBotStatus.botUserOk,
    discordBotReason: discordBotStatus.reason,
    activationGuardConfigured: true,
    writerMode: activationGuardStatus.writerMode,
    trafficTransferMode: activationGuardStatus.trafficTransferMode,
    rollbackMode: activationGuardStatus.rollbackMode,
    writerActivationAllowed: activationGuardStatus.writerActivationAllowed,
    shadowWorkflowParityProved: activationGuardStatus.shadowWorkflowParityProved,
    liveWorkflowParityProved: activationGuardStatus.liveWorkflowParityProved,
    liveParityProofIdPresent: activationGuardStatus.liveParityProofIdPresent,
    liveTrafficProofIdPresent: activationGuardStatus.liveTrafficProofIdPresent,
    rollbackExecutionProofIdPresent: activationGuardStatus.rollbackExecutionProofIdPresent,
    activationBlockedReasons: activationGuardStatus.blockedReasons,
    liveCutover: activationGuardStatus.liveCutover,
    fitnessTrafficMoved: activationGuardStatus.fitnessTrafficMoved,
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  EXPECTED_SUPABASE_REF,
  MASTER_SUPABASE_REF,
  SERVICE_ROLE,
  isAllowedSupabaseProjectRef,
  decodeJwtPayload,
  getServiceRoleStatus,
  getPublicKeyStatus,
  getDirectServiceRoleStatus,
  getEdgeServiceRoleStatus,
  getDiscordBotStatus,
};
