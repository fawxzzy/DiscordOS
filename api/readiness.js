const EXPECTED_SUPABASE_REF = "nwexsktuuenfdegzrbut";
const SERVICE_ROLE = "service_role";

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

module.exports = function readiness(req, res) {
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

  return res.status(200).json({
    ok: true,
    service: "discordos-readiness",
    runtime: "vercel-serverless-function",
    supabaseProjectRefConfigured: configuredProjectRef === EXPECTED_SUPABASE_REF,
    supabaseUrlConfigured: hasValue(configuredSupabaseUrl),
    serviceRoleConfigured: serviceRoleStatus.configured,
    serviceRolePresent: serviceRoleStatus.present,
    serviceRoleRoleMatches: serviceRoleStatus.roleMatches,
    serviceRoleProjectRefMatches: serviceRoleStatus.projectRefMatches,
    serviceRoleReason: serviceRoleStatus.reason,
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
};
