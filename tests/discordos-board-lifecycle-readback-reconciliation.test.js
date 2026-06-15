const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-lifecycle-readback-reconciliation");

test("board lifecycle readback reconciliation parses live card input", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--live",
    "--card-id",
    "board-1",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
  assert.equal(parsed.cardId, "board-1");
});

test("board lifecycle readback reconciliation compares board and storage card", () => {
  const result = _internals.reconcileCard({
    boardCard: {
      id: "board-1",
      title: "Board 1",
      state: "completed",
    },
    storageCard: {
      present: true,
      cardId: "board-1",
      state: "completed",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.cardIdMatches, true);
  assert.equal(result.stateMatches, true);
});

test("board lifecycle readback reconciliation detects mismatch", () => {
  const result = _internals.reconcileCard({
    boardCard: {
      id: "board-1",
      title: "Board 1",
      state: "completed",
    },
    storageCard: {
      present: true,
      cardId: "board-2",
      state: "opened",
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("card_id_mismatch"));
  assert(result.reasonCodes.includes("card_state_mismatch"));
});

test("board lifecycle readback reconciliation loads committed card with live readback", async () => {
  const result = await _internals.buildBoardLifecycleReadbackReconciliation({
    live: true,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        boardCardCount: 1,
        moderationAuditCount: 0,
        latestBoardCard: {
          cardId: "board-lifecycle-sync-apply-readback-hardening",
          currentState: "completed",
          updatedAt: "2026-06-15T14:45:00Z",
        },
        generatedAt: "2026-06-15T14:46:00Z",
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.liveAttempted, true);
  assert.equal(result.reconciliation.cardIdMatches, true);
  assert.equal(result.reconciliation.stateMatches, true);
});

test("board lifecycle readback reconciliation renders bounded markdown", async () => {
  const result = await _internals.buildBoardLifecycleReadbackReconciliation({
    live: true,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        latestBoardCard: {
          cardId: "board-lifecycle-sync-apply-readback-hardening",
          currentState: "completed",
        },
      }),
    }),
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Lifecycle Readback Reconciliation"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("card id matches: `true`"));
});
