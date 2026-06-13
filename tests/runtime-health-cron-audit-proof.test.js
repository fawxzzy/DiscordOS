const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-cron-audit-proof");

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

test("cron audit proof args default to DiscordOS Supabase status", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    supabaseUrl: process.env.DISCORDOS_SUPABASE_URL || _internals.DEFAULT_BASE_URL,
    expectedScheduleName: _internals.DEFAULT_EXPECTED_SCHEDULE_NAME,
    maxAgeHours: _internals.DEFAULT_MAX_AGE_HOURS,
  });
});

test("cron audit proof args support json url schedule and age", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--supabase-url",
      "https://example.supabase.co/",
      "--expected-schedule-name",
      "custom-schedule",
      "--max-age-hours",
      "12",
    ]),
    {
      json: true,
      supabaseUrl: "https://example.supabase.co",
      expectedScheduleName: "custom-schedule",
      maxAgeHours: 12,
    }
  );
});

test("cron audit proof requires service role key", async () => {
  await assert.rejects(
    _internals.fetchCronAuditStatus({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "",
    }),
    /missing_service_role_key/
  );
});

test("cron audit proof fetches service-role-only status RPC", async () => {
  const result = await _internals.fetchCronAuditStatus({
    supabaseUrl: "https://example.supabase.co/",
    serviceRoleKey: "service-role",
    fetchImpl: async (url, init = {}) => {
      assert.equal(String(url), "https://example.supabase.co/rest/v1/rpc/discordos_get_runtime_health_cron_run_status");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.apikey, "service-role");
      assert.equal(init.headers.Authorization, "Bearer service-role");
      assert.equal(init.body, "{}");
      return response({ totalCount: 0 });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
});

test("cron audit proof passes with fresh latest passing run", () => {
  const proof = _internals.summarizeCronAuditProof({
    expectedScheduleName: "vercel-daily-runtime-health",
    maxAgeHours: 30,
    now: new Date("2026-06-13T12:00:00.000Z"),
    statusResult: {
      ok: true,
      status: 200,
      endpoint: "https://example.supabase.co/rest/v1/rpc/discordos_get_runtime_health_cron_run_status",
      payload: {
        totalCount: 1,
        passCount: 1,
        failCount: 0,
        latestRun: {
          run_id: "runtime-health-cron-vercel-daily-runtime-health-20260613T080000000Z",
          schedule_name: "vercel-daily-runtime-health",
          status: "pass",
          generated_at: "2026-06-13T08:00:00.000Z",
          event_type: "discordos.runtime_health.cron_pass",
          event_severity: "info",
          posture: "operational",
          readiness_percent: 100,
        },
        latestPassingRun: {
          run_id: "runtime-health-cron-vercel-daily-runtime-health-20260613T080000000Z",
          schedule_name: "vercel-daily-runtime-health",
          status: "pass",
          generated_at: "2026-06-13T08:00:00.000Z",
        },
      },
    },
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.destructive, false);
  assert.equal(proof.sendsMessages, false);
  assert.equal(proof.writesArtifacts, false);
  assert.equal(proof.latestRun.ageHours, 4);
  assert.equal(proof.latestRun.readinessPercent, 100);
  assert.equal(proof.event.type, "discordos.runtime_health.cron_audit_proof_pass");
});

test("cron audit proof fails closed without fresh passing run", () => {
  const proof = _internals.summarizeCronAuditProof({
    expectedScheduleName: "vercel-daily-runtime-health",
    maxAgeHours: 30,
    now: new Date("2026-06-13T12:00:00.000Z"),
    statusResult: {
      ok: true,
      status: 200,
      endpoint: "https://example.supabase.co/rest/v1/rpc/discordos_get_runtime_health_cron_run_status",
      payload: {
        totalCount: 1,
        passCount: 0,
        failCount: 1,
        latestRun: {
          run_id: "runtime-health-cron-vercel-daily-runtime-health-20260611T080000000Z",
          schedule_name: "wrong-schedule",
          status: "fail",
          generated_at: "2026-06-11T08:00:00.000Z",
        },
        latestPassingRun: null,
      },
    },
  });

  assert.equal(proof.ok, false);
  assert.deepEqual(proof.reasonCodes, [
    "latest_cron_audit_run_not_passing",
    "latest_cron_audit_schedule_mismatch",
    "latest_cron_audit_run_stale",
    "passing_cron_audit_run_missing",
    "passing_cron_audit_run_stale",
  ]);
  assert.equal(proof.event.type, "discordos.runtime_health.cron_audit_proof_fail");
});

test("cron audit proof invokes fetch and summarizes output", async () => {
  const proof = await _internals.buildRuntimeHealthCronAuditProof({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    expectedScheduleName: "vercel-daily-runtime-health",
    maxAgeHours: 30,
    now: new Date("2026-06-13T12:00:00.000Z"),
    fetchImpl: async () => response({
      totalCount: 1,
      passCount: 1,
      failCount: 0,
      latestRun: {
        run_id: "runtime-health-cron-vercel-daily-runtime-health-20260613T080000000Z",
        schedule_name: "vercel-daily-runtime-health",
        status: "pass",
        generated_at: "2026-06-13T08:00:00.000Z",
      },
      latestPassingRun: {
        run_id: "runtime-health-cron-vercel-daily-runtime-health-20260613T080000000Z",
        schedule_name: "vercel-daily-runtime-health",
        status: "pass",
        generated_at: "2026-06-13T08:00:00.000Z",
      },
    }),
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.passCount, 1);
});

test("cron audit proof renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    event: {
      type: "discordos.runtime_health.cron_audit_proof_pass",
      severity: "info",
    },
    httpStatus: 200,
    expectedScheduleName: "vercel-daily-runtime-health",
    maxAgeHours: 30,
    totalCount: 1,
    passCount: 1,
    failCount: 0,
    latestRun: {
      runId: "runtime-health-cron-vercel-daily-runtime-health-20260613T080000000Z",
      status: "pass",
      generatedAt: "2026-06-13T08:00:00.000Z",
      ageHours: 4,
      eventType: "discordos.runtime_health.cron_pass",
      posture: "operational",
      readinessPercent: 100,
    },
    latestPassingRun: {
      runId: "runtime-health-cron-vercel-daily-runtime-health-20260613T080000000Z",
    },
    reasonCodes: [],
  });

  assert(rendered.includes("# DiscordOS Runtime Health Cron Audit Proof"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("latest run readiness percent: `100`"));
});
