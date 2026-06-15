const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-alert-acknowledgement-flow");

test("button route audit alert acknowledgement flow is no-slash and redacted", async () => {
  const result = await _internals.buildButtonRouteAuditAlertAcknowledgementFlow();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.acknowledgement.routeId, "button-route-audit-critical-alert");
  assert.equal(result.acknowledgement.recordsHandledAt, true);
  assert.equal(result.acknowledgement.redactsActorIds, true);
  assert.equal(result.acknowledgement.redactsTokens, true);
});

test("button route audit alert acknowledgement flow requires close transition", () => {
  const reasonCodes = _internals.validateAcknowledgementFlow({
    runbookResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      slashCommandsAdmitted: false,
    },
    acknowledgement: {
      routeId: "button-route-audit-critical-alert",
      acknowledgementCustomId: "button_audit_ack:button-route-audit-critical-alert",
      recordsHandledAt: true,
      closesHandledAlert: false,
      redactsActorIds: true,
      redactsTokens: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_flow_state_transition_missing"));
});
