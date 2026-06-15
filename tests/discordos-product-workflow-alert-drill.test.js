const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-product-workflow-alert-drill");

test("product workflow alert drill parses monitor thresholds", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--min-board-cards",
    "1",
    "--min-moderation-audits",
    "1",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.minBoardCards, 1);
  assert.equal(parsed.minModerationAudits, 1);
});

test("product workflow alert drill routes anomaly without sending", async () => {
  const result = await _internals.buildProductWorkflowAlertDrill({
    minBoardCards: 1,
    minModerationAudits: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.alertWouldSend, true);
  assert.equal(result.notificationRoute.routeId, "product-workflow-monitor-critical-alert");
});

test("product workflow alert drill renders bounded markdown", async () => {
  const result = await _internals.buildProductWorkflowAlertDrill({
    minBoardCards: 1,
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Product Workflow Alert Drill"));
  assert(rendered.includes("sends messages: `false`"));
});
