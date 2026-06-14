const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-operations-admission");
const { _internals: proofInternals } = require("../scripts/runtime-health-proof");
const { _internals: alertInternals } = require("../scripts/runtime-health-alert");
const { _internals: receiptStateInternals } = require("../scripts/discordos-receipt-state");

function rollup({ ok = true } = {}) {
  return {
    ok,
    health: {
      latest: {
        posture: ok ? "operational" : "action_required",
        readinessPercent: ok ? 100 : 83,
      },
    },
    alerts: {
      latest: {
        severity: ok ? "ok" : "critical",
        eventType: ok ? "discordos.runtime_health.alert_clear" : "discordos.runtime_health.alert_triggered",
      },
    },
  };
}

function retentionPlan({ eligibleForReview = 0 } = {}) {
  return {
    ok: true,
    policy: {
      action: "plan_only",
      keepCount: 50,
      keepDays: 30,
    },
    totals: {
      artifacts: 2,
      retain: 2 - eligibleForReview,
      eligibleForReview,
    },
  };
}

async function writeJson(dir, fileName, payload) {
  await fs.writeFile(path.join(dir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function healthSnapshot({ generatedAt = "2026-06-13T03:00:00.000Z" } = {}) {
  return {
    ok: true,
    summary: {
      generatedAt,
      posture: "operational",
      readinessPercent: 100,
      blockedReasons: [],
    },
    event: {
      type: "discordos.runtime_health.operational",
      severity: "info",
    },
  };
}

function alertDecision({ writtenAt = "2026-06-13T03:00:00.000Z" } = {}) {
  return {
    ok: true,
    severity: "ok",
    event: {
      type: "discordos.runtime_health.alert_clear",
      status: "clear",
      reasonCodes: [],
    },
    decision: {
      writtenAt,
    },
  };
}

test("operations admission args default to read-only runtime surfaces", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    limit: 20,
    keepCount: 50,
    keepDays: 30,
    docsDir: receiptStateInternals.DEFAULT_RECEIPT_DIR,
  });
});

test("operations admission args support docs dir", () => {
  const parsed = _internals.parseArgs(["--docs-dir", "."]);

  assert.equal(parsed.docsDir, path.resolve("."));
});

test("operations admission classifies alert delivery target without exposing it", () => {
  assert.deepEqual(_internals.getAlertTargetAdmission({}), {
    configured: false,
    type: "none",
    shapeValid: false,
    reasonCodes: ["alert_delivery_target_missing"],
  });
  assert.deepEqual(
    _internals.getAlertTargetAdmission({
      DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL:
        "https://discord.com/api/webhooks/123456789012345678/webhook-secret",
    }),
    {
      configured: true,
      type: "discord_webhook",
      shapeValid: true,
      reasonCodes: [],
    }
  );
});

test("operations admission allows scheduled proof when latest runtime state is green", () => {
  assert.deepEqual(_internals.decideScheduledProof(rollup()), {
    status: "admissible",
    reasonCodes: ["latest_runtime_health_green", "latest_alert_clear"],
  });
});

test("operations admission satisfies scheduled proof after audit receipt", () => {
  assert.deepEqual(
    _internals.decideScheduledProof(
      rollup(),
      receiptStateInternals.classifyReceiptState([
        "discordos-runtime-health-scheduled-audit-proof-pass-73-2026-06-14.md",
      ])
    ),
    {
      status: "satisfied",
      reasonCodes: [
        "scheduled_cron_audit_proof_receipt_present",
        "latest_runtime_health_green",
        "latest_alert_clear",
      ],
    }
  );
});

test("operations admission blocks alert delivery when no delivery target is configured", () => {
  assert.deepEqual(_internals.decideAlertDelivery({ rollup: rollup(), env: {} }), {
    status: "blocked",
    targetType: "none",
    reasonCodes: ["alert_delivery_target_missing"],
  });
});

test("operations admission blocks alert delivery when target shape is invalid", () => {
  assert.deepEqual(
    _internals.decideAlertDelivery({
      rollup: rollup(),
      env: {
        DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL: "https://example.invalid/webhook-secret",
      },
    }),
    {
      status: "blocked",
      targetType: "discord_webhook",
      reasonCodes: ["webhook_url_shape_invalid"],
    }
  );
});

test("operations admission requires confirmation before destructive retention enforcement", () => {
  assert.deepEqual(_internals.decideRetentionEnforcement(retentionPlan({ eligibleForReview: 1 })), {
    status: "requires_confirmation",
    reasonCodes: ["destructive_retention_requires_operator_confirmation"],
    eligibleForReview: 1,
  });
});

test("operations admission builds a no-side-effect decision plan", () => {
  const plan = _internals.buildAdmissionPlan({
    rollup: rollup(),
    retentionPlan: retentionPlan(),
    env: {},
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.destructive, false);
  assert.equal(plan.schedulerInstalled, false);
  assert.equal(plan.alertDelivered, false);
  assert.equal(plan.decisions.retentionEnforcement.status, "not_needed");
  assert.equal(plan.decisions.scheduledProof.status, "admissible");
  assert.equal(plan.receiptState.scheduledCronAuditProof, false);
  assert.equal(plan.decisions.alertDelivery.status, "blocked");
});

test("operations admission reads live-shaped artifact directories", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-admission-health-"));
  const alertDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-admission-alert-"));
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-admission-docs-"));
  await writeJson(snapshotDir, "2026-06-13T03-00-00-000Z-pass.json", healthSnapshot());
  await writeJson(alertDir, "2026-06-13T03-00-00-000Z-ok.json", alertDecision());
  await fs.writeFile(
    path.join(docsDir, "discordos-runtime-health-scheduled-audit-proof-pass-73-2026-06-14.md"),
    "# Scheduled audit proof\n",
    "utf8"
  );

  const plan = await _internals.buildRuntimeHealthOperationsAdmission({
    snapshotDir,
    alertDir,
    docsDir,
    limit: 20,
    keepCount: 50,
    keepDays: 30,
    env: {},
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.rollup.latestHealthPosture, "operational");
  assert.equal(plan.retention.artifacts, 2);
  assert.equal(plan.decisions.scheduledProof.status, "satisfied");
  assert.equal(plan.receiptState.scheduledCronAuditProof, true);
});

test("operations admission renders markdown without secret target values", () => {
  const rendered = _internals.renderMarkdown(
    _internals.buildAdmissionPlan({
      rollup: rollup(),
      retentionPlan: retentionPlan(),
      env: {
        DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL:
          "https://discord.com/api/webhooks/123456789012345678/webhook-secret",
      },
    })
  );

  assert(rendered.includes("# DiscordOS Runtime Health Operations Admission"));
  assert(rendered.includes("destructive: `false`"));
  assert(rendered.includes("alert delivery: `admissible`"));
  assert(rendered.includes("scheduled cron audit proof receipt: `false`"));
  assert(!rendered.includes("webhook-secret"));
});
