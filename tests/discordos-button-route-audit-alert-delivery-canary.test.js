const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-alert-delivery-canary");

test("button route audit alert delivery canary exercises critical route without sending", async () => {
  const result = await _internals.buildButtonRouteAuditAlertDeliveryCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.alertWouldSend, true);
  assert.equal(result.notificationRoute.routeId, "button-route-audit-critical-alert");
  assert(result.alertSignals.includes("button_route_audit_unexpected_response_type"));
});

test("button route audit alert delivery synthetic payload is raw-id safe", () => {
  const payload = _internals.buildSyntheticAlertDashboardPayload();
  const serialized = JSON.stringify(payload);

  assert(serialized.includes("actor_fingerprint"));
  assert(!serialized.includes("actor_discord_user_id"));
  assert(!serialized.includes("authorization"));
});
