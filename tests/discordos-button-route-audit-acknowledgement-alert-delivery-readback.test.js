const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-alert-delivery-readback");

test("button route acknowledgement alert delivery readback preserves redacted no-send decisions", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementAlertDeliveryReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.readback.preservesActorRedaction, true);
  assert.equal(result.readback.preservesTokenRedaction, true);
  assert.equal(result.readback.noSendBoundaryConfirmed, true);
});

test("button route acknowledgement alert delivery readback rejects redaction loss", () => {
  const reasonCodes = _internals.validateAcknowledgementAlertDeliveryReadback({
    canaryResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    readback: {
      deliveryAdmissionStatus: "no_alert_to_deliver",
      alertRequired: false,
      preservesActorRedaction: true,
      preservesTokenRedaction: false,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_alert_delivery_readback_redaction_failed"));
});
