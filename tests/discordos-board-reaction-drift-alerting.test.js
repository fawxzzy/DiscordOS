const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-drift-alerting");

test("board reaction drift alerting is clear with no drift", async () => {
  const result = await _internals.buildBoardReactionDriftAlerting();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.driftDetected, false);
  assert.equal(result.slashCommandsAdmitted, false);
});

test("board reaction drift alerting routes drift critical alerts", async () => {
  const result = await _internals.buildBoardReactionDriftAlerting({
    cardId: "music-sesh-phase-8-cross-service-room-sync-simple-controls",
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
            emoji: { name: "success", id: "1507384062166302851" },
            count: 1,
            me: true,
          },
        ],
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.driftDetected, true);
  assert.equal(result.notificationRoute.routeId, "board-reaction-drift-critical-alert");
  assert.equal(result.notificationRoute.severity, "critical");
  assert.equal(result.sendsMessages, false);
});
