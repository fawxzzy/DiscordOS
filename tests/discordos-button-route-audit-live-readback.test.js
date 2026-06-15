const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-live-readback");

test("button route audit live readback parses live arg", () => {
  const parsed = _internals.parseArgs(["--json", "--live"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
});

test("button route audit live readback is ready without live calls by default", async () => {
  const result = await _internals.buildButtonRouteAuditLiveReadback({
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.liveAttempted, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.status, "ready_for_button_route_audit_live_readback");
});

test("button route audit live readback summarizes sanitized rows", async () => {
  const calls = [];
  const result = await _internals.buildButtonRouteAuditLiveReadback({
    live: true,
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          auditCount: 1,
          latestAudit: {
            custom_id: "music_sesh:queue",
            route_kind: "MESSAGE_COMPONENT",
            response_type: "deferred_update",
            actor_fingerprint: "actor-fingerprint",
          },
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.liveAttempted, true);
  assert.equal(result.summary.auditCount, 1);
  assert.equal(result.summary.latestCustomId, "music_sesh:queue");
  assert.equal(result.summary.latestActorFingerprintPresent, true);
  assert.equal(result.summary.rawSensitiveFieldsAbsent, true);
  assert.equal(calls.length, 1);
});

test("button route audit live readback rejects raw sensitive fields", () => {
  assert.equal(_internals.containsRawSensitiveFields({ actor_discord_user_id: "123" }), true);
  assert.equal(_internals.containsRawSensitiveFields({ actor_fingerprint: "safe" }), false);
});
