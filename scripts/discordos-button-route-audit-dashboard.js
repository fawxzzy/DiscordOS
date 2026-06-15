const {
  _internals: readbackInternals,
} = require("./discordos-button-route-audit-live-readback");

function parseArgs(args) {
  return readbackInternals.parseArgs(args);
}

function collectAudits(payload = {}) {
  if (Array.isArray(payload.audits)) return payload.audits;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (payload.latestAudit) return [payload.latestAudit];
  if (payload.latest) return [payload.latest];
  return [];
}

function summarizeAuditDashboard(payload = {}) {
  const audits = collectAudits(payload);
  const byCustomId = new Map();
  const byResponseType = new Map();
  let storageAttemptCount = 0;

  for (const audit of audits) {
    const customId = audit.custom_id || audit.customId || "unknown";
    const responseType = audit.response_type || audit.responseType || "unknown";
    byCustomId.set(customId, (byCustomId.get(customId) || 0) + 1);
    byResponseType.set(responseType, (byResponseType.get(responseType) || 0) + 1);
    if (audit.storage_write_attempted || audit.storageWriteAttempted) storageAttemptCount += 1;
  }

  return {
    auditCount: audits.length || Number(payload.auditCount || payload.count || 0),
    loadedRowCount: audits.length,
    storageAttemptCount,
    customIds: [...byCustomId.entries()].map(([customId, count]) => ({ customId, count })),
    responseTypes: [...byResponseType.entries()].map(([responseType, count]) => ({ responseType, count })),
    latestActorFingerprintPresent: readbackInternals.summarizeAuditReadback(payload).latestActorFingerprintPresent,
    rawSensitiveFieldsAbsent: !readbackInternals.containsRawSensitiveFields(payload),
  };
}

async function buildButtonRouteAuditDashboard(input = {}) {
  const readback = await readbackInternals.buildButtonRouteAuditLiveReadback(input);
  const dashboard = summarizeAuditDashboard(readback.readback || {});
  const reasonCodes = [...new Set([
    ...readback.reasonCodes,
    ...(dashboard.rawSensitiveFieldsAbsent ? [] : ["button_route_audit_dashboard_raw_sensitive_fields_present"]),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    liveAttempted: readback.liveAttempted,
    status: reasonCodes.length === 0 ? "button_route_audit_dashboard_ready" : "blocked",
    dashboard,
    readback: {
      status: readback.status,
      rpc: readback.rpc,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_dashboard_ready"
        : "discordos.button_route.audit_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveAttempted: result.liveAttempted,
        auditCount: dashboard.auditCount,
        storageAttemptCount: dashboard.storageAttemptCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- audits: \`${result.dashboard.auditCount}\``,
    `- storage attempts: \`${result.dashboard.storageAttemptCount}\``,
    `- raw sensitive fields absent: \`${result.dashboard.rawSensitiveFieldsAbsent ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditDashboard(options);
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
    collectAudits,
    summarizeAuditDashboard,
    buildButtonRouteAuditDashboard,
    renderMarkdown,
  },
};
