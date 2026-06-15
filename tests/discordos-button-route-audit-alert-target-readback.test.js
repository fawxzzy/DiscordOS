const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-alert-target-readback");

test("button route audit alert target readback proves route and target without sending", async () => {
  const result = await _internals.buildButtonRouteAuditAlertTargetReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.readback.routeId, "button-route-audit-critical-alert");
  assert.equal(result.readback.targetConfigured, true);
  assert.equal(result.readback.alertWouldSend, true);
});

test("button route audit alert target readback requires configured target", () => {
  const reasonCodes = _internals.validateAlertTargetReadback({
    canary: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
    readback: {
      routeId: "button-route-audit-critical-alert",
      targetConfigured: false,
      alertWouldSend: true,
      rawActorSafe: true,
    },
  });

  assert(reasonCodes.includes("button_route_audit_alert_target_not_configured"));
});
