const DEFAULT_BASE_URL = "https://fawxzzy-discordos.vercel.app";

function parseArgs(args) {
  const options = {
    json: false,
    baseUrl: DEFAULT_BASE_URL,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--base-url") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_base_url_value");
      }
      options.baseUrl = value.trim().replace(/\/+$/, "");
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateAuthorizedCronPayload(payload) {
  const failures = [];
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      failures: ["payload_must_be_object"],
    };
  }

  if (payload.ok !== true) {
    failures.push("cron_proof_not_ok");
  }
  if (payload.destructive !== false) {
    failures.push("cron_proof_not_non_destructive");
  }
  if (payload.alertDelivered !== false) {
    failures.push("cron_proof_delivered_alert");
  }
  if (payload.alertDelivery?.enabled !== true) {
    failures.push("cron_alert_delivery_not_enabled");
  }
  if (payload.alertDelivery?.status !== "skipped_clear") {
    failures.push("cron_alert_delivery_not_skipped_clear");
  }
  if (payload.alertDelivery?.targetType !== "discord_bot_channel") {
    failures.push("cron_alert_delivery_target_not_bot_channel");
  }
  if (payload.alertDelivery?.sent !== false) {
    failures.push("cron_alert_delivery_sent_unexpectedly");
  }
  if (payload.artifactWritten !== false) {
    failures.push("cron_proof_wrote_artifact");
  }
  if (payload.snapshot?.posture !== "operational") {
    failures.push("runtime_health_not_operational");
  }
  if (payload.snapshot?.readinessPercent !== 100) {
    failures.push("readiness_percent_not_100");
  }
  if (Array.isArray(payload.snapshot?.blockedReasons) && payload.snapshot.blockedReasons.length > 0) {
    failures.push("blocked_reasons_present");
  }
  if (payload.alert?.event?.type !== "discordos.runtime_health.alert_clear") {
    failures.push("alert_not_clear");
  }
  if (payload.event?.type !== "discordos.runtime_health.cron_pass") {
    failures.push("cron_event_not_pass");
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

function classifyAuthorizedCronProofEvent(proof) {
  return {
    type: proof.ok
      ? "discordos.runtime_health.cron_authorized_proof_pass"
      : "discordos.runtime_health.cron_authorized_proof_fail",
    severity: proof.ok ? "info" : "error",
    subject: "discordos.runtime",
    status: proof.ok ? "pass" : "fail",
    dimensions: {
      baseUrl: proof.baseUrl,
      httpStatus: proof.httpStatus,
      posture: proof.summary.posture,
      readinessPercent: proof.summary.readinessPercent,
      alertSeverity: proof.summary.alertSeverity,
      alertDeliveryEnabled: proof.summary.alertDeliveryEnabled,
      alertDeliveryStatus: proof.summary.alertDeliveryStatus,
      alertDeliveryTargetType: proof.summary.alertDeliveryTargetType,
      validationFailureCount: proof.validation.failures.length,
    },
  };
}

async function fetchAuthorizedCronProof({ baseUrl, cronSecret, fetchImpl = fetch }) {
  if (!hasValue(cronSecret)) {
    throw new Error("missing_cron_secret");
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const endpoint = `${normalizedBaseUrl}/api/cron/runtime-health`;
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  const payload = await response.json().catch(() => null);
  const validation = validateAuthorizedCronPayload(payload);
  const proof = {
    ok: response.status === 200 && validation.ok,
    baseUrl: normalizedBaseUrl,
    endpoint,
    httpStatus: response.status,
    validation,
    summary: {
      scheduleName: payload?.scheduleName || null,
      posture: payload?.snapshot?.posture || null,
      readinessPercent: payload?.snapshot?.readinessPercent ?? null,
      blockedReasons: Array.isArray(payload?.snapshot?.blockedReasons) ? payload.snapshot.blockedReasons : [],
      liveCutover: payload?.snapshot?.activation?.liveCutover === true,
      fitnessTrafficMoved: payload?.snapshot?.activation?.fitnessTrafficMoved === true,
      alertSeverity: payload?.alert?.severity || null,
      alertEventType: payload?.alert?.event?.type || null,
      alertDeliveryEnabled: payload?.alertDelivery?.enabled === true,
      alertDeliveryStatus: payload?.alertDelivery?.status || null,
      alertDeliveryTargetType: payload?.alertDelivery?.targetType || null,
      alertDeliveryReasonCodes: Array.isArray(payload?.alertDelivery?.reasonCodes)
        ? payload.alertDelivery.reasonCodes
        : [],
      cronEventType: payload?.event?.type || null,
      alertDelivered: payload?.alertDelivered === true,
      artifactWritten: payload?.artifactWritten === true,
      destructive: payload?.destructive === true,
    },
  };

  return {
    ...proof,
    event: classifyAuthorizedCronProofEvent(proof),
  };
}

function renderMarkdown(proof) {
  const lines = [
    "# DiscordOS Runtime Health Authorized Cron Proof",
    "",
    `- result: \`${proof.ok ? "pass" : "fail"}\``,
    `- base url: \`${proof.baseUrl}\``,
    `- http status: \`${proof.httpStatus}\``,
    `- event type: \`${proof.event.type}\``,
    `- event severity: \`${proof.event.severity}\``,
    `- schedule name: \`${proof.summary.scheduleName || "unknown"}\``,
    `- posture: \`${proof.summary.posture || "unknown"}\``,
    `- readiness percent: \`${proof.summary.readinessPercent ?? "unknown"}\``,
    `- blocked reasons: \`${proof.summary.blockedReasons.join(",") || "none"}\``,
    `- live cutover: \`${proof.summary.liveCutover ? "true" : "false"}\``,
    `- fitness traffic moved: \`${proof.summary.fitnessTrafficMoved ? "true" : "false"}\``,
    `- alert event type: \`${proof.summary.alertEventType || "unknown"}\``,
    `- alert delivery enabled: \`${proof.summary.alertDeliveryEnabled ? "true" : "false"}\``,
    `- alert delivery status: \`${proof.summary.alertDeliveryStatus || "unknown"}\``,
    `- alert delivery target type: \`${proof.summary.alertDeliveryTargetType || "unknown"}\``,
    `- alert delivery reasons: \`${proof.summary.alertDeliveryReasonCodes.join(",") || "none"}\``,
    `- cron event type: \`${proof.summary.cronEventType || "unknown"}\``,
    `- destructive: \`${proof.summary.destructive ? "true" : "false"}\``,
    `- alert delivered: \`${proof.summary.alertDelivered ? "true" : "false"}\``,
    `- artifact written: \`${proof.summary.artifactWritten ? "true" : "false"}\``,
    `- validation failures: \`${proof.validation.failures.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const proof = await fetchAuthorizedCronProof({
      baseUrl: options.baseUrl,
      cronSecret: process.env.CRON_SECRET,
    });
    process.stdout.write(options.json ? `${JSON.stringify(proof, null, 2)}\n` : renderMarkdown(proof));
    if (!proof.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  _internals: {
    DEFAULT_BASE_URL,
    parseArgs,
    validateAuthorizedCronPayload,
    classifyAuthorizedCronProofEvent,
    fetchAuthorizedCronProof,
    renderMarkdown,
  },
};
