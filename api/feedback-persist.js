const { _internals: shadowInternals } = require("./feedback-shadow");
const { _internals: activationInternals } = require("./activation");

const SCHEMA = "discordos";
const REPORTS_TABLE = "discord_feedback_reports";

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function enabledFlag(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function cleanUrl(value) {
  return value.replace(/\/+$/, "");
}

function getPersistedWriterConfig(env = process.env) {
  const activationStatus = activationInternals.getActivationGuardStatus(env);
  const persistedWriterEnabled = enabledFlag(env.DISCORDOS_PERSISTED_WRITER_ENABLED);
  const supabaseUrlConfigured = hasValue(env.DISCORDOS_SUPABASE_URL);
  const anonKeyConfigured = hasValue(env.DISCORDOS_SUPABASE_ANON_KEY);
  const serviceRoleConfigured = hasValue(env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY);
  const writerModeAllowsPersistence = activationStatus.writerMode === "shadow" || activationStatus.writerMode === "active";
  const edgePersistAvailable = supabaseUrlConfigured && anonKeyConfigured;
  const blockedReasons = [];

  if (!persistedWriterEnabled) {
    blockedReasons.push("persisted_writer_not_enabled");
  }

  if (!writerModeAllowsPersistence) {
    blockedReasons.push("writer_mode_not_shadow_or_active");
  }

  if (!supabaseUrlConfigured) {
    blockedReasons.push("missing_supabase_url");
  }

  if (!serviceRoleConfigured) {
    blockedReasons.push("missing_service_role_key");
  }

  if (!edgePersistAvailable) {
    blockedReasons.push("missing_edge_persist_config");
  }

  const hasPersistenceRuntime = serviceRoleConfigured || edgePersistAvailable;

  return {
    persistedWriterEnabled,
    writerMode: activationStatus.writerMode,
    writerModeAllowsPersistence,
    supabaseUrlConfigured,
    anonKeyConfigured,
    serviceRoleConfigured,
    edgePersistAvailable,
    canAttemptPersistence: persistedWriterEnabled && writerModeAllowsPersistence && hasPersistenceRuntime,
    blockedReasons,
  };
}

async function insertFeedbackReport(row, { supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${cleanUrl(supabaseUrl)}/rest/v1/rpc/discordos_insert_feedback_proof`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ payload: row }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: typeof payload?.code === "string" ? payload.code : "SUPABASE_WRITE_FAILED",
    };
  }

  return { ok: true, status: response.status, row: Array.isArray(payload) ? payload[0] : payload };
}

async function invokeEdgePersistWriter(row, { supabaseUrl, anonKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${cleanUrl(supabaseUrl)}/functions/v1/discordos-feedback-persist`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(row),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: typeof payload?.error === "string" ? payload.error : "EDGE_PERSIST_FAILED",
      payload,
    };
  }
  return { ok: true, status: response.status, payload };
}

module.exports = async function feedbackPersist(req, res) {
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
      writesDiscord: false,
      writesFitness: false,
      trafficMoved: false,
    });
  }

  const normalized = shadowInternals.normalizeShadowFeedbackPayload(parsed.value, {
    runtimeWarnings: ["discordos_persisted_writer_no_traffic_transfer"],
  });
  if (!normalized.ok) {
    return res.status(400).json({
      ok: false,
      error: normalized.code,
      errors: normalized.errors,
      persisted: false,
      writesDiscord: false,
      writesFitness: false,
      trafficMoved: false,
    });
  }

  const writerConfig = getPersistedWriterConfig();
  if (!writerConfig.canAttemptPersistence) {
    return res.status(409).json({
      ok: false,
      service: "discordos-feedback-persisted-writer",
      error: "PERSISTENCE_NOT_ENABLED",
      persisted: false,
      persistenceAttempted: false,
      writesDiscord: false,
      writesFitness: false,
      trafficMoved: false,
      writerMode: writerConfig.writerMode,
      blockedReasons: writerConfig.blockedReasons,
      rowPreview: normalized.value,
      generatedAt: new Date().toISOString(),
    });
  }

  const inserted = writerConfig.serviceRoleConfigured
    ? await insertFeedbackReport(normalized.value, {
        supabaseUrl: process.env.DISCORDOS_SUPABASE_URL,
        serviceRoleKey: process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY,
      })
    : await invokeEdgePersistWriter(normalized.value, {
        supabaseUrl: process.env.DISCORDOS_SUPABASE_URL,
        anonKey: process.env.DISCORDOS_SUPABASE_ANON_KEY,
      });

  if (!inserted.ok) {
    return res.status(502).json({
      ok: false,
      service: "discordos-feedback-persisted-writer",
      error: "PERSISTENCE_FAILED",
      persisted: false,
      persistenceAttempted: true,
      writesDiscord: false,
      writesFitness: false,
      trafficMoved: false,
      persistenceRuntime: writerConfig.serviceRoleConfigured ? "vercel-env-service-role" : "supabase-edge-function",
      databaseStatus: inserted.status,
      databaseErrorCode: inserted.code,
      generatedAt: new Date().toISOString(),
    });
  }

  return res.status(201).json({
    ok: true,
    service: "discordos-feedback-persisted-writer",
    persisted: true,
    persistenceAttempted: true,
    writesDiscord: false,
    writesFitness: false,
    trafficMoved: false,
    writerMode: writerConfig.writerMode,
    persistenceRuntime: writerConfig.serviceRoleConfigured ? "vercel-env-service-role" : "supabase-edge-function",
    row: writerConfig.serviceRoleConfigured ? inserted.row : inserted.payload.row,
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  getPersistedWriterConfig,
  insertFeedbackReport,
  invokeEdgePersistWriter,
};
