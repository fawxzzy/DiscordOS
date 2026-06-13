const assert = require("node:assert/strict");
const test = require("node:test");

const cronRuntimeHealth = require("../api/cron/runtime-health");
const { _internals } = cronRuntimeHealth;
const { _internals: readinessInternals } = require("../api/readiness");

function jwtWithPayload(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

function operationalEnv() {
  return {
    CRON_SECRET: "cron-secret",
    DISCORDOS_SUPABASE_PROJECT_REF: readinessInternals.EXPECTED_SUPABASE_REF,
    DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
    DISCORDOS_SUPABASE_ANON_KEY: "anon-test-key",
    DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: jwtWithPayload({
      role: readinessInternals.SERVICE_ROLE,
      ref: readinessInternals.EXPECTED_SUPABASE_REF,
    }),
    DISCORDOS_BOT_TOKEN: "bot-token",
    DISCORDOS_PERSISTED_WRITER_ENABLED: "true",
    DISCORDOS_WRITER_MODE: "active",
    DISCORDOS_TRAFFIC_TRANSFER_MODE: "active",
    DISCORDOS_ROLLBACK_MODE: "discordos-primary-with-fitness-rollback",
    DISCORDOS_LIVE_PARITY_PROOF_ID: "fitness-feedback-baae50a0-live-parity-20260613",
    DISCORDOS_LIVE_TRAFFIC_PROOF_ID: "fitness-feedback-baae50a0-live-traffic-20260613",
    DISCORDOS_ROLLBACK_EXECUTION_PROOF_ID: "rollback-proof",
  };
}

function createRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("cron runtime health authorization fails closed without secret", () => {
  assert.deepEqual(_internals.getCronAuthorization({ headers: {} }, {}), {
    ok: false,
    status: 503,
    reason: "cron_secret_not_configured",
  });
});

test("cron runtime health authorization rejects mismatched bearer", () => {
  assert.deepEqual(
    _internals.getCronAuthorization(
      { headers: { authorization: "Bearer wrong" } },
      { CRON_SECRET: "expected" }
    ),
    {
      ok: false,
      status: 401,
      reason: "cron_secret_mismatch",
    }
  );
});

test("cron runtime health authorization accepts matching bearer", () => {
  assert.deepEqual(
    _internals.getCronAuthorization(
      { headers: { authorization: "Bearer expected" } },
      { CRON_SECRET: "expected" }
    ),
    {
      ok: true,
      status: 200,
      reason: "authorized",
    }
  );
});

test("cron runtime health builds no-side-effect passing proof", async () => {
  const env = operationalEnv();
  const proof = await _internals.buildCronRuntimeHealthProof({
    env,
    now: new Date("2026-06-13T04:00:00.000Z"),
    fetchImpl: async (url) => {
      if (String(url).includes("/functions/v1/discordos-readiness")) {
        return response({
          supabaseProjectRef: readinessInternals.EXPECTED_SUPABASE_REF,
          serviceRoleKeyPresent: true,
          serviceRoleProbeOk: true,
          serviceRoleProbeReason: "service_role_private_schema_read_ok",
        });
      }
      if (String(url).includes("/users/@me")) {
        return response({ bot: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.destructive, false);
  assert.equal(proof.alertDelivered, false);
  assert.equal(proof.artifactWritten, false);
  assert.equal(proof.alertDelivery.enabled, false);
  assert.equal(proof.alertDelivery.status, "disabled");
  assert.deepEqual(proof.alertDelivery.reasonCodes, ["cron_alert_delivery_disabled"]);
  assert.equal(proof.snapshot.posture, "operational");
  assert.equal(proof.alert.event.type, "discordos.runtime_health.alert_clear");
  assert.equal(proof.event.type, "discordos.runtime_health.cron_pass");
});

test("cron runtime health audit writer skips by default", async () => {
  const audit = await _internals.writeCronAuditRun({
    proof: {
      scheduleName: "vercel-daily-runtime-health",
      generatedAt: "2026-06-13T04:00:00.000Z",
    },
    env: {},
    fetchImpl: async () => {
      throw new Error("should not fetch when disabled");
    },
  });

  assert.deepEqual(audit, {
    ok: true,
    enabled: false,
    status: "disabled",
    written: false,
    reasonCodes: ["cron_audit_write_disabled"],
  });
});

test("cron runtime health audit writer fails closed when enabled without service role config", async () => {
  const audit = await _internals.writeCronAuditRun({
    proof: {
      scheduleName: "vercel-daily-runtime-health",
      generatedAt: "2026-06-13T04:00:00.000Z",
    },
    env: {
      DISCORDOS_RUNTIME_HEALTH_CRON_AUDIT_WRITE: "enabled",
      DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
    },
    fetchImpl: async () => {
      throw new Error("should not fetch without service role");
    },
  });

  assert.deepEqual(audit, {
    ok: false,
    enabled: true,
    status: "config_missing",
    written: false,
    reasonCodes: ["cron_audit_config_missing"],
  });
});

test("cron runtime health audit writer persists sanitized run receipts", async () => {
  const env = operationalEnv();
  const proof = await _internals.buildCronRuntimeHealthProof({
    env,
    now: new Date("2026-06-13T04:00:00.000Z"),
    fetchImpl: async (url) => {
      if (String(url).includes("/functions/v1/discordos-readiness")) {
        return response({
          supabaseProjectRef: readinessInternals.EXPECTED_SUPABASE_REF,
          serviceRoleKeyPresent: true,
          serviceRoleProbeOk: true,
          serviceRoleProbeReason: "service_role_private_schema_read_ok",
        });
      }
      if (String(url).includes("/users/@me")) {
        return response({ bot: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
  });

  const audit = await _internals.writeCronAuditRun({
    proof,
    env: {
      ...env,
      DISCORDOS_RUNTIME_HEALTH_CRON_AUDIT_WRITE: "enabled",
    },
    fetchImpl: async (url, init = {}) => {
      assert.equal(String(url), "https://nwexsktuuenfdegzrbut.supabase.co/rest/v1/rpc/discordos_insert_runtime_health_cron_run");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.apikey, env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY);
      assert.equal(init.headers.Authorization, `Bearer ${env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY}`);
      const parsed = JSON.parse(init.body);
      assert.equal(parsed.payload.run_id, "runtime-health-cron-vercel-daily-runtime-health-20260613T040000000Z");
      assert.equal(parsed.payload.schedule_name, "vercel-daily-runtime-health");
      assert.equal(parsed.payload.status, "pass");
      assert.equal(parsed.payload.event_type, "discordos.runtime_health.cron_pass");
      assert.equal(parsed.payload.posture, "operational");
      assert.equal(parsed.payload.readiness_percent, 100);
      assert.deepEqual(parsed.payload.blocked_reasons, []);
      assert.equal(parsed.payload.alert_delivered, false);
      assert.equal(parsed.payload.artifact_written, false);
      assert.equal(parsed.payload.destructive, false);
      return response([
        {
          run_id: parsed.payload.run_id,
          generated_at: parsed.payload.generated_at,
        },
      ], { status: 201 });
    },
  });

  assert.equal(audit.ok, true);
  assert.equal(audit.enabled, true);
  assert.equal(audit.status, "written");
  assert.equal(audit.written, true);
  assert.equal(audit.runtime, "vercel-env-service-role");
  assert.equal(audit.httpStatus, 201);
  assert.equal(audit.runId, "runtime-health-cron-vercel-daily-runtime-health-20260613T040000000Z");
});

test("cron runtime health audit writer can use Supabase Edge persistence", async () => {
  const env = {
    ...operationalEnv(),
    DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "",
    DISCORDOS_RUNTIME_HEALTH_CRON_AUDIT_WRITE: "enabled",
  };
  const proof = await _internals.buildCronRuntimeHealthProof({
    env,
    now: new Date("2026-06-13T04:00:00.000Z"),
    fetchImpl: async (url) => {
      if (String(url).includes("/functions/v1/discordos-readiness")) {
        return response({
          supabaseProjectRef: readinessInternals.EXPECTED_SUPABASE_REF,
          serviceRoleKeyPresent: true,
          serviceRoleProbeOk: true,
          serviceRoleProbeReason: "service_role_private_schema_read_ok",
        });
      }
      if (String(url).includes("/users/@me")) {
        return response({ bot: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
  });

  const audit = await _internals.writeCronAuditRun({
    proof,
    env,
    fetchImpl: async (url, init = {}) => {
      assert.equal(String(url), "https://nwexsktuuenfdegzrbut.supabase.co/functions/v1/discordos-runtime-health-cron-audit");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.apikey, env.DISCORDOS_SUPABASE_ANON_KEY);
      assert.equal(init.headers.Authorization, `Bearer ${env.DISCORDOS_SUPABASE_ANON_KEY}`);
      const parsed = JSON.parse(init.body);
      assert.equal(parsed.run_id, "runtime-health-cron-vercel-daily-runtime-health-20260613T040000000Z");
      assert.equal(parsed.status, "pass");
      return response({
        ok: true,
        row: {
          run_id: parsed.run_id,
          generated_at: parsed.generated_at,
        },
      }, { status: 201 });
    },
  });

  assert.equal(audit.ok, true);
  assert.equal(audit.runtime, "supabase-edge-function");
  assert.equal(audit.status, "written");
  assert.equal(audit.runId, "runtime-health-cron-vercel-daily-runtime-health-20260613T040000000Z");
});

test("cron runtime health sends enabled critical alerts only", async () => {
  const env = {
    ...operationalEnv(),
    DISCORDOS_LIVE_TRAFFIC_PROOF_ID: "",
    DISCORDOS_RUNTIME_HEALTH_ALERT_SEND: "enabled",
    DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: "123",
    DISCORDOS_RUNTIME_HEALTH_ALERT_SUPPRESSION_DIR: await require("node:fs/promises").mkdtemp(
      require("node:path").join(require("node:os").tmpdir(), "discordos-cron-alert-suppression-")
    ),
  };
  const proof = await _internals.buildCronRuntimeHealthProof({
    env,
    now: new Date("2026-06-13T04:00:00.000Z"),
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes("/functions/v1/discordos-readiness")) {
        return response({
          supabaseProjectRef: readinessInternals.EXPECTED_SUPABASE_REF,
          serviceRoleKeyPresent: true,
          serviceRoleProbeOk: true,
          serviceRoleProbeReason: "service_role_private_schema_read_ok",
        });
      }
      if (String(url).includes("/users/@me")) {
        return response({ bot: true });
      }
      if (String(url).includes("/channels/123/messages")) {
        assert.equal(init.method, "POST");
        const parsed = JSON.parse(init.body);
        assert.equal(parsed.embeds[0].title, "DiscordOS Runtime Critical Alert");
        assert.deepEqual(parsed.allowed_mentions, { parse: [] });
        return response({ id: "message-1" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
  });

  assert.equal(proof.ok, false);
  assert.equal(proof.alert.severity, "critical");
  assert.equal(proof.alertDelivered, true);
  assert.equal(proof.alertDelivery.enabled, true);
  assert.equal(proof.alertDelivery.status, "sent");
  assert.equal(proof.alertDelivery.targetType, "discord_bot_channel");
  assert.equal(proof.alertDelivery.suppression.recordWritten, true);
});

test("cron runtime health proof fails when runtime is blocked", async () => {
  const proof = await _internals.buildCronRuntimeHealthProof({
    env: {},
    now: new Date("2026-06-13T04:00:00.000Z"),
    fetchImpl: async () => {
      throw new Error("should not fetch without config");
    },
  });

  assert.equal(proof.ok, false);
  assert.equal(proof.snapshot.posture, "action_required");
  assert.equal(proof.alert.event.type, "discordos.runtime_health.alert_triggered");
  assert.equal(proof.event.type, "discordos.runtime_health.cron_fail");
  assert(proof.alert.event.reasonCodes.includes("runtime_health_blocked_reasons_present"));
});

test("cron runtime health handler rejects non-GET requests", async () => {
  const req = { method: "POST", headers: {} };
  const res = createRes();

  await cronRuntimeHealth(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
  assert.equal(res.body.error, "METHOD_NOT_ALLOWED");
});
