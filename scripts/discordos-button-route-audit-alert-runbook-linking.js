const {
  _internals: readbackInternals,
} = require("./discordos-button-route-audit-alert-target-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function buildRunbookLinkage(readbackResult) {
  const readback = readbackResult.readback || {};
  return {
    routeId: readback.routeId || null,
    targetType: readback.targetType || "none",
    actionSummary: "Inspect button route audit dashboard, confirm target drift, then run guarded alert delivery canary if needed.",
    commands: [
      "npm run ops:discordos:button-route-audit-dashboard",
      "npm run ops:discordos:button-route-audit-alert-target-readback",
    ],
    redactsActorIds: true,
    redactsTokens: true,
    boundedLength: true,
  };
}

function validateRunbookLinking({ readbackResult, runbook }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (readbackResult.sendsMessages || readbackResult.callsDiscordApi || readbackResult.callsMusicProviders) {
    reasonCodes.push("button_route_audit_alert_runbook_side_effect_boundary_failed");
  }
  if (readbackResult.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_alert_runbook_slash_command_admitted");
  }
  if (!runbook.routeId) reasonCodes.push("button_route_audit_alert_runbook_route_missing");
  if (!runbook.redactsActorIds || !runbook.redactsTokens) {
    reasonCodes.push("button_route_audit_alert_runbook_redaction_missing");
  }
  if (!runbook.boundedLength || runbook.actionSummary.length > 180) {
    reasonCodes.push("button_route_audit_alert_runbook_unbounded");
  }
  if (!runbook.commands.every((command) => command.startsWith("npm run ops:discordos:"))) {
    reasonCodes.push("button_route_audit_alert_runbook_command_scope_invalid");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAlertRunbookLinking(input = {}) {
  const readbackResult = await readbackInternals.buildButtonRouteAuditAlertTargetReadback(input);
  const runbook = buildRunbookLinkage(readbackResult);
  const reasonCodes = validateRunbookLinking({ readbackResult, runbook });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "button_route_audit_alert_runbook_linking_ready" : "blocked",
    sourceStatus: readbackResult.status,
    runbook,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_alert_runbook_linking_ready"
        : "discordos.button_route.audit_alert_runbook_linking_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_alert_runbook_linking",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        routeId: runbook.routeId || "none",
        commandCount: runbook.commands.length,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Alert Runbook Linking",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- route: \`${result.runbook.routeId || "none"}\``,
    `- command count: \`${result.runbook.commands.length}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAlertRunbookLinking(options);
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
    buildRunbookLinkage,
    validateRunbookLinking,
    buildButtonRouteAuditAlertRunbookLinking,
    renderMarkdown,
  },
};
