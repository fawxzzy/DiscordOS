const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-next-work-recommender");
const { _internals: operatorInternals } = require("../scripts/discordos-operator-status");
const { _internals: updatePostInternals } = require("../scripts/discord-update-post");

async function writeJson(dir, fileName, payload) {
  await fs.writeFile(path.join(dir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeMarkdown(dir, fileName, markdown) {
  await fs.writeFile(path.join(dir, fileName), markdown, "utf8");
}

function baseOperatorStatus(overrides = {}) {
  return {
    ok: true,
    probeLive: false,
    runtime: {
      ok: true,
      eventType: "discordos.runtime_health.status_ready",
      posture: "operational",
      readinessPercent: 100,
      cronPubliclyLocked: true,
      alertTargetConfigured: false,
      nextActions: ["capture_first_real_scheduled_cron_run_after_schedule"],
    },
    publication: {
      ok: true,
      eventType: "discordos.publication.status_ready",
      status: "ready",
      toolchainStatus: "ready",
      channelSeparation: "separated",
      updatesTargetConfigured: false,
      alertsTargetConfigured: false,
      reasonCodes: [],
    },
    publicationAudit: {
      ok: true,
      eventType: "discordos.publication.audit_ready",
      status: "ready",
      scannedFiles: 1,
      auditedFiles: 1,
      publishedReceipts: 1,
      draftUpdateReceipts: 1,
      needsBackfill: 0,
      reasonCodes: [],
    },
    ...overrides,
  };
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

test("next work recommender args extend operator status args", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    ...operatorInternals.parseArgs([]),
    max: 5,
  });

  const parsed = _internals.parseArgs([
    "--json",
    "--base-url",
    "https://example.invalid/",
    "--max",
    "2",
    "--probe-live",
  ]);
  assert.equal(parsed.json, true);
  assert.equal(parsed.baseUrl, "https://example.invalid");
  assert.equal(parsed.max, 2);
  assert.equal(parsed.probeLive, true);
});

test("next work recommender ranks blocker repairs above routine probes", () => {
  const recommendations = _internals.recommendNextWork(baseOperatorStatus({
    ok: false,
    runtime: {
      ...baseOperatorStatus().runtime,
      ok: false,
    },
    publicationAudit: {
      ...baseOperatorStatus().publicationAudit,
      ok: false,
      needsBackfill: 1,
      reasonCodes: ["publication_receipt_backfill_needed"],
    },
  }));

  assert.equal(recommendations[0].id, "repair-runtime-or-cron-status");
  assert.equal(recommendations[1].id, "backfill-publication-receipts");
});

test("next work recommender recommends live probe and env checks for local-only ready status", () => {
  const recommendations = _internals.recommendNextWork(baseOperatorStatus(), { max: 4 });
  const ids = recommendations.map((recommendation) => recommendation.id);

  assert.deepEqual(ids, [
    "inspect-operator-env-readiness",
    "run-live-operator-status-probe",
    "refresh-scheduled-cron-proof",
    "verify-alert-target-env-in-operator-shell",
  ]);
});

test("next work recommender downgrades live env checks after receipt-backed proofs", () => {
  const receiptState = _internals.classifyReceiptState([
    "discordos-operator-live-status-proof-pass-50-2026-06-13.md",
    "discordos-live-target-admission-proof-pass-52-2026-06-13.md",
    "discordos-runtime-health-authorized-cron-proof-pass-53-2026-06-13.md",
  ]);
  const recommendations = _internals.recommendNextWork(baseOperatorStatus(), {
    max: 5,
    receiptState,
  });
  const ids = recommendations.map((recommendation) => recommendation.id);

  assert.deepEqual(receiptState, {
    liveOperatorStatusProof: true,
    liveTargetAdmissionProof: true,
    authorizedCronProof: true,
  });
  assert.equal(recommendations[0].id, "refresh-scheduled-cron-proof");
  assert(!ids.includes("run-live-operator-status-probe"));
  assert(!ids.includes("verify-alert-target-env-in-operator-shell"));
  assert(!ids.includes("verify-updates-target-env-in-operator-shell"));
  assert.equal(
    recommendations.find((recommendation) => recommendation.id === "inspect-operator-env-readiness").status,
    "deferred"
  );
});

test("next work recommender can build from live-shaped local fixtures", async () => {
  const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-next-work-health-"));
  const alertDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-next-work-alert-"));
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-next-work-docs-"));
  await writeJson(snapshotDir, "2026-06-13T04-00-00-000Z-pass.json", healthSnapshot());
  await writeJson(alertDir, "2026-06-13T04-00-00-000Z-ok.json", alertDecision());
  await writeMarkdown(docsDir, "discordos-updates-publication-live-post-pass-35.md", publicationReceipt());

  const result = await _internals.buildDiscordOSNextWorkRecommendations({
    baseUrl: "https://example.invalid",
    snapshotDir,
    alertDir,
    docsDir,
    limit: 20,
    keepCount: 50,
    keepDays: 30,
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

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.topRecommendation.id, "inspect-operator-env-readiness");
  assert.equal(result.event.type, "discordos.next_work.recommendations_ready");
});

test("next work recommender renders markdown without target secret values", () => {
  const result = {
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: "ready",
    operatorStatus: {
      ok: true,
    },
    topRecommendation: {
      id: "run-live-operator-status-probe",
    },
    reasonCodes: ["operator_status_local_only"],
    event: {
      type: "discordos.next_work.recommendations_ready",
      severity: "info",
    },
    recommendations: [
      _internals.buildRecommendation({
        id: "run-live-operator-status-probe",
        score: 80,
        category: "operator-proof",
        title: "Run live probe",
        command: "npm run ops:discordos:operator-status -- --probe-live",
        reasonCodes: ["operator_status_local_only"],
      }),
    ],
  };
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Next Work Recommendations"));
  assert(rendered.includes("run-live-operator-status-probe"));
  assert(!rendered.includes("bot-secret"));
});
