const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-readback");

test("button route audit acknowledgement readback confirms visible redacted handled state", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementReadback({
    actorDiscordUserId: "1515220075366580224",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.stateVisible, true);
  assert.equal(result.readback.actorIdsRedacted, true);
  assert.equal(result.readback.tokensRedacted, true);
  assert.equal(result.readback.rawTokenDataPresent, false);
});

test("button route audit acknowledgement readback rejects raw token exposure", () => {
  const reasonCodes = _internals.validateAcknowledgementReadback({
    persistence: { reasonCodes: [], slashCommandsAdmitted: false },
    readback: {
      stateVisible: true,
      handledAtFieldPresent: true,
      actorFingerprintPresent: true,
      actorIdsRedacted: true,
      tokensRedacted: true,
      rawTokenDataPresent: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_readback_redaction_failed"));
});
