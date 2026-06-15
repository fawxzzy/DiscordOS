const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-moderation-audit-dashboard");

test("moderation audit dashboard summarizes action and severity counts", () => {
  const summary = _internals.summarizeModerationRows([
    { caseId: "case-1", actionType: "warn", severity: "low" },
    { caseId: "case-2", actionType: "warn", severity: "medium" },
  ]);

  assert.equal(summary.actionCounts.warn, 2);
  assert.equal(summary.severityCounts.low, 1);
  assert.equal(summary.latestCaseId, "case-1");
});

test("moderation audit dashboard wraps dry search without export writes", async () => {
  const result = await _internals.buildModerationAuditDashboard({
    caseId: "case-1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.exportWrites, false);
  assert.equal(result.status, "dashboard_ready");
});

test("moderation audit dashboard renders bounded markdown", async () => {
  const result = await _internals.buildModerationAuditDashboard({ caseId: "case-1" });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Moderation Audit Dashboard"));
  assert(rendered.includes("export writes: `false`"));
});
