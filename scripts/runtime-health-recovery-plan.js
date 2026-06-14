const { _internals: statusInternals } = require("./runtime-health-status");

const ACTION_COMMANDS = {
  restore_production_runtime_or_cron_guard: "npm run ops:runtime-health:cron-production-proof",
  capture_first_real_scheduled_cron_run_after_schedule: "npm run ops:runtime-health:cron-scheduled-log-proof",
  configure_runtime_health_alert_target: "npm run ops:runtime-health:alert-target-admission -- --probe-live",
  repair_runtime_health_alert_target: "npm run ops:runtime-health:alert-target-admission -- --probe-live",
  review_retention_enforcement: "npm run ops:runtime-health:retention-plan",
  continue_runtime_monitoring: "npm run ops:runtime-health:status",
};

function parseArgs(args) {
  return statusInternals.parseArgs(args);
}

function classifyRecoveryPriority(status) {
  if (!status.runtimeHealth || status.runtimeHealth.posture !== "operational") {
    return "critical";
  }
  if (!status.cron?.publiclyLocked) {
    return "critical";
  }
  if (Array.isArray(status.nextActions) && status.nextActions.some((action) =>
    action.startsWith("restore_") || action.startsWith("repair_")
  )) {
    return "warning";
  }
  if (Array.isArray(status.nextActions) && status.nextActions.some((action) =>
    action.startsWith("configure_") || action.startsWith("capture_") || action.startsWith("review_")
  )) {
    return "notice";
  }
  return "normal";
}

function buildRecoverySteps(status) {
  return (Array.isArray(status.nextActions) ? status.nextActions : []).map((action) => ({
    action,
    command: ACTION_COMMANDS[action] || "npm run ops:runtime-health:status",
    requiresSend: false,
    writesArtifacts: false,
  }));
}

function classifyRecoveryPlanEvent(plan) {
  return {
    type: plan.priority === "normal"
      ? "discordos.runtime_health.recovery_plan_clear"
      : "discordos.runtime_health.recovery_plan_ready",
    severity: plan.priority === "critical" ? "error" : plan.priority === "normal" ? "info" : "warning",
    subject: "discordos.runtime.recovery",
    status: plan.ok ? "pass" : "fail",
    dimensions: {
      priority: plan.priority,
      stepCount: plan.steps.length,
      runtimePosture: plan.runtime.posture || "unknown",
      cronPubliclyLocked: plan.runtime.cronPubliclyLocked,
    },
  };
}

function buildRecoveryPlanFromStatus(status) {
  const steps = buildRecoverySteps(status);
  const priority = classifyRecoveryPriority(status);
  const plan = {
    ok: status.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: status.ok ? "ready" : "action_required",
    priority,
    runtime: {
      posture: status.runtimeHealth.posture,
      readinessPercent: status.runtimeHealth.readinessPercent,
      cronPubliclyLocked: status.cron.publiclyLocked,
      alertTargetConfigured: status.alertTarget.configured,
    },
    steps,
    reasonCodes: steps.map((step) => step.action),
  };

  return {
    ...plan,
    event: classifyRecoveryPlanEvent(plan),
  };
}

async function buildRuntimeHealthRecoveryPlan(options = {}) {
  const status = await statusInternals.buildRuntimeHealthStatus(options);
  return buildRecoveryPlanFromStatus(status);
}

function renderMarkdown(plan) {
  const lines = [
    "# DiscordOS Runtime Recovery Plan",
    "",
    `- result: \`${plan.ok ? "pass" : "fail"}\``,
    `- destructive: \`${plan.destructive ? "true" : "false"}\``,
    `- sends messages: \`${plan.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${plan.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${plan.status}\``,
    `- priority: \`${plan.priority}\``,
    `- event type: \`${plan.event.type}\``,
    `- event severity: \`${plan.event.severity}\``,
    `- runtime posture: \`${plan.runtime.posture || "unknown"}\``,
    `- readiness percent: \`${plan.runtime.readinessPercent ?? "unknown"}\``,
    `- cron publicly locked: \`${plan.runtime.cronPubliclyLocked ? "true" : "false"}\``,
    `- alert target configured: \`${plan.runtime.alertTargetConfigured ? "true" : "false"}\``,
    "",
    "## Steps",
    "",
  ];

  for (const step of plan.steps) {
    lines.push(`- \`${step.action}\`: \`${step.command}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildRuntimeHealthRecoveryPlan(options);
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
    ACTION_COMMANDS,
    parseArgs,
    classifyRecoveryPriority,
    buildRecoverySteps,
    classifyRecoveryPlanEvent,
    buildRecoveryPlanFromStatus,
    buildRuntimeHealthRecoveryPlan,
    renderMarkdown,
  },
};
