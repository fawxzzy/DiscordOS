const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-cron-authorized-proof");

const cronPayload = {
  ok: true,
  scheduleName: "vercel-daily-runtime-health",
  destructive: false,
  alertDelivered: false,
  artifactWritten: false,
  snapshot: {
    posture: "operational",
    readinessPercent: 100,
    blockedReasons: [],
    activation: {
      liveCutover: true,
      fitnessTrafficMoved: true,
    },
  },
  alert: {
    severity: "ok",
    event: {
      type: "discordos.runtime_health.alert_clear",
    },
  },
  alertDelivery: {
    enabled: true,
    status: "skipped_clear",
    targetType: "discord_bot_channel",
    sent: false,
    reasonCodes: ["alert_clear_delivery_not_requested"],
  },
  event: {
    type: "discordos.runtime_health.cron_pass",
  },
};

function response(payload, { status = 200 } = {}) {
  return {
    status,
    async json() {
      return payload;
    },
  };
}

test("authorized cron proof args default to production alias", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    baseUrl: _internals.DEFAULT_BASE_URL,
  });
});

test("authorized cron proof args support custom base url and json", () => {
  assert.deepEqual(_internals.parseArgs(["--json", "--base-url", "https://example.test/"]), {
    json: true,
    baseUrl: "https://example.test",
  });
});

test("authorized cron proof validates the no-side-effect cron payload", () => {
  assert.deepEqual(_internals.validateAuthorizedCronPayload(cronPayload), {
    ok: true,
    failures: [],
  });
});

test("authorized cron proof detects unsafe cron payload behavior", () => {
  const validation = _internals.validateAuthorizedCronPayload({
    ...cronPayload,
    alertDelivered: true,
    artifactWritten: true,
    destructive: true,
  });

  assert.equal(validation.ok, false);
  assert(validation.failures.includes("cron_proof_delivered_alert"));
  assert(validation.failures.includes("cron_proof_wrote_artifact"));
  assert(validation.failures.includes("cron_proof_not_non_destructive"));
});

test("authorized cron proof validates critical alert delivery gate state", () => {
  const validation = _internals.validateAuthorizedCronPayload({
    ...cronPayload,
    alertDelivery: {
      enabled: false,
      status: "disabled",
      targetType: "none",
      sent: false,
    },
  });

  assert.equal(validation.ok, false);
  assert(validation.failures.includes("cron_alert_delivery_not_enabled"));
  assert(validation.failures.includes("cron_alert_delivery_not_skipped_clear"));
  assert(validation.failures.includes("cron_alert_delivery_target_not_bot_channel"));
});

test("authorized cron proof rejects unexpected delivery sends in green proof", () => {
  const validation = _internals.validateAuthorizedCronPayload({
    ...cronPayload,
    alertDelivery: {
      enabled: true,
      status: "sent",
      targetType: "discord_bot_channel",
      sent: true,
    },
  });

  assert.equal(validation.ok, false);
  assert(validation.failures.includes("cron_alert_delivery_not_skipped_clear"));
  assert(validation.failures.includes("cron_alert_delivery_sent_unexpectedly"));
});

test("authorized cron proof requires cron secret", async () => {
  await assert.rejects(
    () =>
      _internals.fetchAuthorizedCronProof({
        baseUrl: "https://example.test",
        cronSecret: "",
        fetchImpl: async () => response(cronPayload),
      }),
    /missing_cron_secret/
  );
});

test("authorized cron proof sends bearer auth without exposing the secret in output", async () => {
  const proof = await _internals.fetchAuthorizedCronProof({
    baseUrl: "https://example.test",
    cronSecret: "cron-secret",
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://example.test/api/cron/runtime-health");
      assert.equal(init.headers.Authorization, "Bearer cron-secret");
      return response(cronPayload);
    },
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.httpStatus, 200);
  assert.equal(proof.event.type, "discordos.runtime_health.cron_authorized_proof_pass");
  assert(!JSON.stringify(proof).includes("cron-secret"));
});

test("authorized cron proof fails closed on non-200 cron response", async () => {
  const proof = await _internals.fetchAuthorizedCronProof({
    baseUrl: "https://example.test",
    cronSecret: "cron-secret",
    fetchImpl: async () => response({ ok: false, error: "cron_secret_mismatch" }, { status: 401 }),
  });

  assert.equal(proof.ok, false);
  assert.equal(proof.httpStatus, 401);
  assert.equal(proof.event.type, "discordos.runtime_health.cron_authorized_proof_fail");
});

test("authorized cron proof renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    baseUrl: "https://example.test",
    httpStatus: 200,
    event: {
      type: "discordos.runtime_health.cron_authorized_proof_pass",
      severity: "info",
    },
    summary: {
      scheduleName: "manual",
      posture: "operational",
      readinessPercent: 100,
      blockedReasons: [],
      liveCutover: true,
      fitnessTrafficMoved: true,
      alertEventType: "discordos.runtime_health.alert_clear",
      alertDeliveryEnabled: true,
      alertDeliveryStatus: "skipped_clear",
      alertDeliveryTargetType: "discord_bot_channel",
      alertDeliveryReasonCodes: ["alert_clear_delivery_not_requested"],
      cronEventType: "discordos.runtime_health.cron_pass",
      destructive: false,
      alertDelivered: false,
      artifactWritten: false,
    },
    validation: {
      failures: [],
    },
  });

  assert(rendered.includes("# DiscordOS Runtime Health Authorized Cron Proof"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("alert delivery enabled: `true`"));
  assert(rendered.includes("alert delivery status: `skipped_clear`"));
  assert(rendered.includes("alert delivered: `false`"));
});
