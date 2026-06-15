const {
  _internals: persistenceInternals,
} = require("./discordos-button-route-audit-acknowledgement-persistence");

function parseArgs(args) {
  return persistenceInternals.parseArgs(args);
}

function buildAcknowledgementReadback(persistence) {
  return {
    routeId: persistence.persistence.routeId,
    acknowledgementCustomId: persistence.persistence.acknowledgementCustomId,
    stateVisible: persistence.persistence.state === "handled",
    handledAtFieldPresent: persistence.persistence.handledAtField === "handled_at",
    actorFingerprintPresent: Boolean(persistence.persistence.actorFingerprint),
    actorIdsRedacted: persistence.persistence.redactsActorIds === true,
    tokensRedacted: persistence.persistence.redactsTokens === true,
    rawTokenDataPresent: persistence.persistence.storesRawTokenData === true,
    executesStorageWrite: false,
    slashCommandsAdmitted: false,
  };
}

function validateAcknowledgementReadback({ persistence, readback }) {
  const reasonCodes = [...persistence.reasonCodes];
  if (!readback.stateVisible || !readback.handledAtFieldPresent) {
    reasonCodes.push("button_route_audit_ack_readback_state_missing");
  }
  if (!readback.actorFingerprintPresent || !readback.actorIdsRedacted || !readback.tokensRedacted || readback.rawTokenDataPresent) {
    reasonCodes.push("button_route_audit_ack_readback_redaction_failed");
  }
  if (persistence.slashCommandsAdmitted || readback.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_ack_readback_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAcknowledgementReadback(input = {}) {
  const persistence = await persistenceInternals.buildButtonRouteAuditAcknowledgementPersistence(input);
  const readback = buildAcknowledgementReadback(persistence);
  const reasonCodes = validateAcknowledgementReadback({ persistence, readback });
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
    status: reasonCodes.length === 0 ? "button_route_audit_acknowledgement_readback_ready" : "blocked",
    sourceStatus: persistence.status,
    readback,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_acknowledgement_readback_ready"
        : "discordos.button_route.audit_acknowledgement_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_acknowledgement_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        routeId: readback.routeId || "none",
        stateVisible: readback.stateVisible,
        redacted: readback.actorIdsRedacted && readback.tokensRedacted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Acknowledgement Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- route: \`${result.readback.routeId || "none"}\``,
    `- state visible: \`${result.readback.stateVisible ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAcknowledgementReadback(options);
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
    buildAcknowledgementReadback,
    validateAcknowledgementReadback,
    buildButtonRouteAuditAcknowledgementReadback,
    renderMarkdown,
  },
};
