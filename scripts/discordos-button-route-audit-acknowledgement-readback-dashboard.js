const {
  _internals: readbackInternals,
} = require("./discordos-button-route-audit-acknowledgement-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function buildAcknowledgementReadbackDashboard(readbackResult) {
  const readback = readbackResult.readback;
  return {
    routeId: readback.routeId,
    acknowledgementCustomId: readback.acknowledgementCustomId,
    handledStateVisible: readback.stateVisible === true,
    closedAlertStateVisible: readback.stateVisible === true && readback.handledAtFieldPresent === true,
    redactionStatus: readback.actorIdsRedacted && readback.tokensRedacted && !readback.rawTokenDataPresent
      ? "redacted"
      : "unsafe",
    actorFingerprintPresent: readback.actorFingerprintPresent === true,
    exposesActorIds: false,
    exposesTokens: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateAcknowledgementReadbackDashboard({ readbackResult, dashboard }) {
  const reasonCodes = [...readbackResult.reasonCodes];
  if (!dashboard.handledStateVisible || !dashboard.closedAlertStateVisible) {
    reasonCodes.push("button_route_audit_ack_readback_dashboard_state_missing");
  }
  if (dashboard.redactionStatus !== "redacted" || dashboard.exposesActorIds || dashboard.exposesTokens) {
    reasonCodes.push("button_route_audit_ack_readback_dashboard_redaction_failed");
  }
  if (readbackResult.executesStorageWrite || dashboard.executesStorageWrite) {
    reasonCodes.push("button_route_audit_ack_readback_dashboard_storage_write_attempted");
  }
  if (readbackResult.slashCommandsAdmitted || dashboard.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_ack_readback_dashboard_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAcknowledgementReadbackDashboard(input = {}) {
  const readbackResult = await readbackInternals.buildButtonRouteAuditAcknowledgementReadback(input);
  const dashboard = buildAcknowledgementReadbackDashboard(readbackResult);
  const reasonCodes = validateAcknowledgementReadbackDashboard({ readbackResult, dashboard });
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "button_route_audit_acknowledgement_readback_dashboard_ready" : "blocked",
    sourceStatus: readbackResult.status,
    dashboard,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_acknowledgement_readback_dashboard_ready"
        : "discordos.button_route.audit_acknowledgement_readback_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_acknowledgement_readback_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        routeId: dashboard.routeId || "none",
        closedAlertStateVisible: dashboard.closedAlertStateVisible,
        redactionStatus: dashboard.redactionStatus,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Acknowledgement Readback Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- route: \`${result.dashboard.routeId || "none"}\``,
    `- redaction: \`${result.dashboard.redactionStatus}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAcknowledgementReadbackDashboard(options);
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
    buildAcknowledgementReadbackDashboard,
    validateAcknowledgementReadbackDashboard,
    buildButtonRouteAuditAcknowledgementReadbackDashboard,
    renderMarkdown,
  },
};
