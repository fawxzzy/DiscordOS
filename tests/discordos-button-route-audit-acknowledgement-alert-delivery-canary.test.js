const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-alert-delivery-canary");

test("button route acknowledgement alert delivery canary proves redacted no-send admission", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementAlertDeliveryCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.canary.deliveryAdmissionStatus, "no_alert_to_deliver");
  assert.equal(result.canary.preservesActorRedaction, true);
  assert.equal(result.canary.preservesTokenRedaction, true);
});

test("button route acknowledgement alert delivery canary rejects redaction leaks", () => {
  const reasonCodes = _internals.validateAcknowledgementAlertDeliveryCanary({
    alertingResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    canary: {
      deliveryDecisionVisible: true,
      preservesActorRedaction: true,
      preservesTokenRedaction: false,
      sendsMessagesInCanary: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      alertRequired: false,
      deliveryAdmissionStatus: "no_alert_to_deliver",
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_alert_delivery_canary_redaction_failed"));
});
