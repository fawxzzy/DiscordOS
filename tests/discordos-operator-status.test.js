const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-operator-status");
const { _internals: cronInternals } = require("../scripts/runtime-health-cron-production-proof");
const { _internals: proofInternals } = require("../scripts/runtime-health-proof");
const { _internals: alertInternals } = require("../scripts/runtime-health-alert");
const { _internals: auditInternals } = require("../scripts/discord-publication-audit-rollup");
const { _internals: updatePostInternals } = require("../scripts/discord-update-post");
const { _internals: atlasHealthInternals } = require("../scripts/atlas-health-watch");

async function writeJson(dir, fileName, payload) {
  await fs.writeFile(path.join(dir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeMarkdown(dir, fileName, markdown) {
  await fs.writeFile(path.join(dir, fileName), markdown, "utf8");
}

function healthSnapshot() {
  return {
    ok: true,
    summary: {
      generatedAt: "2026-06-13T04:00:00.000Z",
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

function alertDecision() {
  return {
    ok: true,
    severity: "ok",
    event: {
      type: "discordos.runtime_health.alert_clear",
      status: "clear",
      reasonCodes: [],
    },
    decision: {
      writtenAt: "2026-06-13T04:00:00.000Z",
    },
  };
}

function publicationReceipt() {
  return [
    "# Published Update",
    "",
    updatePostInternals.RECEIPT_BLOCK_START,
    "## Discord Publication",
    "",
    "- status: `sent`",
    "- sends messages: `true`",
    "- Discord HTTP status: `200`",
    "- channel id: `1504671871512346695`",
    "- message id: `1515396583846445097`",
    "- timestamp: `2026-06-13T16:45:00.296000+00:00`",
    "- mentions disabled: `true`",
    updatePostInternals.RECEIPT_BLOCK_END,
  ].join("\n");
}

test("operator status args default to read-only bundle inputs", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    baseUrl: cronInternals.DEFAULT_BASE_URL,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    docsDir: auditInternals.DEFAULT_DOCS_DIR,
    limit: 20,
    keepCount: 50,
    keepDays: 30,
    probeLive: false,
    atlasConfigPath: atlasHealthInternals.DEFAULT_CONFIG_PATH,
    atlasTimeoutMs: atlasHealthInternals.DEFAULT_TIMEOUT_MS,
  });
});

test("operator status args support json custom paths and live probe", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--base-url",
    "https://example.invalid/",
    "--snapshot-dir",
    ".",
    "--alert-dir",
    ".",
    "--docs-dir",
    ".",
    "--limit",
    "3",
    "--keep-count",
    "9",
    "--keep-days",
    "4",
    "--probe-live",
    "--atlas-config",
    ".",
    "--atlas-timeout-ms",
    "5000",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.baseUrl, "https://example.invalid");
  assert.equal(parsed.limit, 3);
  assert.equal(parsed.keepCount, 9);
  assert.equal(parsed.keepDays, 4);
  assert.equal(parsed.probeLive, true);
  assert.equal(parsed.atlasTimeoutMs, 5000);
});

test("operator status combines runtime, publication, and audit status", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-operator-health-"));
  const alertDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-operator-alert-"));
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-operator-docs-"));
  await writeJson(snapshotDir, "2026-06-13T04-00-00-000Z-pass.json", healthSnapshot());
  await writeJson(alertDir, "2026-06-13T04-00-00-000Z-ok.json", alertDecision());
  await writeMarkdown(docsDir, "discordos-updates-publication-live-post-pass-35.md", publicationReceipt());

  const status = await _internals.buildDiscordOSOperatorStatus({
    baseUrl: "https://example.invalid",
    snapshotDir,
    alertDir,
    docsDir,
    limit: 20,
    keepCount: 50,
    keepDays: 30,
    probeLive: false,
    env: {
      DISCORDOS_ATLAS_HEALTH_WATCH_ENABLED: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_SEND: "enabled",
      DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID: "123",
      DISCORDOS_BOT_TOKEN: "bot-token",
      DISCORDOS_ATLAS_HEALTH_TARGETS_JSON: JSON.stringify({
        version: 1,
        schedule: {
          cron: "0 16 * * *",
        },
        targets: [
          {
            id: "atlas-fixture",
            label: "ATLAS Fixture",
            owner: "ATLAS",
            url: "https://example.invalid/atlas-health",
            kind: "json-ok",
          },
        ],
      }),
    },
    fetchImpl: async (url) => {
      if (url === "https://example.invalid/api/runtime-health") {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            posture: "operational",
            readinessPercent: 100,
            blockedReasons: [],
            activation: {
              liveCutover: true,
              fitnessTrafficMoved: true,
            },
          }),
        };
      }
      if (url === "https://example.invalid/api/cron/runtime-health") {
        return {
          status: 401,
          json: async () => ({ error: "cron_secret_mismatch" }),
        };
      }
      if (url === "https://example.invalid/atlas-health") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error(`unexpected_url:${url}`);
    },
  });

  assert.equal(status.ok, true);
  assert.equal(status.destructive, false);
  assert.equal(status.sendsMessages, false);
  assert.equal(status.writesArtifacts, false);
  assert.equal(status.runtime.posture, "operational");
  assert.equal(status.publication.status, "ready");
  assert.equal(status.publicationAudit.publishedReceipts, 1);
  assert.equal(status.publicationAudit.untrackedPublicationReceipts, 0);
  assert.equal(status.atlasHealth.ok, true);
  assert.equal(status.atlasHealth.status, "ready");
  assert.equal(status.atlasHealth.watchStatus, "healthy");
  assert.equal(status.atlasHealth.targetCount, 1);
  assert.equal(status.atlasHealth.cadenceStatus, "checked");
  assert.equal(status.atlasHealth.skipped, false);
  assert.deepEqual(status.atlasHealth.runDays, []);
  assert.equal(status.atlasHealth.timezone, "UTC");
  assert.equal(status.atlasHealth.alertReady, true);
  assert.equal(status.atlasHealth.alertReadinessStatus, "ready");
  assert.equal(status.notificationPolicy.ok, true);
  assert.equal(status.notificationPolicy.routeCount, 4);
  assert.equal(status.notificationPolicy.readyAttachedProducerCount, 5);
  assert.equal(status.event.type, "discordos.operator.status_ready");
});

test("operator status surfaces publication blockers as next actions", () => {
  const actions = _internals.determineOperatorNextActions({
    runtimeStatus: { ok: true },
    publicationStatus: { ok: false },
    publicationAudit: {
      ok: false,
      counts: {
        draftUpdateReceipts: 0,
        needsBackfill: 1,
      },
    },
    atlasHealthStatus: {
      ok: true,
      nextActions: ["continue_atlas_health_monitoring"],
    },
  });

  assert.deepEqual(actions, [
    "repair_publication_target_or_channel_separation",
    "backfill_publication_receipts",
  ]);
});

test("operator status surfaces atlas health blockers as next actions", () => {
  const actions = _internals.determineOperatorNextActions({
    runtimeStatus: { ok: true },
    publicationStatus: { ok: true },
    publicationAudit: {
      ok: true,
      counts: {
        draftUpdateReceipts: 0,
        needsBackfill: 0,
      },
    },
    atlasHealthStatus: {
      ok: false,
      nextActions: ["enable_discordos_atlas_health_alert_send_env"],
    },
  });

  assert.deepEqual(actions, ["enable_discordos_atlas_health_alert_send_env"]);
});

test("operator status surfaces untracked publication receipts as next actions", () => {
  const actions = _internals.determineOperatorNextActions({
    runtimeStatus: { ok: true },
    publicationStatus: { ok: true },
    publicationAudit: {
      ok: true,
      counts: {
        draftUpdateReceipts: 0,
        needsBackfill: 0,
        untrackedPublicationReceipts: 1,
      },
    },
    atlasHealthStatus: {
      ok: true,
      nextActions: ["continue_atlas_health_monitoring"],
    },
  });

  assert.deepEqual(actions, ["review_untracked_publication_receipts"]);
});

test("operator status surfaces notification policy blockers as next actions", () => {
  const actions = _internals.determineOperatorNextActions({
    runtimeStatus: { ok: true },
    publicationStatus: { ok: true },
    publicationAudit: {
      ok: true,
      counts: {
        draftUpdateReceipts: 0,
        needsBackfill: 0,
        untrackedPublicationReceipts: 0,
      },
    },
    atlasHealthStatus: {
      ok: true,
      nextActions: ["continue_atlas_health_monitoring"],
    },
    notificationPolicyStatus: {
      ok: false,
    },
  });

  assert.deepEqual(actions, ["repair_notification_policy_routes"]);
});

test("operator status renders markdown without target secret values", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    probeLive: false,
    event: {
      type: "discordos.operator.status_ready",
      severity: "info",
    },
    nextActions: ["continue_discordos_runtime_product_hardening"],
    runtime: {
      ok: true,
      eventType: "discordos.runtime_health.status_ready",
      posture: "operational",
      readinessPercent: 100,
      cronPubliclyLocked: true,
      alertTargetConfigured: true,
      nextActions: ["continue_runtime_monitoring"],
    },
    publication: {
      ok: true,
      eventType: "discordos.publication.status_ready",
      status: "ready",
      toolchainStatus: "ready",
      channelSeparation: "separated",
      updatesTargetConfigured: true,
      alertsTargetConfigured: true,
      reasonCodes: [],
    },
    publicationAudit: {
      ok: true,
      eventType: "discordos.publication.audit_ready",
      status: "ready",
      scannedFiles: 1,
      auditedFiles: 1,
      publishedReceipts: 1,
      draftUpdateReceipts: 0,
      needsBackfill: 0,
      untrackedPublicationReceipts: 1,
      reasonCodes: [],
    },
    atlasHealth: {
      ok: true,
      status: "ready",
      eventType: "atlas.health_status.ready",
      watchStatus: "healthy",
      cadenceStatus: "checked",
      skipped: false,
      skipReason: null,
      targetCount: 5,
      passCount: 5,
      failCount: 0,
      criticalCount: 0,
      configuredSchedule: "0 16 * * *",
      runDays: [],
      timezone: "UTC",
      targetChecksPerMonth: 150,
      alertReady: true,
      alertReadinessStatus: "ready",
      alertTargetType: "discord_bot_channel",
      nextActions: ["continue_atlas_health_monitoring"],
      reasonCodes: [],
    },
    notificationPolicy: {
      ok: true,
      eventType: "discordos.notification.policy_ready",
      status: "ready",
      routeCount: 4,
      enabledRouteCount: 4,
      alertsRouteCount: 2,
      updatesRouteCount: 2,
      attachedProducerCount: 5,
      readyAttachedProducerCount: 5,
      reservedProducerCount: 0,
      reasonCodes: [],
    },
  });

  assert(rendered.includes("# DiscordOS Operator Status"));
  assert(rendered.includes("Publication Audit"));
  assert(rendered.includes("untracked publication receipts: `1`"));
  assert(rendered.includes("ATLAS Health"));
  assert(rendered.includes("Notification Policy"));
  assert(rendered.includes("attached producers: `5/5`"));
  assert(!rendered.includes("bot-secret"));
});
