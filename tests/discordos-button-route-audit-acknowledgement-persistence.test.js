const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-persistence");

test("button route audit acknowledgement persistence previews handled state", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementPersistence({
    actorDiscordUserId: "1515220075366580224",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.persistence.state, "handled");
  assert.equal(result.persistence.closesHandledAlert, true);
  assert.equal(result.persistence.storesRawTokenData, false);
  assert.match(result.persistence.actorFingerprint, /^[a-f0-9]{24}$/);
});

test("button route audit acknowledgement persistence requires redaction", () => {
  const reasonCodes = _internals.validateAcknowledgementPersistence({
    acknowledgementResult: { reasonCodes: [], slashCommandsAdmitted: false },
    persistence: {
      routeId: "route",
      acknowledgementCustomId: "button_audit_ack:route",
      actorFingerprint: "fingerprint",
      state: "handled",
      closesHandledAlert: true,
      redactsActorIds: false,
      redactsTokens: true,
      storesRawTokenData: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_persistence_redaction_failed"));
});
