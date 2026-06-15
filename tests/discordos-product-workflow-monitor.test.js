const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-product-workflow-monitor");

test("product workflow monitor parses live thresholds", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--live",
    "--min-board-cards",
    "1",
    "--min-moderation-audits",
    "2",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
  assert.equal(parsed.minBoardCards, 1);
  assert.equal(parsed.minModerationAudits, 2);
});

test("product workflow monitor is clear without live thresholds", async () => {
  const result = await _internals.buildProductWorkflowMonitor();

  assert.equal(result.ok, true);
  assert.equal(result.liveAttempted, false);
  assert.equal(result.status, "monitor_clear");
});

test("product workflow monitor detects threshold anomalies", async () => {
  const result = await _internals.buildProductWorkflowMonitor({
    live: true,
    minBoardCards: 2,
    minModerationAudits: 1,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        boardCardCount: 1,
        moderationAuditCount: 1,
        latestBoardCard: { cardId: "board-1" },
        latestModerationAudit: { caseId: "mod-1" },
        generatedAt: "2026-06-15T03:00:00Z",
      }),
    }),
  });

  assert.equal(result.ok, false);
  assert(result.anomalies.includes("board_card_count_below_threshold"));
});

test("product workflow monitor renders bounded markdown", async () => {
  const result = await _internals.buildProductWorkflowMonitor();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Product Workflow Monitor"));
  assert(rendered.includes("sends messages: `false`"));
});
