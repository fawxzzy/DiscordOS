const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-dashboard-alert-history");

test("button route audit acknowledgement dashboard alert history keeps bounded redacted records", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementDashboardAlertHistory({
    actorDiscordUserId: "1515220075366580224",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.history.historyStatus, "bounded_ready");
  assert.equal(result.history.recordCount, 1);
  assert.equal(result.history.preservesActorRedaction, true);
  assert.equal(result.history.preservesTokenRedaction, true);
});

test("button route audit acknowledgement dashboard alert history rejects unbounded records", () => {
  const reasonCodes = _internals.validateAcknowledgementDashboardAlertHistory({
    dashboardResult: { reasonCodes: [], executesStorageWrite: false, slashCommandsAdmitted: false },
    history: {
      historyStatus: "bounded_ready",
      recordCount: 11,
      maxRecords: 10,
      records: [{ closedAlertStateVisible: true, redactionStatus: "redacted" }],
      preservesActorRedaction: true,
      preservesTokenRedaction: true,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_dashboard_history_bounds_failed"));
});
