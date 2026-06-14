const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-operator-dashboard");

function nextWorkResult(overrides = {}) {
  return {
    ok: true,
    operatorStatus: {
      ok: true,
      eventType: "discordos.operator.status_ready",
      probeLive: false,
      runtimeOk: true,
      publicationOk: true,
      publicationAuditOk: true,
      atlasHealthOk: true,
      notificationPolicyOk: true,
    },
    status: "ready",
    reasonCodes: ["operator_status_ready_for_command_ergonomics"],
    recommendations: [
      {
        id: "inspect-operator-command-ergonomics",
        score: 52,
        status: "recommended",
        category: "operator-env",
        title: "Inspect operator command ergonomics for the next low-friction workflow improvement",
        command: "npm run ops:discordos:dashboard:prod",
        reasonCodes: ["operator_status_ready_for_command_ergonomics"],
      },
    ],
    topRecommendation: {
      id: "inspect-operator-command-ergonomics",
      command: "npm run ops:discordos:dashboard:prod",
      reasonCodes: ["operator_status_ready_for_command_ergonomics"],
    },
    receiptState: {},
    ...overrides,
  };
}

test("operator dashboard args reuse next-work args", () => {
  const parsed = _internals.parseArgs(["--json", "--max", "1", "--probe-live"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.max, 1);
  assert.equal(parsed.probeLive, true);
});

test("operator dashboard summarizes next-work result into command hint", async () => {
  const original = nextWorkResult();
  const dashboard = {
    ok: original.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: original.operatorStatus.ok ? "ready" : "action_required",
    operator: _internals.buildOperatorSummary(original),
    nextWork: {
      status: original.status,
      recommendationCount: original.recommendations.length,
      topRecommendationId: original.topRecommendation.id,
      reasonCodes: original.reasonCodes,
    },
    commandHint: _internals.buildCommandHint(original.topRecommendation),
    recommendations: original.recommendations,
    receiptState: original.receiptState,
  };
  const event = _internals.classifyDashboardEvent(dashboard);

  assert.equal(dashboard.operator.runtimeOk, true);
  assert.equal(dashboard.operator.notificationPolicyOk, true);
  assert.equal(dashboard.nextWork.recommendationCount, 1);
  assert.equal(dashboard.commandHint.command, "npm run ops:discordos:dashboard:prod");
  assert.equal(event.type, "discordos.operator.dashboard_ready");
  assert.equal(event.dimensions.topRecommendation, "inspect-operator-command-ergonomics");
});

test("operator dashboard renders compact markdown without target values", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: "ready",
    event: {
      type: "discordos.operator.dashboard_ready",
      severity: "info",
    },
    operator: _internals.buildOperatorSummary(nextWorkResult()),
    nextWork: {
      recommendationCount: 1,
      topRecommendationId: "inspect-operator-command-ergonomics",
      reasonCodes: ["operator_status_ready_for_command_ergonomics"],
    },
    commandHint: {
      command: "npm run ops:discordos:dashboard:prod",
    },
  });

  assert(rendered.includes("# DiscordOS Operator Dashboard"));
  assert(rendered.includes("runtime: `pass`"));
  assert(rendered.includes("notification policy: `pass`"));
  assert(rendered.includes("top recommendation: `inspect-operator-command-ergonomics`"));
  assert(rendered.includes("command: `npm run ops:discordos:dashboard:prod`"));
  assert(!rendered.includes("bot-secret"));
});
