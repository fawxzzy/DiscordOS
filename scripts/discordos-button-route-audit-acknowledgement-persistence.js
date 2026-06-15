const crypto = require("node:crypto");
const {
  _internals: acknowledgementInternals,
} = require("./discordos-button-route-audit-alert-acknowledgement-flow");

function parseArgs(args) {
  return acknowledgementInternals.parseArgs(args);
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex").slice(0, 24);
}

function buildAcknowledgementPersistencePreview(acknowledgement, input = {}) {
  return {
    routeId: acknowledgement.routeId,
    acknowledgementCustomId: acknowledgement.acknowledgementCustomId,
    state: "handled",
    handledAtField: "handled_at",
    actorFingerprint: fingerprint(input.actorDiscordUserId || acknowledgement.routeId),
    closesHandledAlert: acknowledgement.closesHandledAlert === true,
    redactsActorIds: acknowledgement.redactsActorIds === true,
    redactsTokens: acknowledgement.redactsTokens === true,
    storesRawTokenData: false,
    writesStorageInPreview: false,
    slashCommandsAdmitted: false,
  };
}

function validateAcknowledgementPersistence({ acknowledgementResult, persistence }) {
  const reasonCodes = [...acknowledgementResult.reasonCodes];
  if (!persistence.routeId || !persistence.acknowledgementCustomId || !persistence.actorFingerprint) {
    reasonCodes.push("button_route_audit_ack_persistence_identity_missing");
  }
  if (!persistence.closesHandledAlert || persistence.state !== "handled") {
    reasonCodes.push("button_route_audit_ack_persistence_state_invalid");
  }
  if (!persistence.redactsActorIds || !persistence.redactsTokens || persistence.storesRawTokenData) {
    reasonCodes.push("button_route_audit_ack_persistence_redaction_failed");
  }
  if (acknowledgementResult.slashCommandsAdmitted || persistence.slashCommandsAdmitted) {
    reasonCodes.push("button_route_audit_ack_persistence_slash_command_admitted");
  }
  return [...new Set(reasonCodes)];
}

async function buildButtonRouteAuditAcknowledgementPersistence(input = {}) {
  const acknowledgementResult = await acknowledgementInternals.buildButtonRouteAuditAlertAcknowledgementFlow(input);
  const persistence = buildAcknowledgementPersistencePreview(acknowledgementResult.acknowledgement, input);
  const reasonCodes = validateAcknowledgementPersistence({ acknowledgementResult, persistence });
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
    status: reasonCodes.length === 0 ? "button_route_audit_acknowledgement_persistence_ready" : "blocked",
    sourceStatus: acknowledgementResult.status,
    persistence,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_acknowledgement_persistence_ready"
        : "discordos.button_route.audit_acknowledgement_persistence_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_acknowledgement_persistence",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        routeId: persistence.routeId || "none",
        state: persistence.state,
        executesStorageWrite: result.executesStorageWrite,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Acknowledgement Persistence",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- route: \`${result.persistence.routeId || "none"}\``,
    `- state: \`${result.persistence.state}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditAcknowledgementPersistence(options);
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
    fingerprint,
    buildAcknowledgementPersistencePreview,
    validateAcknowledgementPersistence,
    buildButtonRouteAuditAcknowledgementPersistence,
    renderMarkdown,
  },
};
