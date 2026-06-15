const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-acknowledgement-history-alerting");

test("button route audit acknowledgement history alerting stays no-send and redacted", async () => {
  const result = await _internals.buildButtonRouteAuditAcknowledgementHistoryAlerting({
    actorDiscordUserId: "1515220075366580224",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.alerting.alertStatus, "not_required");
  assert.equal(result.alerting.preservesActorRedaction, true);
  assert.equal(result.alerting.preservesTokenRedaction, true);
});

test("button route audit acknowledgement history alerting admits bounded no-send attention", () => {
  const alerting = _internals.buildAcknowledgementHistoryAlerting({
    history: {
      historyStatus: "bounded_ready",
      recordCount: 10,
      maxRecords: 10,
      preservesActorRedaction: true,
      preservesTokenRedaction: true,
    },
  });

  assert.equal(alerting.alertRequired, true);
  assert.equal(alerting.alertStatus, "would_route_no_send");
  assert.equal(alerting.sendsMessagesInAlerting, false);
  assert.equal(alerting.callsDiscordApi, false);
});
