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
    atlasHealth: {
      ok: true,
      status: "ready",
      eventType: "atlas.health_status.ready",
      watchStatus: "healthy",
      targetCount: 5,
      passCount: 5,
      failCount: 0,
      criticalCount: 0,
      configuredSchedule: "0 16 * * *",
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
      attachedProducerCount: 4,
      readyAttachedProducerCount: 4,
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

test("next work recommender surfaces atlas health alert readiness blockers explicitly", () => {
  const recommendations = _internals.recommendNextWork(baseOperatorStatus({
    ok: false,
    atlasHealth: {
      ...baseOperatorStatus().atlasHealth,
      ok: false,
      status: "alert_env_action_required",
      alertReady: false,
      alertReadinessStatus: "env_action_required",
      reasonCodes: ["atlas_health_alert_send_env_disabled"],
    },
  }), { max: 3 });

  assert.equal(recommendations[0].id, "configure-atlas-health-alert-readiness");
  assert.equal(recommendations[0].category, "atlas-health");
  assert.deepEqual(recommendations[0].reasonCodes, ["atlas_health_alert_send_env_disabled"]);
});

test("next work recommender separates critical atlas health target blockers", () => {
  const recommendations = _internals.recommendNextWork(baseOperatorStatus({
    ok: false,
    atlasHealth: {
      ...baseOperatorStatus().atlasHealth,
      ok: false,
      status: "critical_targets",
      watchStatus: "critical_targets",
      criticalCount: 1,
      reasonCodes: ["http_status_not_ok"],
    },
  }), { max: 3 });

  assert.equal(recommendations[0].id, "repair-atlas-health-critical-targets");
  assert.equal(recommendations[0].category, "atlas-health");
  assert.deepEqual(recommendations[0].reasonCodes, ["http_status_not_ok"]);
});

test("next work recommender surfaces notification policy blockers explicitly", () => {
  const recommendations = _internals.recommendNextWork(baseOperatorStatus({
    ok: false,
    notificationPolicy: {
      ...baseOperatorStatus().notificationPolicy,
      ok: false,
      reasonCodes: ["notification_route_keys_not_unique"],
    },
  }), { max: 3 });

  assert.equal(recommendations[0].id, "repair-notification-policy-routes");
  assert.equal(recommendations[0].category, "notification-policy");
  assert.deepEqual(recommendations[0].reasonCodes, ["notification_route_keys_not_unique"]);
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
    scheduledCronIdentityGuard: false,
    scheduledCronAuditProof: false,
    runtimeOperationsAdmissionProof: false,
    finalFollowupUpdateProof: false,
    runtimeAlertDrillSurfaceProof: false,
    atlasHealthTargetFilterProof: false,
    publicationAuditGitDurabilityProof: false,
    operatorDashboardErgonomicsProof: false,
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

test("next work recommender surfaces operations admission when only deferred work remains", () => {
  const receiptState = _internals.classifyReceiptState([
    "discordos-operator-live-status-proof-pass-50-2026-06-13.md",
    "discordos-live-target-admission-proof-pass-52-2026-06-13.md",
    "discordos-runtime-health-authorized-cron-proof-pass-53-2026-06-13.md",
    "discordos-scheduled-cron-log-identity-guard-pass-58-2026-06-13.md",
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
    scheduledCronIdentityGuard: true,
    scheduledCronAuditProof: false,
    runtimeOperationsAdmissionProof: false,
    finalFollowupUpdateProof: false,
    runtimeAlertDrillSurfaceProof: false,
    atlasHealthTargetFilterProof: false,
    publicationAuditGitDurabilityProof: false,
    operatorDashboardErgonomicsProof: false,
  });
  assert.equal(recommendations[0].id, "inspect-runtime-operations-admission");
  assert.equal(recommendations[0].status, "recommended");
  assert(ids.includes("refresh-scheduled-cron-proof"));
  assert.equal(
    recommendations.find((recommendation) => recommendation.id === "refresh-scheduled-cron-proof").status,
    "deferred"
  );
  assert.deepEqual(
    recommendations.find((recommendation) => recommendation.id === "refresh-scheduled-cron-proof").reasonCodes,
    ["scheduled_cron_proof_waiting_for_identity"]
  );
});

test("next work recommender summarizes exhausted non-waiting work after operations admission receipt", () => {
  const receiptState = _internals.classifyReceiptState([
    "discordos-operator-live-status-proof-pass-50-2026-06-13.md",
    "discordos-live-target-admission-proof-pass-52-2026-06-13.md",
    "discordos-runtime-health-authorized-cron-proof-pass-53-2026-06-13.md",
    "discordos-scheduled-cron-log-identity-guard-pass-58-2026-06-13.md",
    "discordos-next-work-wait-state-ranking-pass-59-2026-06-13.md",
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
    scheduledCronIdentityGuard: true,
    scheduledCronAuditProof: false,
    runtimeOperationsAdmissionProof: true,
    finalFollowupUpdateProof: false,
    runtimeAlertDrillSurfaceProof: false,
    atlasHealthTargetFilterProof: false,
    publicationAuditGitDurabilityProof: false,
    operatorDashboardErgonomicsProof: false,
  });
  assert.equal(recommendations[0].id, "summarize-deferred-work-before-final-update");
  assert.equal(recommendations[0].status, "recommended");
  assert.deepEqual(recommendations[0].reasonCodes, ["non_waiting_work_exhausted"]);
  assert(!ids.includes("inspect-runtime-operations-admission"));
  assert(ids.includes("defer-final-update-post-until-end"));
  assert(ids.includes("refresh-scheduled-cron-proof"));
});

test("next work recommender leaves only scheduled cron proof deferred after final follow-up update", () => {
  const readyStatus = baseOperatorStatus({
    runtime: {
      ...baseOperatorStatus().runtime,
      alertTargetConfigured: true,
    },
    publication: {
      ...baseOperatorStatus().publication,
      updatesTargetConfigured: true,
      alertsTargetConfigured: true,
    },
    publicationAudit: {
      ...baseOperatorStatus().publicationAudit,
      publishedReceipts: 4,
      draftUpdateReceipts: 0,
      needsBackfill: 0,
    },
  });
  const receiptState = _internals.classifyReceiptState([
    "discordos-operator-live-status-proof-pass-50-2026-06-13.md",
    "discordos-live-target-admission-proof-pass-52-2026-06-13.md",
    "discordos-runtime-health-authorized-cron-proof-pass-53-2026-06-13.md",
    "discordos-scheduled-cron-log-identity-guard-pass-58-2026-06-13.md",
    "discordos-next-work-wait-state-ranking-pass-59-2026-06-13.md",
    "discordos-runtime-product-hardening-followup-live-post-pass-68-2026-06-13.md",
  ]);
  const recommendations = _internals.recommendNextWork(readyStatus, {
    max: 5,
    receiptState,
  });
  const ids = recommendations.map((recommendation) => recommendation.id);

  assert.deepEqual(receiptState, {
    liveOperatorStatusProof: true,
    liveTargetAdmissionProof: true,
    authorizedCronProof: true,
    scheduledCronIdentityGuard: true,
    scheduledCronAuditProof: false,
    runtimeOperationsAdmissionProof: true,
    finalFollowupUpdateProof: true,
    runtimeAlertDrillSurfaceProof: false,
    atlasHealthTargetFilterProof: false,
    publicationAuditGitDurabilityProof: false,
    operatorDashboardErgonomicsProof: false,
  });
  assert.deepEqual(ids, ["refresh-scheduled-cron-proof"]);
  assert.equal(recommendations[0].status, "deferred");
  assert.deepEqual(recommendations[0].reasonCodes, ["scheduled_cron_proof_waiting_for_identity"]);
});

test("next work recommender stops waiting after scheduled cron audit proof receipt", () => {
  const readyStatus = baseOperatorStatus({
    runtime: {
      ...baseOperatorStatus().runtime,
      alertTargetConfigured: true,
    },
    publication: {
      ...baseOperatorStatus().publication,
      updatesTargetConfigured: true,
      alertsTargetConfigured: true,
    },
    publicationAudit: {
      ...baseOperatorStatus().publicationAudit,
      publishedReceipts: 4,
      draftUpdateReceipts: 0,
      needsBackfill: 0,
    },
  });
  const receiptState = _internals.classifyReceiptState([
    "discordos-operator-live-status-proof-pass-50-2026-06-13.md",
    "discordos-live-target-admission-proof-pass-52-2026-06-13.md",
    "discordos-runtime-health-authorized-cron-proof-pass-53-2026-06-13.md",
    "discordos-scheduled-cron-log-identity-guard-pass-58-2026-06-13.md",
    "discordos-next-work-wait-state-ranking-pass-59-2026-06-13.md",
    "discordos-runtime-product-hardening-followup-live-post-pass-68-2026-06-13.md",
    "discordos-runtime-health-scheduled-audit-proof-pass-73-2026-06-14.md",
  ]);
  const recommendations = _internals.recommendNextWork(readyStatus, {
    max: 5,
    receiptState,
  });

  assert.equal(receiptState.scheduledCronAuditProof, true);
  assert.deepEqual(recommendations.map((recommendation) => recommendation.id), [
    "review-runtime-alert-drill-surface",
    "review-atlas-health-target-coverage",
    "audit-discord-publication-tooling-gaps",
    "inspect-operator-command-ergonomics",
  ]);
  assert.deepEqual(recommendations[0].reasonCodes, ["runtime_health_ready_for_alert_drill_review"]);
  assert.equal(recommendations[0].category, "runtime-alerts");
});

test("next work recommender advances past completed steady-state review receipts", () => {
  const readyStatus = baseOperatorStatus({
    runtime: {
      ...baseOperatorStatus().runtime,
      alertTargetConfigured: true,
      nextActions: ["continue_runtime_monitoring"],
    },
    publication: {
      ...baseOperatorStatus().publication,
      updatesTargetConfigured: true,
      alertsTargetConfigured: true,
    },
    publicationAudit: {
      ...baseOperatorStatus().publicationAudit,
      publishedReceipts: 4,
      draftUpdateReceipts: 0,
      needsBackfill: 0,
    },
  });
  const recommendations = _internals.recommendNextWork(readyStatus, {
    max: 4,
    receiptState: _internals.classifyReceiptState([
      "discordos-operator-live-status-proof-pass-50-2026-06-13.md",
      "discordos-live-target-admission-proof-pass-52-2026-06-13.md",
      "discordos-runtime-health-scheduled-audit-proof-pass-73-2026-06-14.md",
      "discordos-runtime-alert-drill-surface-pass-77-2026-06-14.md",
      "discordos-atlas-health-target-filter-pass-78-2026-06-14.md",
    ]),
  });

  assert.deepEqual(recommendations.map((recommendation) => recommendation.id), [
    "audit-discord-publication-tooling-gaps",
    "inspect-operator-command-ergonomics",
  ]);
  assert(!recommendations.some((recommendation) =>
    recommendation.id === "review-runtime-alert-drill-surface"
  ));
  assert(!recommendations.some((recommendation) =>
    recommendation.id === "review-atlas-health-target-coverage"
  ));
});

test("next work recommender advances past completed publication audit receipt", () => {
  const readyStatus = baseOperatorStatus({
    runtime: {
      ...baseOperatorStatus().runtime,
      alertTargetConfigured: true,
      nextActions: ["continue_runtime_monitoring"],
    },
    publication: {
      ...baseOperatorStatus().publication,
      updatesTargetConfigured: true,
      alertsTargetConfigured: true,
    },
    publicationAudit: {
      ...baseOperatorStatus().publicationAudit,
      publishedReceipts: 4,
      draftUpdateReceipts: 0,
      needsBackfill: 0,
      untrackedPublicationReceipts: 1,
    },
  });
  const recommendations = _internals.recommendNextWork(readyStatus, {
    max: 4,
    receiptState: _internals.classifyReceiptState([
      "discordos-operator-live-status-proof-pass-50-2026-06-13.md",
      "discordos-live-target-admission-proof-pass-52-2026-06-13.md",
      "discordos-runtime-health-scheduled-audit-proof-pass-73-2026-06-14.md",
      "discordos-runtime-alert-drill-surface-pass-77-2026-06-14.md",
      "discordos-atlas-health-target-filter-pass-78-2026-06-14.md",
      "discordos-publication-audit-git-durability-pass-80-2026-06-14.md",
    ]),
  });

  assert.deepEqual(recommendations.map((recommendation) => recommendation.id), [
    "inspect-operator-command-ergonomics",
  ]);
  assert.equal(recommendations[0].command, "npm run ops:discordos:dashboard:prod");
});

test("next work recommender exhausts steady-state reviews after operator dashboard receipt", () => {
  const readyStatus = baseOperatorStatus({
    runtime: {
      ...baseOperatorStatus().runtime,
      alertTargetConfigured: true,
      nextActions: ["continue_runtime_monitoring"],
    },
    publication: {
      ...baseOperatorStatus().publication,
      updatesTargetConfigured: true,
      alertsTargetConfigured: true,
    },
    publicationAudit: {
      ...baseOperatorStatus().publicationAudit,
      publishedReceipts: 4,
      draftUpdateReceipts: 0,
      needsBackfill: 0,
      untrackedPublicationReceipts: 1,
    },
  });
  const recommendations = _internals.recommendNextWork(readyStatus, {
    max: 4,
    receiptState: _internals.classifyReceiptState([
      "discordos-operator-live-status-proof-pass-50-2026-06-13.md",
      "discordos-live-target-admission-proof-pass-52-2026-06-13.md",
      "discordos-runtime-health-scheduled-audit-proof-pass-73-2026-06-14.md",
      "discordos-runtime-alert-drill-surface-pass-77-2026-06-14.md",
      "discordos-atlas-health-target-filter-pass-78-2026-06-14.md",
      "discordos-publication-audit-git-durability-pass-80-2026-06-14.md",
      "discordos-operator-dashboard-ergonomics-pass-81-2026-06-14.md",
    ]),
  });

  assert.deepEqual(recommendations, []);
});

test("next work recommender gives concrete steady-state hardening categories", () => {
  const readyStatus = baseOperatorStatus({
    runtime: {
      ...baseOperatorStatus().runtime,
      alertTargetConfigured: true,
      nextActions: ["continue_runtime_monitoring"],
    },
    publication: {
      ...baseOperatorStatus().publication,
      updatesTargetConfigured: true,
      alertsTargetConfigured: true,
    },
    publicationAudit: {
      ...baseOperatorStatus().publicationAudit,
      publishedReceipts: 4,
      draftUpdateReceipts: 0,
      needsBackfill: 0,
    },
  });
  const recommendations = _internals.recommendNextWork(readyStatus, {
    max: 3,
    receiptState: _internals.classifyReceiptState([
      "discordos-operator-live-status-proof-pass-50-2026-06-13.md",
      "discordos-live-target-admission-proof-pass-52-2026-06-13.md",
      "discordos-runtime-health-scheduled-audit-proof-pass-73-2026-06-14.md",
    ]),
  });

  assert.deepEqual(recommendations.map((recommendation) => recommendation.id), [
    "review-runtime-alert-drill-surface",
    "review-atlas-health-target-coverage",
    "audit-discord-publication-tooling-gaps",
  ]);
  assert.deepEqual(recommendations.map((recommendation) => recommendation.status), [
    "recommended",
    "recommended",
    "recommended",
  ]);
  assert.deepEqual(recommendations.map((recommendation) => recommendation.command), [
    "npm run ops:runtime-health:alert-delivery -- --drill-critical",
    "npm run ops:atlas-health:status",
    "npm run ops:discord:publication-audit",
  ]);
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
