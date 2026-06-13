const DEFAULT_BASE_URL = "https://nwexsktuuenfdegzrbut.supabase.co";
const DEFAULT_EXPECTED_SCHEDULE_NAME = "vercel-daily-runtime-health";
const DEFAULT_MAX_AGE_HOURS = 30;

function parseArgs(args) {
  const options = {
    json: false,
    supabaseUrl: process.env.DISCORDOS_SUPABASE_URL || DEFAULT_BASE_URL,
    expectedScheduleName: DEFAULT_EXPECTED_SCHEDULE_NAME,
    maxAgeHours: DEFAULT_MAX_AGE_HOURS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--supabase-url") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_supabase_url_value");
      }
      options.supabaseUrl = value.trim().replace(/\/+$/, "");
      index += 1;
    } else if (arg === "--expected-schedule-name") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_expected_schedule_name_value");
      }
      options.expectedScheduleName = value.trim();
      index += 1;
    } else if (arg === "--max-age-hours") {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("invalid_max_age_hours");
      }
      options.maxAgeHours = value;
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

function cleanUrl(value) {
  return value.replace(/\/+$/, "");
}

async function fetchCronAuditStatus({ supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  if (!hasValue(serviceRoleKey)) {
    throw new Error("missing_service_role_key");
  }

  const endpoint = `${cleanUrl(supabaseUrl)}/rest/v1/rpc/discordos_get_runtime_health_cron_run_status`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{}",
  });
  const payload = await response.json().catch(() => null);

  return {
    endpoint,
    status: response.status,
    ok: response.ok,
    payload,
  };
}

function ageHoursFromNow(timestamp, now = new Date()) {
  if (!hasValue(timestamp)) {
    return null;
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return Math.max(0, (now.getTime() - parsed.getTime()) / 36e5);
}

function summarizeCronAuditProof({
  statusResult,
  expectedScheduleName,
  maxAgeHours,
  now = new Date(),
}) {
  const payload = statusResult.payload && typeof statusResult.payload === "object" ? statusResult.payload : {};
  const latestRun = payload.latestRun && typeof payload.latestRun === "object" ? payload.latestRun : null;
  const latestPassingRun = payload.latestPassingRun && typeof payload.latestPassingRun === "object"
    ? payload.latestPassingRun
    : null;
  const latestRunAgeHours = ageHoursFromNow(latestRun?.generated_at || latestRun?.generatedAt, now);
  const latestPassingAgeHours = ageHoursFromNow(
    latestPassingRun?.generated_at || latestPassingRun?.generatedAt,
    now
  );
  const reasonCodes = [];

  if (!statusResult.ok) {
    reasonCodes.push("cron_audit_status_fetch_failed");
  }
  if (!latestRun) {
    reasonCodes.push("cron_audit_run_missing");
  }
  if (latestRun && latestRun.status !== "pass") {
    reasonCodes.push("latest_cron_audit_run_not_passing");
  }
  if (latestRun && latestRun.schedule_name !== expectedScheduleName) {
    reasonCodes.push("latest_cron_audit_schedule_mismatch");
  }
  if (latestRunAgeHours === null || latestRunAgeHours > maxAgeHours) {
    reasonCodes.push("latest_cron_audit_run_stale");
  }
  if (!latestPassingRun) {
    reasonCodes.push("passing_cron_audit_run_missing");
  }
  if (latestPassingRun && latestPassingRun.schedule_name !== expectedScheduleName) {
    reasonCodes.push("passing_cron_audit_schedule_mismatch");
  }
  if (latestPassingAgeHours === null || latestPassingAgeHours > maxAgeHours) {
    reasonCodes.push("passing_cron_audit_run_stale");
  }

  const proof = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    endpoint: statusResult.endpoint,
    httpStatus: statusResult.status,
    expectedScheduleName,
    maxAgeHours,
    totalCount: payload.totalCount ?? 0,
    passCount: payload.passCount ?? 0,
    failCount: payload.failCount ?? 0,
    latestRun: latestRun
      ? {
          runId: latestRun.run_id || latestRun.runId || null,
          scheduleName: latestRun.schedule_name || latestRun.scheduleName || null,
          status: latestRun.status || null,
          generatedAt: latestRun.generated_at || latestRun.generatedAt || null,
          ageHours: latestRunAgeHours,
          eventType: latestRun.event_type || latestRun.eventType || null,
          eventSeverity: latestRun.event_severity || latestRun.eventSeverity || null,
          posture: latestRun.posture || null,
          readinessPercent: latestRun.readiness_percent ?? latestRun.readinessPercent ?? null,
        }
      : null,
    latestPassingRun: latestPassingRun
      ? {
          runId: latestPassingRun.run_id || latestPassingRun.runId || null,
          scheduleName: latestPassingRun.schedule_name || latestPassingRun.scheduleName || null,
          status: latestPassingRun.status || null,
          generatedAt: latestPassingRun.generated_at || latestPassingRun.generatedAt || null,
          ageHours: latestPassingAgeHours,
        }
      : null,
    reasonCodes: [...new Set(reasonCodes)],
  };

  return {
    ...proof,
    event: classifyCronAuditProofEvent(proof),
  };
}

function classifyCronAuditProofEvent(proof) {
  return {
    type: proof.ok
      ? "discordos.runtime_health.cron_audit_proof_pass"
      : "discordos.runtime_health.cron_audit_proof_fail",
    severity: proof.ok ? "info" : "error",
    subject: "discordos.runtime",
    status: proof.ok ? "pass" : "fail",
    dimensions: {
      expectedScheduleName: proof.expectedScheduleName,
      totalCount: proof.totalCount,
      passCount: proof.passCount,
      failCount: proof.failCount,
      latestRunStatus: proof.latestRun?.status || null,
      latestRunAgeHours: proof.latestRun?.ageHours ?? null,
      reasonCodeCount: proof.reasonCodes.length,
    },
  };
}

async function buildRuntimeHealthCronAuditProof({
  supabaseUrl,
  expectedScheduleName,
  maxAgeHours,
  serviceRoleKey,
  fetchImpl,
  now,
}) {
  const statusResult = await fetchCronAuditStatus({
    supabaseUrl,
    serviceRoleKey,
    fetchImpl,
  });
  return summarizeCronAuditProof({
    statusResult,
    expectedScheduleName,
    maxAgeHours,
    now,
  });
}

function renderMarkdown(proof) {
  const lines = [
    "# DiscordOS Runtime Health Cron Audit Proof",
    "",
    `- result: \`${proof.ok ? "pass" : "fail"}\``,
    `- destructive: \`${proof.destructive ? "true" : "false"}\``,
    `- sends messages: \`${proof.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${proof.writesArtifacts ? "true" : "false"}\``,
    `- event type: \`${proof.event.type}\``,
    `- event severity: \`${proof.event.severity}\``,
    `- http status: \`${proof.httpStatus}\``,
    `- expected schedule name: \`${proof.expectedScheduleName}\``,
    `- max age hours: \`${proof.maxAgeHours}\``,
    `- total count: \`${proof.totalCount}\``,
    `- pass count: \`${proof.passCount}\``,
    `- fail count: \`${proof.failCount}\``,
    `- latest run id: \`${proof.latestRun?.runId || "none"}\``,
    `- latest run status: \`${proof.latestRun?.status || "none"}\``,
    `- latest run generated at: \`${proof.latestRun?.generatedAt || "none"}\``,
    `- latest run age hours: \`${proof.latestRun?.ageHours?.toFixed(3) ?? "none"}\``,
    `- latest run event type: \`${proof.latestRun?.eventType || "none"}\``,
    `- latest run posture: \`${proof.latestRun?.posture || "none"}\``,
    `- latest run readiness percent: \`${proof.latestRun?.readinessPercent ?? "none"}\``,
    `- latest passing run id: \`${proof.latestPassingRun?.runId || "none"}\``,
    `- reason codes: \`${proof.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const proof = await buildRuntimeHealthCronAuditProof({
      ...options,
      serviceRoleKey: process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY,
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
    DEFAULT_EXPECTED_SCHEDULE_NAME,
    DEFAULT_MAX_AGE_HOURS,
    parseArgs,
    fetchCronAuditStatus,
    ageHoursFromNow,
    summarizeCronAuditProof,
    classifyCronAuditProofEvent,
    buildRuntimeHealthCronAuditProof,
    renderMarkdown,
  },
};
