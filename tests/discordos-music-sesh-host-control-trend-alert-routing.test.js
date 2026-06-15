const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-control-trend-alert-routing");

test("host control trend alert routing stays quiet when trend is clear", async () => {
  const result = await _internals.buildMusicSeshHostControlTrendAlertRouting();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.routing.routeStatus, "not_required");
});

test("host control trend alert routing routes repeated conflict to attention path", async () => {
  const routeCalls = [];
  const notificationRouter = {
    buildNotificationRouteDecision: async (intent) => {
      routeCalls.push(intent);
      return {
        ok: true,
        route: { id: "product-workflow-monitor-critical-alert", target: "alerts" },
        routeDecision: { status: "routed" },
        reasonCodes: [],
      };
    },
  };
  const repeatedConflictRecord = {
    modeledConflictCount: 1,
    readbackAttemptCount: 1,
    alignedReadbackCount: 1,
    operatorStatus: "ready",
  };

  const result = await _internals.buildMusicSeshHostControlTrendAlertRouting({
    notificationRouter,
    history: [repeatedConflictRecord, repeatedConflictRecord],
  });

  assert.equal(result.ok, true);
  assert.equal(result.trend.attentionRequired, true);
  assert.equal(result.routing.routeStatus, "routed");
  assert.equal(result.routing.routeId, "product-workflow-monitor-critical-alert");
  assert.deepEqual(routeCalls[0], {
    source: "product-workflow",
    type: "discordos.product_workflow.monitor_attention",
    severity: "critical",
  });
});
