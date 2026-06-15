const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-button-route-audit-alert-runbook-linking");

test("button route audit alert runbook linking adds bounded redacted commands", async () => {
  const result = await _internals.buildButtonRouteAuditAlertRunbookLinking();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.runbook.routeId, "button-route-audit-critical-alert");
  assert.equal(result.runbook.redactsActorIds, true);
  assert.equal(result.runbook.redactsTokens, true);
  assert(result.runbook.commands.every((command) => command.startsWith("npm run ops:discordos:")));
});

test("button route audit alert runbook linking requires redaction", () => {
  const reasonCodes = _internals.validateRunbookLinking({
    readbackResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      callsMusicProviders: false,
      slashCommandsAdmitted: false,
    },
    runbook: {
      routeId: "button-route-audit-critical-alert",
      actionSummary: "inspect",
      commands: ["npm run ops:discordos:button-route-audit-dashboard"],
      redactsActorIds: false,
      redactsTokens: true,
      boundedLength: true,
    },
  });

  assert(reasonCodes.includes("button_route_audit_alert_runbook_redaction_missing"));
});
