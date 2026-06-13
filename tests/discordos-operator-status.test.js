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
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.baseUrl, "https://example.invalid");
  assert.equal(parsed.limit, 3);
  assert.equal(parsed.keepCount, 9);
  assert.equal(parsed.keepDays, 4);
  assert.equal(parsed.probeLive, true);
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
    env: {},
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
  });

  assert.deepEqual(actions, [
    "repair_publication_target_or_channel_separation",
    "backfill_publication_receipts",
  ]);
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
      reasonCodes: [],
    },
  });

  assert(rendered.includes("# DiscordOS Operator Status"));
  assert(rendered.includes("Publication Audit"));
  assert(!rendered.includes("bot-secret"));
});
