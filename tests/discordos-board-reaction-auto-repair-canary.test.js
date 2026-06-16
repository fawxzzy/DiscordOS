const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-reaction-auto-repair-canary");

test("board reaction auto repair canary previews committed board safely", async () => {
  const result = await _internals.buildBoardReactionAutoRepairCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.repairPlan.candidateCount, 1);
  assert.equal(result.appliedCount, 0);
});

test("board reaction auto repair plan marks drifted cards repairable", () => {
  const plan = _internals.buildRepairPlan({
    lifecycle: {
      reconciledCards: [
        {
          cardId: "card-1",
          expectedReactionStatus: "success",
          ok: true,
        },
      ],
    },
    drift: {
      drift: {
        driftedCards: [{ cardId: "card-1" }],
      },
    },
  });

  assert.equal(plan.candidateCount, 1);
  assert.equal(plan.repairPreviewCount, 1);
  assert.equal(plan.candidates[0].repairPreview, true);
});
