const {
  _internals: operatorStatusInternals,
} = require("./discordos-operator-status");
const {
  _internals: receiptStateInternals,
} = require("./discordos-receipt-state");

function parseArgs(args) {
  let max = 5;
  const operatorArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--max") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("invalid_max");
      }
      max = value;
      index += 1;
    } else {
      operatorArgs.push(arg);
      if (args[index + 1] && !args[index + 1].startsWith("--")) {
        operatorArgs.push(args[index + 1]);
        index += 1;
      }
    }
  }

  return {
    ...operatorStatusInternals.parseArgs(operatorArgs),
    max,
  };
}

function buildRecommendation({
  id,
  score,
  status = "recommended",
  category,
  title,
  command = null,
  reasonCodes = [],
  evidence = {},
}) {
  return {
    id,
    score,
    status,
    category,
    title,
    command,
    reasonCodes,
    evidence,
  };
}

function addIf(condition, recommendations, recommendation) {
  if (condition) {
    recommendations.push(recommendation);
  }
}

function rankRecommendations(recommendations, max = 5) {
  return recommendations
    .slice()
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, max);
}

function buildSteadyStateRecommendations(operatorStatus) {
  return [
    buildRecommendation({
      id: "review-runtime-alert-drill-surface",
      score: 58,
      category: "runtime-alerts",
      title: "Review the runtime alert drill surface while production health is green",
      command: "npm run ops:runtime-health:alert-delivery -- --drill-critical",
      reasonCodes: ["runtime_health_ready_for_alert_drill_review"],
      evidence: {
        posture: operatorStatus.runtime.posture,
        readinessPercent: operatorStatus.runtime.readinessPercent,
        alertTargetConfigured: operatorStatus.runtime.alertTargetConfigured,
      },
    }),
    buildRecommendation({
      id: "review-atlas-health-target-coverage",
      score: 56,
      category: "atlas-health",
      title: "Review ATLAS health target coverage and cadence for missing critical surfaces",
      command: "npm run ops:atlas-health:status",
      reasonCodes: ["atlas_health_ready_for_coverage_review"],
      evidence: {
        targetCount: operatorStatus.atlasHealth?.targetCount ?? null,
        criticalCount: operatorStatus.atlasHealth?.criticalCount ?? null,
        targetChecksPerMonth: operatorStatus.atlasHealth?.targetChecksPerMonth ?? null,
      },
    }),
    buildRecommendation({
      id: "audit-discord-publication-tooling-gaps",
      score: 54,
      category: "publication",
      title: "Audit Discord publication tooling for the next command or post-format gap",
      command: "npm run ops:discord:publication-audit",
      reasonCodes: ["publication_ready_for_tooling_gap_review"],
      evidence: {
        publishedReceipts: operatorStatus.publicationAudit.publishedReceipts,
        draftUpdateReceipts: operatorStatus.publicationAudit.draftUpdateReceipts,
        needsBackfill: operatorStatus.publicationAudit.needsBackfill,
      },
    }),
    buildRecommendation({
      id: "inspect-operator-command-ergonomics",
      score: 52,
      category: "operator-env",
      title: "Inspect operator command ergonomics for the next low-friction workflow improvement",
      command: "npm run ops:discordos:operator-status",
      reasonCodes: ["operator_status_ready_for_command_ergonomics"],
      evidence: {
        runtimeOk: operatorStatus.runtime.ok,
        publicationOk: operatorStatus.publication.ok,
        atlasHealthOk: operatorStatus.atlasHealth?.ok === true,
      },
    }),
  ];
}

function recommendNextWork(operatorStatus, { max = 5, receiptState = receiptStateInternals.classifyReceiptState([]) } = {}) {
  const recommendations = [];

  addIf(!operatorStatus.runtime.ok, recommendations, buildRecommendation({
    id: "repair-runtime-or-cron-status",
    score: 100,
    category: "runtime",
    title: "Repair runtime-health or cron guard status before new product work",
    command: "npm run ops:runtime-health:status",
    reasonCodes: ["runtime_status_not_ready"],
    evidence: {
      runtimeEventType: operatorStatus.runtime.eventType,
      posture: operatorStatus.runtime.posture,
      cronPubliclyLocked: operatorStatus.runtime.cronPubliclyLocked,
    },
  }));

  addIf(!operatorStatus.publicationAudit.ok, recommendations, buildRecommendation({
    id: "backfill-publication-receipts",
    score: 95,
    category: "publication",
    title: "Backfill or repair publication receipts with missing Discord message metadata",
    command: "npm run ops:discord:publication-audit",
    reasonCodes: operatorStatus.publicationAudit.reasonCodes.length
      ? operatorStatus.publicationAudit.reasonCodes
      : ["publication_audit_not_ready"],
    evidence: {
      needsBackfill: operatorStatus.publicationAudit.needsBackfill,
      auditedFiles: operatorStatus.publicationAudit.auditedFiles,
    },
  }));

  addIf(!operatorStatus.publication.ok, recommendations, buildRecommendation({
    id: "repair-publication-target-or-separation",
    score: 90,
    category: "publication",
    title: "Repair publication target readiness or updates/alerts separation",
    command: "npm run ops:discord:publication-status -- --probe-live",
    reasonCodes: operatorStatus.publication.reasonCodes.length
      ? operatorStatus.publication.reasonCodes
      : ["publication_status_not_ready"],
    evidence: {
      publicationStatus: operatorStatus.publication.status,
      channelSeparation: operatorStatus.publication.channelSeparation,
    },
  }));

  addIf(!operatorStatus.atlasHealth?.ok, recommendations, buildRecommendation({
    id: "repair-atlas-health-status",
    score: 88,
    category: "atlas-health",
    title: "Repair ATLAS health watch targets or alert readiness",
    command: "npm run ops:atlas-health:status",
    reasonCodes: operatorStatus.atlasHealth?.reasonCodes?.length
      ? operatorStatus.atlasHealth.reasonCodes
      : ["atlas_health_status_not_ready"],
    evidence: {
      targetCount: operatorStatus.atlasHealth?.targetCount ?? null,
      criticalCount: operatorStatus.atlasHealth?.criticalCount ?? null,
      alertReady: operatorStatus.atlasHealth?.alertReady === true,
    },
  }));

  addIf(
    operatorStatus.ok
      && (!operatorStatus.runtime.alertTargetConfigured || !operatorStatus.publication.updatesTargetConfigured),
    recommendations,
    buildRecommendation({
      id: "inspect-operator-env-readiness",
      score: 85,
      category: "operator-env",
      title: "Inspect operator env readiness before attempting live Discord target probes",
      command: "npm run ops:discordos:env-readiness",
      reasonCodes: ["operator_env_not_loaded"],
      evidence: {
        runtimeAlertTargetConfigured: operatorStatus.runtime.alertTargetConfigured,
        updatesTargetConfigured: operatorStatus.publication.updatesTargetConfigured,
      },
    })
  );

  if (
    operatorStatus.ok
      && receiptState.liveTargetAdmissionProof
      && (!operatorStatus.runtime.alertTargetConfigured || !operatorStatus.publication.updatesTargetConfigured)
  ) {
    const envRecommendation = recommendations.find((recommendation) =>
      recommendation.id === "inspect-operator-env-readiness"
    );
    if (envRecommendation) {
      envRecommendation.score = 25;
      envRecommendation.status = "deferred";
      envRecommendation.title = "Reload operator env only when the next live Discord action needs it";
      envRecommendation.reasonCodes = ["operator_env_not_loaded_after_live_target_proof"];
    }
  }

  addIf(operatorStatus.ok && !operatorStatus.probeLive && !receiptState.liveOperatorStatusProof, recommendations, buildRecommendation({
    id: "run-live-operator-status-probe",
    score: 80,
    category: "operator-proof",
    title: "Run the combined operator status with live target probes before public posting",
    command: "npm run ops:discordos:operator-status -- --probe-live",
    reasonCodes: ["operator_status_local_only"],
    evidence: {
      currentProbeLive: operatorStatus.probeLive,
      publicationStatus: operatorStatus.publication.status,
      publicationAuditStatus: operatorStatus.publicationAudit.status,
    },
  }));

  addIf(
    operatorStatus.runtime.nextActions.includes("capture_first_real_scheduled_cron_run_after_schedule")
      && !receiptState.scheduledCronAuditProof,
    recommendations,
    buildRecommendation({
    id: "refresh-scheduled-cron-proof",
    score: receiptState.scheduledCronIdentityGuard ? 20 : 70,
    status: receiptState.scheduledCronIdentityGuard ? "deferred" : "recommended",
    category: "runtime",
    title: receiptState.scheduledCronIdentityGuard
      ? "Refresh scheduled cron proof after a real Vercel Cron identity signal appears"
      : "Refresh scheduled cron proof when the next production schedule window lands",
    command: "npm run ops:runtime-health:cron-scheduled-log-proof",
    reasonCodes: [
      receiptState.scheduledCronIdentityGuard
        ? "scheduled_cron_proof_waiting_for_identity"
        : "scheduled_cron_proof_recommended",
    ],
    evidence: {
      runtimeNextActions: operatorStatus.runtime.nextActions,
      scheduledCronIdentityGuard: receiptState.scheduledCronIdentityGuard,
    },
  }));

  addIf(
    !operatorStatus.runtime.alertTargetConfigured
      && !operatorStatus.publication.alertsTargetConfigured
      && !receiptState.liveTargetAdmissionProof,
    recommendations,
    buildRecommendation({
      id: "verify-alert-target-env-in-operator-shell",
      score: 65,
      category: "runtime",
      title: "Verify alert target env in the operator shell before live alert delivery checks",
      command: "npm run ops:runtime-health:alert-target-admission -- --probe-live",
      reasonCodes: ["alert_target_not_configured_in_current_shell"],
      evidence: {
        runtimeAlertTargetConfigured: operatorStatus.runtime.alertTargetConfigured,
        publicationAlertsTargetConfigured: operatorStatus.publication.alertsTargetConfigured,
      },
    })
  );

  addIf(
    !operatorStatus.publication.updatesTargetConfigured
      && operatorStatus.publication.channelSeparation === "separated"
      && !receiptState.liveTargetAdmissionProof,
    recommendations,
    buildRecommendation({
      id: "verify-updates-target-env-in-operator-shell",
      score: 60,
      category: "publication",
      title: "Verify updates target env in the operator shell before the next live update post",
      command: "npm run ops:discord:update-target-admission -- --probe-live",
      reasonCodes: ["updates_target_not_configured_in_current_shell"],
      evidence: {
        updatesTargetConfigured: operatorStatus.publication.updatesTargetConfigured,
        channelSeparation: operatorStatus.publication.channelSeparation,
      },
    })
  );

  addIf(
    operatorStatus.ok
      && operatorStatus.publicationAudit.draftUpdateReceipts > 0
      && operatorStatus.publicationAudit.needsBackfill === 0,
    recommendations,
    buildRecommendation({
      id: "defer-final-update-post-until-end",
      score: 30,
      status: "deferred",
      category: "publication",
      title: "Keep the current update draft as end-of-run material instead of posting mid-stream",
      command: "npm run ops:discord:publication-audit",
      reasonCodes: ["draft_update_receipt_present_without_backfill_gap"],
      evidence: {
        draftUpdateReceipts: operatorStatus.publicationAudit.draftUpdateReceipts,
        needsBackfill: operatorStatus.publicationAudit.needsBackfill,
      },
    })
  );

  if (
    operatorStatus.ok
      && recommendations.length > 0
      && recommendations.every((recommendation) => recommendation.status === "deferred")
  ) {
    if (!receiptState.runtimeOperationsAdmissionProof) {
      recommendations.push(buildRecommendation({
        id: "inspect-runtime-operations-admission",
        score: 55,
        category: "runtime",
        title: "Inspect runtime operations admission for current non-waiting maintenance gates",
        command: "npm run ops:runtime-health:admission",
        reasonCodes: ["only_deferred_recommendations_remain"],
        evidence: {
          deferredRecommendationIds: recommendations.map((recommendation) => recommendation.id),
        },
      }));
    } else if (!receiptState.finalFollowupUpdateProof) {
      recommendations.push(buildRecommendation({
        id: "summarize-deferred-work-before-final-update",
        score: 45,
        category: "runtime-product",
        title: "Summarize deferred work and confirm no non-waiting runtime/product moves remain",
        command: "npm run ops:discordos:next-work",
        reasonCodes: ["non_waiting_work_exhausted"],
        evidence: {
          deferredRecommendationIds: recommendations.map((recommendation) => recommendation.id),
          runtimeOperationsAdmissionProof: true,
        },
      }));
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(...buildSteadyStateRecommendations(operatorStatus));
  }

  return rankRecommendations(recommendations, max);
}

function classifyNextWorkEvent(result) {
  return {
    type: result.operatorStatus.ok
      ? "discordos.next_work.recommendations_ready"
      : "discordos.next_work.action_required",
    severity: result.operatorStatus.ok ? "info" : "warning",
    subject: "discordos.next_work",
    status: result.operatorStatus.ok ? "pass" : "fail",
    dimensions: {
      recommendationCount: result.recommendations.length,
      topRecommendation: result.topRecommendation?.id || "none",
      operatorStatus: result.operatorStatus.ok ? "pass" : "fail",
    },
  };
}

async function buildDiscordOSNextWorkRecommendations({
  max = 5,
  ...operatorOptions
} = {}) {
  const operatorStatus = await operatorStatusInternals.buildDiscordOSOperatorStatus(operatorOptions);
  const receiptState = await receiptStateInternals.readReceiptState(operatorOptions.docsDir);
  const recommendations = recommendNextWork(operatorStatus, { max, receiptState });
  const result = {
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: "ready",
    operatorStatus: {
      ok: operatorStatus.ok,
      eventType: operatorStatus.event.type,
      probeLive: operatorStatus.probeLive,
      runtimeOk: operatorStatus.runtime.ok,
      publicationOk: operatorStatus.publication.ok,
      publicationAuditOk: operatorStatus.publicationAudit.ok,
      atlasHealthOk: operatorStatus.atlasHealth?.ok === true,
    },
    receiptState,
    recommendations,
    topRecommendation: recommendations[0] || null,
    reasonCodes: [...new Set(recommendations.flatMap((recommendation) => recommendation.reasonCodes))],
  };

  return {
    ...result,
    event: classifyNextWorkEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Next Work Recommendations",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- operator status: \`${result.operatorStatus.ok ? "pass" : "fail"}\``,
    `- top recommendation: \`${result.topRecommendation?.id || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
    "## Recommendations",
    "",
  ];

  if (result.recommendations.length === 0) {
    lines.push("- none");
  } else {
    for (const recommendation of result.recommendations) {
      lines.push(`- \`${recommendation.id}\` score \`${recommendation.score}\` status \`${recommendation.status}\` category \`${recommendation.category}\``);
      lines.push(`  title: ${recommendation.title}`);
      if (recommendation.command) {
        lines.push(`  command: \`${recommendation.command}\``);
      }
      lines.push(`  reason codes: \`${recommendation.reasonCodes.join(",") || "none"}\``);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordOSNextWorkRecommendations(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) {
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
    buildRecommendation,
    rankRecommendations,
    buildSteadyStateRecommendations,
    classifyReceiptState: receiptStateInternals.classifyReceiptState,
    readReceiptState: receiptStateInternals.readReceiptState,
    recommendNextWork,
    classifyNextWorkEvent,
    buildDiscordOSNextWorkRecommendations,
    renderMarkdown,
  },
};
