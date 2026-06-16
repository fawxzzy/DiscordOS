const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-history-alert-delivery-dashboard");

test("button acknowledgement nested alert delivery dashboard summarizes redacted readback", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.statusLine, "ready");
  assert.equal(result.dashboard.redactionStatus, "preserved");
  assert.equal(result.dashboard.preservesActorRedaction, true);
});

test("button acknowledgement nested alert delivery dashboard rejects redaction drift", () => {
  const reasonCodes = _internals.validateAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryDashboard({
    readbackResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    dashboard: {
      statusLine: "ready",
      deliveryAdmissionStatus: "no_alert_to_deliver",
      alertRequired: false,
      alertStatus: "not_required",
      historyStatus: "bounded_ready",
      redactionStatus: "failed",
      preservesActorRedaction: true,
      preservesTokenRedaction: true,
      deliveryDecisionVisible: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      sendsMessagesInDashboard: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_alert_delivery_history_alert_delivery_history_alert_delivery_dashboard_redaction_failed"));
});
