const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alerting");

test("button acknowledgement deep delivery alerting preserves redaction", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.alerting.historyStatus, "bounded_ready");
  assert.equal(result.alerting.redactionStatus, "preserved");
  assert.equal(result.alerting.preservesActorRedaction, true);
});

test("button acknowledgement deep delivery alerting rejects redaction drift", () => {
  const reasonCodes = _internals.validateAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlerting({
    historyResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    alerting: {
      historyStatus: "bounded_ready",
      repeatedPatternVisible: true,
      recordCount: 1,
      alertRequired: false,
      alertStatus: "not_required",
      redactionStatus: "failed",
      preservesActorRedaction: true,
      preservesTokenRedaction: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      sendsMessagesInAlerting: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_alert_delivery_history_alert_delivery_history_alert_delivery_history_alert_delivery_history_alerting_redaction_failed"));
});
