const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-history-alert-delivery-history");

test("button acknowledgement nested alert delivery history tracks repeated redacted dashboards", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistory();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.history.historyStatus, "bounded_ready");
  assert.equal(result.history.recordCount, 1);
  assert.equal(result.history.records[0].preservesActorRedaction, true);
});

test("button acknowledgement nested alert delivery history rejects record drift", () => {
  const reasonCodes = _internals.validateAcknowledgementAlertDeliveryHistoryAlertDeliveryHistoryAlertDeliveryHistory({
    dashboardResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    history: {
      historyStatus: "bounded_ready",
      recordCount: 1,
      maxRecords: 10,
      repeatsTracked: true,
      records: [{
        statusLine: "ready",
        deliveryAdmissionStatus: "no_alert_to_deliver",
        alertStatus: "not_required",
        redactionStatus: "failed",
        preservesActorRedaction: true,
        preservesTokenRedaction: true,
        deliveryDecisionVisible: true,
        noSendBoundaryConfirmed: true,
        noDiscordApiBoundaryConfirmed: true,
        noStorageWriteBoundaryConfirmed: true,
      }],
      sendsMessagesInHistory: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_alert_delivery_history_alert_delivery_history_alert_delivery_history_record_invalid"));
});
