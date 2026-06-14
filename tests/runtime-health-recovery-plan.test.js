const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-recovery-plan");

function status(overrides = {}) {
  return {
    ok: true,
    runtimeHealth: {
      posture: "operational",
      readinessPercent: 100,
    },
    cron: {
      publiclyLocked: true,
    },
    alertTarget: {
      configured: true,
    },
    nextActions: ["continue_runtime_monitoring"],
    ...overrides,
  };
}

test("runtime recovery plan reuses runtime status args", () => {
  const parsed = _internals.parseArgs(["--json", "--probe-live"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.probeLive, true);
});

test("runtime recovery plan classifies priority from status", () => {
  assert.equal(_internals.classifyRecoveryPriority(status()), "normal");
  assert.equal(_internals.classifyRecoveryPriority(status({
    nextActions: ["configure_runtime_health_alert_target"],
  })), "notice");
  assert.equal(_internals.classifyRecoveryPriority(status({
    nextActions: ["repair_runtime_health_alert_target"],
  })), "warning");
  assert.equal(_internals.classifyRecoveryPriority(status({
    runtimeHealth: {
      posture: "critical",
      readinessPercent: 40,
    },
  })), "critical");
  assert.equal(_internals.classifyRecoveryPriority(status({
    cron: {
      publiclyLocked: false,
    },
  })), "critical");
});

test("runtime recovery plan builds command-backed steps without side effects", () => {
  const plan = _internals.buildRecoveryPlanFromStatus(status({
    nextActions: [
      "capture_first_real_scheduled_cron_run_after_schedule",
      "review_retention_enforcement",
    ],
  }));

  assert.equal(plan.ok, true);
  assert.equal(plan.destructive, false);
  assert.equal(plan.sendsMessages, false);
  assert.equal(plan.writesArtifacts, false);
  assert.equal(plan.priority, "notice");
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].command, "npm run ops:runtime-health:cron-scheduled-log-proof");
  assert.equal(plan.event.type, "discordos.runtime_health.recovery_plan_ready");
});

test("runtime recovery plan renders markdown without target values", () => {
  const plan = _internals.buildRecoveryPlanFromStatus(status({
    alertTarget: {
      configured: false,
    },
    nextActions: ["configure_runtime_health_alert_target"],
  }));
  const rendered = _internals.renderMarkdown(plan);

  assert(rendered.includes("# DiscordOS Runtime Recovery Plan"));
  assert(rendered.includes("priority: `notice`"));
  assert(rendered.includes("configure_runtime_health_alert_target"));
  assert(!rendered.includes("webhook-secret"));
});
