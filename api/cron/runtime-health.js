const { _internals: runtimeHealthInternals } = require("../runtime-health");
const { _internals: readinessInternals } = require("../readiness");
const { _internals: alertInternals } = require("../../scripts/runtime-health-alert");
const { _internals: alertDeliveryInternals } = require("../../scripts/runtime-health-alert-delivery");
const os = require("node:os");
const path = require("node:path");

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function headerValue(req, name) {
  const headers = req.headers || {};
  const lowerName = name.toLowerCase();
  return headers[name] || headers[lowerName] || null;
}

function getCronAuthorization(req, env = process.env) {
  if (!hasValue(env.CRON_SECRET)) {
    return {
      ok: false,
      status: 503,
      reason: "cron_secret_not_configured",
    };
  }

  const authorization = headerValue(req, "authorization");
  if (authorization !== `Bearer ${env.CRON_SECRET}`) {
    return {
      ok: false,
      status: 401,
      reason: "cron_secret_mismatch",
    };
  }

  return {
    ok: true,
    status: 200,
    reason: "authorized",
  };
}

function summaryFromCronSnapshot(snapshot, generatedAt, { maxSnapshotAgeHours }) {
  return {
    ok: snapshot.ok,
    snapshotDir: "vercel-cron-runtime",
    maxSnapshotAgeHours,
    totalSnapshots: 1,
    passCount: snapshot.ok ? 1 : 0,
    failCount: snapshot.ok ? 0 : 1,
    latest: {
      fileName: "vercel-cron-runtime-health",
      ok: snapshot.ok,
      posture: snapshot.posture,
      readinessPercent: snapshot.readinessPercent,
      eventType: snapshot.ok
        ? "discordos.runtime_health.operational"
        : "discordos.runtime_health.action_required",
      generatedAt,
      ageHours: 0,
      fresh: true,
      staleReason: null,
      blockedReasons: snapshot.blockedReasons,
    },
  };
}

function classifyCronEvent({ ok, snapshot, alert, scheduleName }) {
  return {
    type: ok
      ? "discordos.runtime_health.cron_pass"
      : "discordos.runtime_health.cron_fail",
    severity: ok ? "info" : alert.severity === "critical" ? "error" : "warning",
    subject: "discordos.runtime",
    status: ok ? "pass" : "fail",
    dimensions: {
      scheduleName,
      posture: snapshot.posture,
      readinessPercent: snapshot.readinessPercent,
      alertSeverity: alert.severity,
      reasonCodeCount: alert.event.reasonCodes.length,
    },
  };
}

function getCronAlertDeliveryEnabled(env = process.env) {
  return env.DISCORDOS_RUNTIME_HEALTH_ALERT_SEND === "enabled";
}

function getCronAlertSuppressionDir(env = process.env) {
  return hasValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_SUPPRESSION_DIR)
    ? env.DISCORDOS_RUNTIME_HEALTH_ALERT_SUPPRESSION_DIR
    : path.join(os.tmpdir(), "discordos-runtime-health-alert-delivery");
}

function getCronAlertCooldownHours(env = process.env) {
  const value = Number.parseFloat(env.DISCORDOS_RUNTIME_HEALTH_ALERT_COOLDOWN_HOURS || "24");
  return Number.isFinite(value) && value > 0 ? value : 24;
}

function getCronAuditWriteEnabled(env = process.env) {
  return env.DISCORDOS_RUNTIME_HEALTH_CRON_AUDIT_WRITE === "enabled";
}

function cleanUrl(value) {
  return value.replace(/\/+$/, "");
}

function buildCronAuditRunId({ scheduleName, generatedAt }) {
  const normalizedSchedule = String(scheduleName || "unknown")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "unknown";
  const normalizedTimestamp = String(generatedAt || new Date().toISOString()).replace(/[^0-9TZ]/g, "");
  return `runtime-health-cron-${normalizedSchedule}-${normalizedTimestamp}`;
}

function buildCronAuditPayload(proof) {
  return {
    run_id: buildCronAuditRunId({
      scheduleName: proof.scheduleName,
      generatedAt: proof.generatedAt,
    }),
    schedule_name: proof.scheduleName,
    source: "vercel-cron-runtime-health",
    status: proof.ok ? "pass" : "fail",
    generated_at: proof.generatedAt,
    event_type: proof.event.type,
    event_severity: proof.event.severity,
    posture: proof.snapshot.posture,
    readiness_percent: proof.snapshot.readinessPercent,
    blocked_reasons: Array.isArray(proof.snapshot.blockedReasons) ? proof.snapshot.blockedReasons : [],
    alert_event_type: proof.alert.event.type,
    alert_severity: proof.alert.severity,
    alert_delivery_enabled: proof.alertDelivery.enabled === true,
    alert_delivery_status: proof.alertDelivery.status,
    alert_delivery_target_type: proof.alertDelivery.targetType,
    alert_delivered: proof.alertDelivered === true,
    artifact_written: proof.artifactWritten === true,
    destructive: proof.destructive === true,
    reason_codes: Array.isArray(proof.alertDelivery.reasonCodes) ? proof.alertDelivery.reasonCodes : [],
  };
}

async function insertCronAuditRun(payload, { supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${cleanUrl(supabaseUrl)}/rest/v1/rpc/discordos_insert_runtime_health_cron_run`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ payload }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: typeof body?.code === "string" ? body.code : "CRON_AUDIT_WRITE_FAILED",
    };
  }

  return {
    ok: true,
    status: response.status,
    row: Array.isArray(body) ? body[0] : body,
  };
}

async function invokeEdgeCronAuditWriter(payload, { supabaseUrl, anonKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${cleanUrl(supabaseUrl)}/functions/v1/discordos-runtime-health-cron-audit`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: typeof body?.error === "string" ? body.error : "EDGE_CRON_AUDIT_WRITE_FAILED",
      payload: body,
    };
  }

  return {
    ok: true,
    status: response.status,
    row: body?.row || null,
  };
}

async function writeCronAuditRun({ proof, env, fetchImpl }) {
  const enabled = getCronAuditWriteEnabled(env);
  if (!enabled) {
    return {
      ok: true,
      enabled,
      status: "disabled",
      written: false,
      reasonCodes: ["cron_audit_write_disabled"],
    };
  }

  if (!hasValue(env.DISCORDOS_SUPABASE_URL)) {
    return {
      ok: false,
      enabled,
      status: "config_missing",
      written: false,
      reasonCodes: ["cron_audit_config_missing"],
    };
  }

  const directServiceRoleConfigured = hasValue(env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY);
  const edgeWriterConfigured = hasValue(env.DISCORDOS_SUPABASE_ANON_KEY);

  if (!directServiceRoleConfigured && !edgeWriterConfigured) {
    return {
      ok: false,
      enabled,
      status: "config_missing",
      written: false,
      reasonCodes: ["cron_audit_config_missing"],
    };
  }

  const payload = buildCronAuditPayload(proof);
  const inserted = directServiceRoleConfigured
    ? await insertCronAuditRun(payload, {
        supabaseUrl: env.DISCORDOS_SUPABASE_URL,
        serviceRoleKey: env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY,
        fetchImpl,
      })
    : await invokeEdgeCronAuditWriter(payload, {
        supabaseUrl: env.DISCORDOS_SUPABASE_URL,
        anonKey: env.DISCORDOS_SUPABASE_ANON_KEY,
        fetchImpl,
      });

  if (!inserted.ok) {
    return {
      ok: false,
      enabled,
      status: "write_failed",
      written: false,
      httpStatus: inserted.status,
      databaseErrorCode: inserted.code,
      reasonCodes: ["cron_audit_write_failed"],
    };
  }

  return {
    ok: true,
    enabled,
    status: "written",
    written: true,
    runtime: directServiceRoleConfigured ? "vercel-env-service-role" : "supabase-edge-function",
    httpStatus: inserted.status,
    runId: inserted.row?.run_id || payload.run_id,
    generatedAt: inserted.row?.generated_at || payload.generated_at,
    reasonCodes: [],
  };
}

async function buildCronAlertDelivery({ alert, env, fetchImpl, now }) {
  const enabled = getCronAlertDeliveryEnabled(env);
  const target = alertDeliveryInternals.getAlertDeliveryTarget(env);
  const cooldownHours = getCronAlertCooldownHours(env);
  const minDeliverySeverity = "critical";

  if (!enabled) {
    return {
      ok: true,
      enabled,
      status: "disabled",
      targetType: target.type,
      sent: false,
      minDeliverySeverity,
      suppressRepeats: true,
      cooldownHours,
      reasonCodes: ["cron_alert_delivery_disabled"],
    };
  }

  const delivery = await alertDeliveryInternals.deliverAlert({
    alert,
    target,
    env,
    send: true,
    includeClear: false,
    minDeliverySeverity,
    suppressRepeats: true,
    suppressionDir: getCronAlertSuppressionDir(env),
    cooldownHours,
    fetchImpl,
    now,
  });

  return {
    ok: delivery.ok,
    enabled,
    status: delivery.status,
    targetType: delivery.targetType,
    sent: delivery.sent,
    httpStatus: delivery.httpStatus,
    minDeliverySeverity,
    suppressRepeats: delivery.suppressRepeats,
    cooldownHours: delivery.cooldownHours,
    suppression: delivery.suppression
      ? {
          suppressed: delivery.suppression.suppressed,
          recordWritten: delivery.suppression.recordWritten === true,
          lastSentAt: delivery.suppression.lastSentAt,
          nextEligibleAt: delivery.suppression.nextEligibleAt,
        }
      : null,
    reasonCodes: delivery.reasonCodes,
  };
}

async function buildCronRuntimeHealthProof({
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
  scheduleName = "vercel-daily-runtime-health",
  maxSnapshotAgeHours = 24,
  minReadinessPercent = 100,
  staleSeverity = "warning",
} = {}) {
  const [edgeServiceRoleStatus, discordBotStatus] = await Promise.all([
    readinessInternals.getEdgeServiceRoleStatus({
      supabaseUrl: env.DISCORDOS_SUPABASE_URL,
      anonKey: env.DISCORDOS_SUPABASE_ANON_KEY,
      fetchImpl,
    }),
    readinessInternals.getDiscordBotStatus({
      token: env.DISCORDOS_BOT_TOKEN,
      fetchImpl,
    }),
  ]);
  const generatedAt = now.toISOString();
  const snapshot = {
    ...runtimeHealthInternals.buildRuntimeHealthSnapshot({
      env,
      edgeServiceRoleStatus,
      discordBotStatus,
    }),
    generatedAt,
  };
  const summary = summaryFromCronSnapshot(snapshot, generatedAt, {
    maxSnapshotAgeHours,
  });
  const alert = alertInternals.decideRuntimeHealthAlert(summary, {
    minReadinessPercent,
    staleSeverity,
  });
  const alertDelivery = await buildCronAlertDelivery({
    alert,
    env,
    fetchImpl,
    now,
  });
  const ok = snapshot.ok && alert.ok;

  return {
    ok,
    scheduleName,
    generatedAt,
    destructive: false,
    alertDelivered: alertDelivery.sent,
    artifactWritten: false,
    snapshot,
    alert,
    alertDelivery,
    event: classifyCronEvent({
      ok,
      snapshot,
      alert,
      scheduleName,
    }),
  };
}

module.exports = async function cronRuntimeHealth(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  const authorization = getCronAuthorization(req);
  if (!authorization.ok) {
    return res.status(authorization.status).json({
      ok: false,
      error: authorization.reason,
    });
  }

  const proof = await buildCronRuntimeHealthProof();
  const audit = await writeCronAuditRun({
    proof,
    env: process.env,
    fetchImpl: fetch,
  });
  const ok = proof.ok && audit.ok;
  return res.status(ok ? 200 : proof.ok ? 502 : 409).json({
    ...proof,
    ok,
    cronAudit: audit,
  });
};

module.exports._internals = {
  hasValue,
  headerValue,
  getCronAuthorization,
  summaryFromCronSnapshot,
  classifyCronEvent,
  getCronAlertDeliveryEnabled,
  getCronAlertSuppressionDir,
  getCronAlertCooldownHours,
  getCronAuditWriteEnabled,
  buildCronAuditRunId,
  buildCronAuditPayload,
  insertCronAuditRun,
  invokeEdgeCronAuditWriter,
  writeCronAuditRun,
  buildCronAlertDelivery,
  buildCronRuntimeHealthProof,
};
