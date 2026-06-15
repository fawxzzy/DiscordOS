const {
  _internals: runbookInternals,
} = require("./discordos-button-route-audit-alert-runbook-linking");

function parseArgs(args) {
  return runbookInternals.parseArgs(args);
}

function buildAcknowledgementFlow(runbookResult) {
  const runbook = runbookResult.runbook || {};
  return {
    routeId: runbook.routeId || null,
    acknowledgementMode: "no_slash_button_or_computa_message",
    acknowledgementCustomId: runbook.routeId ? `button_audit_ack:${runbook.routeId}` : null,
    recordsHandledAt: true,
    closesHandledAlert: true,
    redactsActorIds: runbook.redactsActorIds === true,
    redactsTokens: runbook.redactsTokens === true,
    slashCommandsAdmitted: false,
  };
}

function validateAcknowledgementFlow({ runbookResult, acknowledgement }) {
  const reasonCodes = [...runbookResult.reasonCodes];
  if (runbookResult.sendsMessages || runbookResult.callsDiscordApi || runbookResult.callsMusicProviders) {
    reasonCodes.push("button_route_audit_ack_flow_side_effect_boundary_failed");
  }
  if (runbookResult.slashCommandsAdmitted || acknowledgement.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_ack_flow_slash_command_admitted");
  }
  if (!acknowledgement.routeId || !acknowledgement.acknowledgementCustomId) {
    reasonCodes.push("button_route_audit_ack_flow_route_missing");
  }
  if (!acknowledgement.recordsHandledAt || !acknowledgement.closesHandledAlert) {
    reasonCodes.push("button_route_audit_ack_flow_state_transition_missing");
  }
  if (!acknowledgement.redactsActorIds || !acknowledgement.redactsTokens) {
    reasonCodes.push("button_route_audit_ack_flow_redaction_missing");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAlertAcknowledgementFlow(input = {}) {
  const runbookResult = await runbookInternals.buildButtonRouteAuditAlertRunbookLinking(input);
  const acknowledgement = buildAcknowledgementFlow(runbookResult);
  const reasonCodes = validateAcknowledgementFlow({ runbookResult, acknowledgement });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "button_route_audit_alert_acknowledgement_flow_ready" : "blocked",
    sourceStatus: runbookResult.status,
    acknowledgement,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_alert_acknowledgement_flow_ready"
        : "discordos.button_route.audit_alert_acknowledgement_flow_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_alert_acknowledgement_flow",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        routeId: acknowledgement.routeId || "none",
        acknowledgementMode: acknowledgement.acknowledgementMode,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Alert Acknowledgement Flow",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- mode: \`${result.acknowledgement.acknowledgementMode}\``,
    `- route: \`${result.acknowledgement.routeId || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAlertAcknowledgementFlow(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  _internals: {
    parseArgs,
    buildAcknowledgementFlow,
    validateAcknowledgementFlow,
    buildButtonRouteAuditAlertAcknowledgementFlow,
    renderMarkdown,
  },
};
