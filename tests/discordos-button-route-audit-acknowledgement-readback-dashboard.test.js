const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-readback-dashboard");

test("button route audit acknowledgement readback dashboard summarizes closed redacted state", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementReadbackDashboard({
    actorDiscordUserId: "1515220075366580224",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.closedAlertStateVisible, true);
  assert.equal(result.dashboard.redactionStatus, "redacted");
  assert.equal(result.dashboard.exposesActorIds, false);
  assert.equal(result.dashboard.exposesTokens, false);
});

test("button route audit acknowledgement readback dashboard rejects unsafe redaction", () => {
  const reasonCodes = _internals.validateAcknowledgementReadbackDashboard({
    readbackResult: { reasonCodes: [], executesStorageWrite: false, slashCommandsAdmitted: false },
    dashboard: {
      handledStateVisible: true,
      closedAlertStateVisible: true,
      redactionStatus: "unsafe",
      exposesActorIds: false,
      exposesTokens: false,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("button_route_audit_ack_readback_dashboard_redaction_failed"));
});
