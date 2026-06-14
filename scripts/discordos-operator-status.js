const path = require("node:path");
const {
  _internals: runtimeStatusInternals,
} = require("./runtime-health-status");
const {
  _internals: proofInternals,
} = require("./runtime-health-proof");
const {
  _internals: alertInternals,
} = require("./runtime-health-alert");
const {
  _internals: cronInternals,
} = require("./runtime-health-cron-production-proof");
const {
  _internals: publicationStatusInternals,
} = require("./discord-publication-status");
const {
  _internals: publicationAuditInternals,
} = require("./discord-publication-audit-rollup");
const {
  _internals: atlasHealthStatusInternals,
} = require("./atlas-health-status");
const {
  _internals: atlasHealthInternals,
} = require("./atlas-health-watch");

function parseArgs(args) {
  const options = {
    json: false,
    baseUrl: cronInternals.DEFAULT_BASE_URL,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    docsDir: publicationAuditInternals.DEFAULT_DOCS_DIR,
    limit: 20,
    keepCount: 50,
    keepDays: 30,
    probeLive: false,
    atlasConfigPath: atlasHealthInternals.DEFAULT_CONFIG_PATH,
    atlasTimeoutMs: atlasHealthInternals.DEFAULT_TIMEOUT_MS,
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
    } else if (arg === "--snapshot-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_snapshot_dir_value");
      }
      options.snapshotDir = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--alert-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_alert_dir_value");
      }
      options.alertDir = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--docs-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_docs_dir_value");
      }
      options.docsDir = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--limit") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("invalid_limit");
      }
      options.limit = value;
      index += 1;
    } else if (arg === "--keep-count") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("invalid_keep_count");
      }
      options.keepCount = value;
      index += 1;
    } else if (arg === "--keep-days") {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("invalid_keep_days");
      }
      options.keepDays = value;
      index += 1;
    } else if (arg === "--probe-live") {
      options.probeLive = true;
    } else if (arg === "--atlas-config") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_atlas_config_value");
      }
      options.atlasConfigPath = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--atlas-timeout-ms") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 100 || value > 60000) {
        throw new Error("invalid_atlas_timeout_ms");
      }
      options.atlasTimeoutMs = value;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function determineOperatorNextActions({
  runtimeStatus,
  publicationStatus,
  publicationAudit,
  atlasHealthStatus = { ok: true, nextActions: [] },
}) {
  const actions = [];

  if (!runtimeStatus.ok) {
    actions.push("repair_runtime_or_cron_status");
  }

  if (!publicationStatus.ok) {
    actions.push("repair_publication_target_or_channel_separation");
  }

  if (!publicationAudit.ok) {
    actions.push("backfill_publication_receipts");
  }

  if (!atlasHealthStatus.ok) {
    actions.push(...(atlasHealthStatus.nextActions || []));
  }

  if (publicationAudit.counts.draftUpdateReceipts > 0 && publicationAudit.counts.needsBackfill === 0) {
    actions.push("keep_update_drafts_until_next_public_post");
  }

  if (publicationAudit.counts.untrackedPublicationReceipts > 0) {
    actions.push("review_untracked_publication_receipts");
  }

  if (actions.length === 0) {
    actions.push("continue_discordos_runtime_product_hardening");
  }

  return actions;
}

function classifyOperatorStatusEvent(status) {
  return {
    type: status.ok
      ? "discordos.operator.status_ready"
      : "discordos.operator.status_action_required",
    severity: status.ok ? "info" : "warning",
    subject: "discordos.operator",
    status: status.ok ? "pass" : "fail",
    dimensions: {
      runtimeStatus: status.runtime.ok ? "pass" : "fail",
      publicationStatus: status.publication.ok ? "pass" : "fail",
      publicationAudit: status.publicationAudit.ok ? "pass" : "fail",
      atlasHealthStatus: status.atlasHealth.ok ? "pass" : "fail",
      nextActionCount: status.nextActions.length,
    },
  };
}

async function buildDiscordOSOperatorStatus({
  baseUrl = cronInternals.DEFAULT_BASE_URL,
  snapshotDir = proofInternals.DEFAULT_SNAPSHOT_DIR,
  alertDir = alertInternals.DEFAULT_ALERT_DIR,
  docsDir = publicationAuditInternals.DEFAULT_DOCS_DIR,
  limit = 20,
  keepCount = 50,
  keepDays = 30,
  probeLive = false,
  atlasConfigPath = atlasHealthInternals.DEFAULT_CONFIG_PATH,
  atlasTimeoutMs = atlasHealthInternals.DEFAULT_TIMEOUT_MS,
  env = process.env,
  fetchImpl = fetch,
  cwd = process.cwd(),
} = {}) {
  const [runtimeStatus, publicationStatus, publicationAudit, atlasHealthStatus] = await Promise.all([
    runtimeStatusInternals.buildRuntimeHealthStatus({
      baseUrl,
      snapshotDir,
      alertDir,
      docsDir,
      limit,
      keepCount,
      keepDays,
      probeLive,
      env,
      fetchImpl,
    }),
    publicationStatusInternals.buildDiscordPublicationStatus({
      env,
      probeLive,
      fetchImpl,
    }),
    publicationAuditInternals.buildDiscordPublicationAuditRollup({
      docsDir,
      cwd,
    }),
    atlasHealthStatusInternals.buildAtlasHealthStatus({
      configPath: atlasConfigPath,
      timeoutMs: atlasTimeoutMs,
      env,
      fetchImpl,
    }),
  ]);

  const status = {
    ok: runtimeStatus.ok && publicationStatus.ok && publicationAudit.ok && atlasHealthStatus.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    probeLive,
    runtime: {
      ok: runtimeStatus.ok,
      eventType: runtimeStatus.event.type,
      posture: runtimeStatus.runtimeHealth.posture,
      readinessPercent: runtimeStatus.runtimeHealth.readinessPercent,
      cronPubliclyLocked: runtimeStatus.cron.publiclyLocked,
      alertTargetConfigured: runtimeStatus.alertTarget.configured,
      nextActions: runtimeStatus.nextActions,
    },
    publication: {
      ok: publicationStatus.ok,
      eventType: publicationStatus.event.type,
      status: publicationStatus.status,
      toolchainStatus: publicationStatus.toolchain.status,
      channelSeparation: publicationStatus.channelSeparation.status,
      updatesTargetConfigured: publicationStatus.updatesTarget.target.configured,
      alertsTargetConfigured: publicationStatus.alertsTarget.target.configured,
      reasonCodes: publicationStatus.reasonCodes,
    },
    publicationAudit: {
      ok: publicationAudit.ok,
      eventType: publicationAudit.event.type,
      status: publicationAudit.status,
      scannedFiles: publicationAudit.counts.scannedFiles,
      auditedFiles: publicationAudit.counts.auditedFiles,
      publishedReceipts: publicationAudit.counts.publishedReceipts,
      draftUpdateReceipts: publicationAudit.counts.draftUpdateReceipts,
      needsBackfill: publicationAudit.counts.needsBackfill,
      untrackedPublicationReceipts: publicationAudit.counts.untrackedPublicationReceipts,
      reasonCodes: publicationAudit.reasonCodes,
    },
    atlasHealth: {
      ok: atlasHealthStatus.ok,
      eventType: atlasHealthStatus.event.type,
      cadenceStatus: atlasHealthStatus.watch.cadenceStatus,
      skipped: atlasHealthStatus.watch.skipped,
      skipReason: atlasHealthStatus.watch.skipReason,
      targetCount: atlasHealthStatus.watch.targetCount,
      passCount: atlasHealthStatus.watch.passCount,
      failCount: atlasHealthStatus.watch.failCount,
      criticalCount: atlasHealthStatus.watch.criticalCount,
      configuredSchedule: atlasHealthStatus.watch.usageEstimate.configuredSchedule,
      runDays: atlasHealthStatus.watch.runDays,
      timezone: atlasHealthStatus.watch.timezone,
      targetChecksPerMonth: atlasHealthStatus.watch.usageEstimate.targetChecksPerMonth,
      alertReady: atlasHealthStatus.alertReadiness.ready,
      alertTargetType: atlasHealthStatus.alertReadiness.targetType,
      nextActions: atlasHealthStatus.nextActions,
      reasonCodes: atlasHealthStatus.alertReadiness.reasonCodes,
    },
  };

  const nextActions = determineOperatorNextActions({
    runtimeStatus,
    publicationStatus,
    publicationAudit,
    atlasHealthStatus,
  });

  return {
    ...status,
    nextActions,
    event: classifyOperatorStatusEvent({
      ...status,
      nextActions,
    }),
  };
}

function renderMarkdown(status) {
  const lines = [
    "# DiscordOS Operator Status",
    "",
    `- result: \`${status.ok ? "pass" : "fail"}\``,
    `- destructive: \`${status.destructive ? "true" : "false"}\``,
    `- sends messages: \`${status.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${status.writesArtifacts ? "true" : "false"}\``,
    `- probe live: \`${status.probeLive ? "true" : "false"}\``,
    `- event type: \`${status.event.type}\``,
    `- event severity: \`${status.event.severity}\``,
    `- next actions: \`${status.nextActions.join(",")}\``,
    "",
    "## Runtime",
    "",
    `- result: \`${status.runtime.ok ? "pass" : "fail"}\``,
    `- event type: \`${status.runtime.eventType}\``,
    `- posture: \`${status.runtime.posture || "unknown"}\``,
    `- readiness percent: \`${status.runtime.readinessPercent ?? "unknown"}\``,
    `- cron publicly locked: \`${status.runtime.cronPubliclyLocked ? "true" : "false"}\``,
    `- alert target configured: \`${status.runtime.alertTargetConfigured ? "true" : "false"}\``,
    `- runtime next actions: \`${status.runtime.nextActions.join(",")}\``,
    "",
    "## Publication",
    "",
    `- result: \`${status.publication.ok ? "pass" : "fail"}\``,
    `- event type: \`${status.publication.eventType}\``,
    `- status: \`${status.publication.status}\``,
    `- toolchain status: \`${status.publication.toolchainStatus}\``,
    `- channel separation: \`${status.publication.channelSeparation}\``,
    `- updates target configured: \`${status.publication.updatesTargetConfigured ? "true" : "false"}\``,
    `- alerts target configured: \`${status.publication.alertsTargetConfigured ? "true" : "false"}\``,
    `- reason codes: \`${status.publication.reasonCodes.join(",") || "none"}\``,
    "",
    "## Publication Audit",
    "",
    `- result: \`${status.publicationAudit.ok ? "pass" : "fail"}\``,
    `- event type: \`${status.publicationAudit.eventType}\``,
    `- status: \`${status.publicationAudit.status}\``,
    `- scanned files: \`${status.publicationAudit.scannedFiles}\``,
    `- audited files: \`${status.publicationAudit.auditedFiles}\``,
    `- published receipts: \`${status.publicationAudit.publishedReceipts}\``,
    `- draft update receipts: \`${status.publicationAudit.draftUpdateReceipts}\``,
    `- needs backfill: \`${status.publicationAudit.needsBackfill}\``,
    `- untracked publication receipts: \`${status.publicationAudit.untrackedPublicationReceipts}\``,
    `- reason codes: \`${status.publicationAudit.reasonCodes.join(",") || "none"}\``,
    "",
    "## ATLAS Health",
    "",
    `- result: \`${status.atlasHealth.ok ? "pass" : "fail"}\``,
    `- event type: \`${status.atlasHealth.eventType}\``,
    `- cadence status: \`${status.atlasHealth.cadenceStatus}\``,
    `- skipped: \`${status.atlasHealth.skipped ? "true" : "false"}\``,
    `- skip reason: \`${status.atlasHealth.skipReason || "none"}\``,
    `- targets: \`${status.atlasHealth.targetCount}\``,
    `- passing: \`${status.atlasHealth.passCount}\``,
    `- failing: \`${status.atlasHealth.failCount}\``,
    `- critical: \`${status.atlasHealth.criticalCount}\``,
    `- configured schedule: \`${status.atlasHealth.configuredSchedule || "unknown"}\``,
    `- run days: \`${Array.isArray(status.atlasHealth.runDays) ? status.atlasHealth.runDays.join(",") || "all" : "all"}\``,
    `- timezone: \`${status.atlasHealth.timezone || "unknown"}\``,
    `- target checks per month: \`${status.atlasHealth.targetChecksPerMonth}\``,
    `- alert ready: \`${status.atlasHealth.alertReady ? "true" : "false"}\``,
    `- alert target type: \`${status.atlasHealth.alertTargetType}\``,
    `- next actions: \`${status.atlasHealth.nextActions.join(",")}\``,
    `- reason codes: \`${status.atlasHealth.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const status = await buildDiscordOSOperatorStatus(options);
    process.stdout.write(options.json ? `${JSON.stringify(status, null, 2)}\n` : renderMarkdown(status));
    if (!status.ok) {
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
    parseArgs,
    determineOperatorNextActions,
    classifyOperatorStatusEvent,
    buildDiscordOSOperatorStatus,
    renderMarkdown,
  },
};
