const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-product-workflow-alert-delivery-canary");

test("product workflow alert delivery canary parses monitor args", () => {
  const parsed = _internals.parseArgs(["--json", "--min-board-cards", "1"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.minBoardCards, 1);
});

test("product workflow alert delivery canary exercises critical no-send route", async () => {
  const result = await _internals.buildProductWorkflowAlertDeliveryCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.alertWouldSend, true);
  assert.equal(result.deliveryCanaryStatus, "critical_route_ready_no_send");
  assert.equal(result.notificationRoute.routeId, "product-workflow-monitor-critical-alert");
  assert.equal(result.notificationRoute.target, "alerts");
});

test("product workflow alert delivery canary renders bounded markdown", async () => {
  const result = await _internals.buildProductWorkflowAlertDeliveryCanary();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Product Workflow Alert Delivery Canary"));
  assert(rendered.includes("sends messages: `false`"));
});
