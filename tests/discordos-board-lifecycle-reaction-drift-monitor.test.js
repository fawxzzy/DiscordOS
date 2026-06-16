const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-lifecycle-reaction-drift-monitor");

test("board lifecycle reaction drift monitor parses live card args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--card-id",
    "board-reaction-lifecycle-sync",
    "--live",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.cardId, "board-reaction-lifecycle-sync");
  assert.equal(parsed.live, true);
});

test("board lifecycle reaction drift monitor reports committed board clear", async () => {
  const result = await _internals.buildBoardLifecycleReactionDriftMonitor();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.status, "reaction_drift_monitor_clear");
  assert.equal(result.board.cardCount, 145);
  assert.equal(result.drift.driftCount, 0);
});

test("board lifecycle reaction drift monitor reports live custom reaction drift", async () => {
  const result = await _internals.buildBoardLifecycleReactionDriftMonitor({
    cardId: "board-reaction-lifecycle-sync",
    live: true,
    env: {
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        reactions: [
          {
            emoji: {
              name: "failure",
              id: "1507384094424694785",
            },
            count: 1,
            me: true,
          },
        ],
      }),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.callsDiscordApi, true);
  assert.equal(result.liveAttempted, true);
  assert.equal(result.drift.liveDriftCount, 1);
  assert(result.reasonCodes.includes("board_reaction_drift_detected"));
});

test("board lifecycle reaction drift monitor renders bounded markdown", async () => {
  const result = await _internals.buildBoardLifecycleReactionDriftMonitor({
    cardId: "board-reaction-lifecycle-sync",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Board Lifecycle Reaction Drift Monitor"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("drift: `0`"));
});
