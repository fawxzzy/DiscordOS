const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-product-workflow-live-readback");

test("product workflow live readback parses live flag", () => {
  const parsed = _internals.parseArgs(["--json", "--live"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
});

test("product workflow live readback is ready without live fetch by default", async () => {
  const result = await _internals.buildProductWorkflowLiveReadback();

  assert.equal(result.ok, true);
  assert.equal(result.liveAttempted, false);
  assert.equal(result.status, "ready_for_live_readback");
  assert.equal(result.summary.boardCardCount, 0);
});

test("product workflow live readback fetches service-role RPC when live", async () => {
  const calls = [];
  const result = await _internals.buildProductWorkflowLiveReadback({
    live: true,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          boardCardCount: 1,
          moderationAuditCount: 2,
          latestBoardCard: { cardId: "board-1" },
          latestModerationAudit: { caseId: "mod-1" },
          generatedAt: "2026-06-15T01:30:00Z",
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.liveAttempted, true);
  assert.equal(result.status, "readback_loaded");
  assert.equal(result.summary.boardCardCount, 1);
  assert.equal(result.summary.moderationAuditCount, 2);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/discordos_get_product_workflow_readback");
});

test("product workflow live readback can use explicit edge RPC bridge", async () => {
  const calls = [];
  const result = await _internals.buildProductWorkflowLiveReadback({
    live: true,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_ANON_KEY: "anon-key",
      DISCORDOS_SUPABASE_WORKFLOW_RPC_EDGE: "enabled",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          payload: {
            boardCardCount: 3,
            moderationAuditCount: 4,
            latestBoardCard: { cardId: "board-3" },
            latestModerationAudit: { caseId: "mod-4" },
            generatedAt: "2026-06-15T02:00:00Z",
          },
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "readback_loaded");
  assert.equal(result.summary.boardCardCount, 3);
  assert.equal(calls[0].url, "https://example.supabase.co/functions/v1/discordos-product-workflow-rpc");
  assert.equal(JSON.parse(calls[0].init.body).rpc, "discordos_get_product_workflow_readback");
});

test("product workflow live readback renders bounded markdown", async () => {
  const result = await _internals.buildProductWorkflowLiveReadback();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Product Workflow Live Readback"));
  assert(rendered.includes("sends messages: `false`"));
  assert(!rendered.includes("SUPABASE_SERVICE_ROLE_KEY="));
});
