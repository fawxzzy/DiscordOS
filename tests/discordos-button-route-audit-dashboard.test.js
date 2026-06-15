const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-dashboard");

test("button route audit dashboard summarizes rows", () => {
  const dashboard = _internals.summarizeAuditDashboard({
    audits: [
      { custom_id: "music_sesh:queue", response_type: "deferred_update", storage_write_attempted: true },
      { custom_id: "music_sesh:queue", response_type: "deferred_update", storage_write_attempted: false },
    ],
  });

  assert.equal(dashboard.auditCount, 2);
  assert.equal(dashboard.storageAttemptCount, 1);
  assert.deepEqual(dashboard.customIds, [{ customId: "music_sesh:queue", count: 2 }]);
});

test("button route audit dashboard is ready without live readback", async () => {
  const result = await _internals.buildButtonRouteAuditDashboard({
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.rawSensitiveFieldsAbsent, true);
});

test("button route audit dashboard rejects sensitive readback", async () => {
  const result = await _internals.buildButtonRouteAuditDashboard({
    live: true,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        latestAudit: { custom_id: "x", actor_discord_user_id: "123" },
      }),
    }),
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("button_route_audit_dashboard_raw_sensitive_fields_present"));
});
