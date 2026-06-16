const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-alert-delivery-history-alert-delivery-dashboard");

test("button route acknowledgement history alert delivery dashboard summarizes redacted readback", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementAlertDeliveryHistoryAlertDeliveryDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.statusLine, "ready");
  assert.equal(result.dashboard.historyStatus, "bounded_ready");
  assert.equal(result.dashboard.redactionStatus, "preserved");
  assert.equal(result.dashboard.preservesActorRedaction, true);
  assert.equal(result.dashboard.preservesTokenRedaction, true);
});

test("button route acknowledgement history alert delivery dashboard rejects redaction drift", () => {
  const reasonCodes = _internals.validateAcknowledgementAlertDeliveryHistoryAlertDeliveryDashboard({
    readbackResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
    dashboard: {
      statusLine: "ready",
      deliveryDecisionVisible: true,
      historyStatus: "bounded_ready",
      redactionStatus: "failed",
      preservesActorRedaction: false,
      preservesTokenRedaction: true,
      noSendBoundaryConfirmed: true,
      noDiscordApiBoundaryConfirmed: true,
      noStorageWriteBoundaryConfirmed: true,
      sendsMessagesInDashboard: false,
      callsDiscordApi: false,
      executesStorageWrite: false,
      alertRequired: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_alert_delivery_history_alert_delivery_dashboard_redaction_failed"));
});
