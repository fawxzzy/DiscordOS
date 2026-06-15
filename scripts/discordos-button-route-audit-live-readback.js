const {
  _internals: supabaseRpcInternals,
} = require("./discordos-supabase-service-rpc");

const AUDIT_READBACK_RPC = "discordos_get_button_route_audit_readback";

function parseArgs(args) {
  const options = {
    json: false,
    live: false,
  };

  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--live") {
      options.live = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function containsRawSensitiveFields(value) {
  const serialized = JSON.stringify(value || {}).toLowerCase();
  return /signature|token|service_role|authorization|actor_discord_user_id|actoruserid/.test(serialized);
}

function summarizeAuditReadback(payload = {}) {
  const latestAudit = payload.latestAudit || payload.latest || null;
  return {
    auditCount: Number(payload.auditCount || payload.count || 0),
    latestAuditPresent: Boolean(latestAudit),
    latestCustomId: latestAudit?.custom_id || latestAudit?.customId || null,
    latestRouteKind: latestAudit?.route_kind || latestAudit?.routeKind || null,
    latestResponseType: latestAudit?.response_type || latestAudit?.responseType || null,
    latestActorFingerprintPresent: Boolean(latestAudit?.actor_fingerprint || latestAudit?.actorFingerprint),
    rawSensitiveFieldsAbsent: !containsRawSensitiveFields(latestAudit),
  };
}

async function buildButtonRouteAuditLiveReadback({
  live = false,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  let rpcResult = {
    ok: false,
    attempted: false,
    status: live ? "blocked" : "not_requested",
    rpc: AUDIT_READBACK_RPC,
    httpStatus: null,
    payload: null,
    reasonCodes: live ? [] : ["live_flag_not_set"],
  };

  if (live) {
    const config = supabaseRpcInternals.getServiceRoleRpcConfig(env);
    if (!config.ok) {
      rpcResult = {
        ...rpcResult,
        reasonCodes: config.reasonCodes,
      };
    } else {
      const fetched = await supabaseRpcInternals.callServiceRoleRpc({
        ...config,
        functionName: AUDIT_READBACK_RPC,
        payload: {},
        fetchImpl,
      });
      rpcResult = {
        ok: fetched.ok,
        attempted: true,
        status: fetched.ok ? "readback_loaded" : "failed",
        rpc: AUDIT_READBACK_RPC,
        httpStatus: fetched.httpStatus,
        payload: fetched.ok ? fetched.payload : null,
        reasonCodes: fetched.ok ? [] : ["button_route_audit_readback_rpc_failed"],
      };
    }
  }

  const summary = summarizeAuditReadback(rpcResult.payload || {});
  const reasonCodes = live
    ? [...rpcResult.reasonCodes, ...(summary.rawSensitiveFieldsAbsent ? [] : ["button_route_audit_raw_sensitive_fields_present"])]
    : [];
  const result = {
    ok: live ? reasonCodes.length === 0 : true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    liveAttempted: rpcResult.attempted,
    slashCommandsAdmitted: false,
    status: live ? rpcResult.status : "ready_for_button_route_audit_live_readback",
    rpc: AUDIT_READBACK_RPC,
    summary,
    readback: rpcResult.payload,
    reasonCodes: [...new Set(reasonCodes)],
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_live_readback_ready"
        : "discordos.button_route.audit_live_readback_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_live_readback",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveAttempted: result.liveAttempted,
        auditCount: summary.auditCount,
        rawSensitiveFieldsAbsent: summary.rawSensitiveFieldsAbsent,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Live Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- audit count: \`${result.summary.auditCount}\``,
    `- latest custom id: \`${result.summary.latestCustomId || "none"}\``,
    `- raw sensitive fields absent: \`${result.summary.rawSensitiveFieldsAbsent ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditLiveReadback(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) {
      process.exitCode = 1;
    }
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
    AUDIT_READBACK_RPC,
    parseArgs,
    containsRawSensitiveFields,
    summarizeAuditReadback,
    buildButtonRouteAuditLiveReadback,
    renderMarkdown,
  },
};
