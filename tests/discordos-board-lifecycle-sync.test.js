const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-lifecycle-sync");

test("board lifecycle sync parses forum card inputs", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--workflow",
    "Product Board",
    "--card-id",
    "Board 1",
    "--state",
    "completed",
    "--actor",
    "zac",
    "--source-thread-id",
    "1515843266946269194",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.workflow, "Product Board");
  assert.equal(parsed.cardId, "Board 1");
  assert.equal(parsed.state, "completed");
});

test("board lifecycle sync builds no-send sync plan", async () => {
  const result = await _internals.buildBoardLifecycleSync({
    workflow: "Product Board",
    cardId: "Board 1",
    kind: "feature",
    state: "completed",
    actor: "zac",
    sourceThreadId: "1515843266946269194",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.storageApplied, false);
  assert.equal(result.status, "sync_ready");
  assert.equal(result.sync.source, "discord_forum_card_lifecycle");
  assert.equal(result.sync.cardId, "board-1");
  assert.equal(result.sync.state, "completed");
  assert.equal(result.boardWriter.liveBehaviorAllowed, false);
});

test("board lifecycle sync can apply storage through guarded writer", async () => {
  const calls = [];
  const result = await _internals.buildBoardLifecycleSync({
    workflow: "Product Board",
    cardId: "Board 1",
    kind: "feature",
    state: "completed",
    actor: "zac",
    applyStorage: true,
    env: {
      DISCORDOS_BOARD_ACTIVE_WRITE_ADAPTER: "enabled",
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ cardId: "board-1", operation: "upsert" }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.storageApplied, true);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/discordos_upsert_board_card");
});

test("board lifecycle sync renders bounded markdown", async () => {
  const result = await _internals.buildBoardLifecycleSync({
    workflow: "Product Board",
    cardId: "Board 1",
    kind: "ops",
    state: "opened",
    actor: "zac",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Lifecycle Sync"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("live behavior allowed: `false`"));
});
