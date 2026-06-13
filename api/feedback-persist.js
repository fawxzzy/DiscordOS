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

function optionalSecret(value) {
  return hasValue(value) ? value.trim() : null;
}

function cleanUrl(value) {
  return value.replace(/\/+$/, "");
}

function headerValue(headers, name) {
  const raw = headers?.[name] ?? headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return typeof raw === "string" ? raw : null;
}

function getTransferSecretStatus(headers = {}, env = process.env) {
  const expected = optionalSecret(env.DISCORDOS_FEEDBACK_TRANSFER_SECRET);
  const provided = optionalSecret(headerValue(headers, "x-discordos-feedback-transfer-secret"));

  return {
    configured: expected !== null,
    present: provided !== null,
    matches: expected !== null && provided !== null && provided === expected,
  };
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

  if (!serviceRoleConfigured && !edgePersistAvailable) {
    blockedReasons.push("missing_service_role_key");
  }

  if (!edgePersistAvailable) {
    blockedReasons.push("missing_edge_persist_config");
  }

  const hasPersistenceRuntime = serviceRoleConfigured || edgePersistAvailable;

  return {
    persistedWriterEnabled,
    writerMode: activationStatus.writerMode,
    trafficTransferMode: activationStatus.trafficTransferMode,
    rollbackMode: activationStatus.rollbackMode,
    writerModeAllowsPersistence,
    supabaseUrlConfigured,
    anonKeyConfigured,
    serviceRoleConfigured,
    edgePersistAvailable,
    canAttemptPersistence: persistedWriterEnabled && writerModeAllowsPersistence && hasPersistenceRuntime,
    blockedReasons,
  };
}

function isFitnessLiveTransferProofPayload(payload) {
  return (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof payload.reportId === "string" &&
    payload.reportId.startsWith("fitness-live-transfer-")
  );
}

function isLiveTransferProofRow(row, writerConfig) {
  return (
    row !== null &&
    typeof row === "object" &&
    typeof row.report_id === "string" &&
    row.report_id.startsWith("fitness-live-transfer-") &&
    writerConfig.writerMode === "active" &&
    writerConfig.trafficTransferMode === "active" &&
    writerConfig.rollbackMode === "discordos-primary-with-fitness-rollback"
  );
}

function buildEdgePersistPayload(row, originalPayload, fitnessLiveTransferPayload) {
  if (!fitnessLiveTransferPayload || originalPayload === null || typeof originalPayload !== "object") {
    return row;
  }

  return {
    ...row,
    transfer_source: typeof originalPayload.transferSource === "string" ? originalPayload.transferSource : null,
    source_proof: typeof originalPayload.sourceProof === "string" ? originalPayload.sourceProof : null,
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

async function invokeEdgePersistWriter(row, { supabaseUrl, anonKey, transferSecret = null, fetchImpl = fetch }) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (hasValue(transferSecret)) {
    headers["X-DiscordOS-Feedback-Transfer-Secret"] = transferSecret.trim();
  }

  const response = await fetchImpl(`${cleanUrl(supabaseUrl)}/functions/v1/discordos-feedback-persist`, {
    method: "POST",
    headers,
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

  const fitnessLiveTransferPayload = isFitnessLiveTransferProofPayload(parsed.value);
  const transferSecretStatus = getTransferSecretStatus(req.headers);
  if (fitnessLiveTransferPayload && !transferSecretStatus.matches) {
    return res.status(401).json({
      ok: false,
      service: "discordos-feedback-persisted-writer",
      error: transferSecretStatus.configured
        ? "FITNESS_TRANSFER_SECRET_INVALID"
        : "FITNESS_TRANSFER_SECRET_NOT_CONFIGURED",
      persisted: false,
      writesDiscord: false,
      writesFitness: false,
      trafficMoved: false,
      transferSecretConfigured: transferSecretStatus.configured,
      transferSecretPresent: transferSecretStatus.present,
      generatedAt: new Date().toISOString(),
    });
  }

  const normalized = shadowInternals.normalizeShadowFeedbackPayload(parsed.value, {
    runtimeWarnings: fitnessLiveTransferPayload
      ? [
          "discordos_fitness_live_transfer",
          "discordos_fitness_origin_authenticated",
          "discordos_fitness_discord_signature_verified",
          "discordos_persisted_writer_no_discord_write",
        ]
      : ["discordos_persisted_writer_no_traffic_transfer"],
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
    : await invokeEdgePersistWriter(buildEdgePersistPayload(normalized.value, parsed.value, fitnessLiveTransferPayload), {
        supabaseUrl: process.env.DISCORDOS_SUPABASE_URL,
        anonKey: process.env.DISCORDOS_SUPABASE_ANON_KEY,
        transferSecret: fitnessLiveTransferPayload ? process.env.DISCORDOS_FEEDBACK_TRANSFER_SECRET : null,
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

  const row = writerConfig.serviceRoleConfigured ? inserted.row : inserted.payload.row;
  const liveTransferProof = isLiveTransferProofRow(row, writerConfig);

  return res.status(201).json({
    ok: true,
    service: "discordos-feedback-persisted-writer",
    persisted: true,
    persistenceAttempted: true,
    writesDiscord: false,
    writesFitness: false,
    trafficMoved: liveTransferProof,
    liveTrafficMoved: liveTransferProof,
    rollbackExecutionProved: false,
    writerMode: writerConfig.writerMode,
    trafficTransferMode: writerConfig.trafficTransferMode,
    rollbackMode: writerConfig.rollbackMode,
    persistenceRuntime: writerConfig.serviceRoleConfigured ? "vercel-env-service-role" : "supabase-edge-function",
    row,
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  getPersistedWriterConfig,
  isLiveTransferProofRow,
  insertFeedbackReport,
  invokeEdgePersistWriter,
  getTransferSecretStatus,
  buildEdgePersistPayload,
};
