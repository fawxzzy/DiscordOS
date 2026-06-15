const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-alert-delivery-history");

test("button route acknowledgement alert delivery history tracks redacted dashboard states", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementAlertDeliveryHistory();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.history.historyStatus, "bounded_ready");
  assert.equal(result.history.recordCount, 1);
  assert.equal(result.history.records[0].redactionStatus, "preserved");
  assert.equal(result.history.records[0].noSendBoundaryConfirmed, true);
});

test("button route acknowledgement alert delivery history rejects redaction drift", () => {
  const reasonCodes = _internals.validateAcknowledgementAlertDeliveryHistory({
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
      records: [
        {
          statusLine: "ready",
          deliveryAdmissionStatus: "no_alert_to_deliver",
          redactionStatus: "failed",
          preservesActorRedaction: true,
          preservesTokenRedaction: true,
          deliveryDecisionVisible: true,
          noSendBoundaryConfirmed: true,
          noDiscordApiBoundaryConfirmed: true,
          noStorageWriteBoundaryConfirmed: true,
        },
      ],
      sendsMessagesInHistory: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_alert_delivery_history_record_invalid"));
});
