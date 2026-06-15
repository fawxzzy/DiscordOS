const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-persistence");

const VALID_INPUT = {
  type: "MESSAGE_COMPONENT",
  executeRoute: true,
  guildId: "1504668396338413670",
  channelId: "1515943795999510579",
  actorDiscordUserId: "1515220075366580224",
  messageId: "1516000000000000000",
};

test("button route audit persistence parses guarded args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--type",
    "MESSAGE_COMPONENT",
    "--execute-route",
    "--allow-storage-write",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.type, "MESSAGE_COMPONENT");
  assert.equal(parsed.executeRoute, true);
  assert.equal(parsed.allowStorageWrite, true);
  assert.equal(parsed.apply, true);
});

test("button route audit payload is sanitized", async () => {
  const result = await _internals.buildButtonRouteAuditPersistence({
    ...VALID_INPUT,
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.auditPayload.custom_id, "music_sesh:queue");
  assert.equal(result.auditPayload.actor_fingerprint.length, 24);
  assert.equal(result.auditPayload.proof_payload.rawTokenDataStored, false);
  assert.equal(JSON.stringify(result.auditPayload).includes("1515220075366580224"), false);
});

test("button route audit persistence executes storage when double guarded", async () => {
  const calls = [];
  const result = await _internals.buildButtonRouteAuditPersistence({
    ...VALID_INPUT,
    allowStorageWrite: true,
    apply: true,
    env: {
      DISCORDOS_BUTTON_ROUTE_AUDIT_WRITE: "enabled",
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.executesStorageWrite, true);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].init.body).payload.custom_id, "music_sesh:queue");
});
