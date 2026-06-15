const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-alerting");

test("button route audit alerting is quiet when no signals are present", async () => {
  const result = await _internals.buildButtonRouteAuditAlerting();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.alertRequired, false);
  assert.equal(result.notificationRoute.routeId, null);
  assert.equal(result.slashCommandsAdmitted, false);
});

test("button route audit alerting routes critical audit attention", async () => {
  const result = await _internals.buildButtonRouteAuditAlerting({
    live: true,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        audits: [
          {
            custom_id: "music_sesh:queue",
            response_type: "unexpected",
            actor_fingerprint: "actor-fp",
          },
        ],
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.alertRequired, true);
  assert(result.alertSignals.includes("button_route_audit_unexpected_response_type"));
  assert.equal(result.notificationRoute.routeId, "button-route-audit-critical-alert");
  assert.equal(result.notificationRoute.severity, "critical");
  assert.equal(result.sendsMessages, false);
});
