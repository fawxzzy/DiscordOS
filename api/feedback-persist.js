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
  const serviceRoleConfigured = hasValue(env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY);
  const writerModeAllowsPersistence = activationStatus.writerMode === "shadow" || activationStatus.writerMode === "active";
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

  return {
    persistedWriterEnabled,
    writerMode: activationStatus.writerMode,
    writerModeAllowsPersistence,
    supabaseUrlConfigured,
    serviceRoleConfigured,
    canAttemptPersistence: blockedReasons.length === 0,
    blockedReasons,
  };
}

async function insertFeedbackReport(row, { supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${cleanUrl(supabaseUrl)}/rest/v1/${REPORTS_TABLE}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Profile": SCHEMA,
      "Content-Profile": SCHEMA,
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: typeof payload?.code === "string" ? payload.code : "SUPABASE_WRITE_FAILED",
    };
  }

  return {
    ok: true,
    status: response.status,
    row: Array.isArray(payload) ? payload[0] : payload,
  };
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

  const inserted = await insertFeedbackReport(normalized.value, {
    supabaseUrl: process.env.DISCORDOS_SUPABASE_URL,
    serviceRoleKey: process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY,
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
    row: inserted.row,
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  getPersistedWriterConfig,
  insertFeedbackReport,
};
