const crypto = require("node:crypto");
const {
  _internals: smokeInternals,
} = require("./discordos-signed-interaction-endpoint-smoke");
const {
  _internals: supabaseRpcInternals,
} = require("./discordos-supabase-service-rpc");

const AUDIT_WRITE_ENV = "DISCORDOS_BUTTON_ROUTE_AUDIT_WRITE";
const AUDIT_WRITE_ENV_VALUE = "enabled";
const AUDIT_WRITE_RPC = "discordos_insert_button_route_audit";

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

function parseArgs(args) {
  const options = {
    json: false,
    type: "MESSAGE_COMPONENT",
    executeRoute: true,
    guildId: "1504668396338413670",
    channelId: "1515943795999510579",
    actorDiscordUserId: "1515220075366580224",
    messageId: "1516000000000000000",
    allowStorageWrite: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--type") {
      options.type = readValue(args, index, "missing_type_value");
      index += 1;
    } else if (arg === "--execute-route") {
      options.executeRoute = true;
    } else if (arg === "--guild-id") {
      options.guildId = readValue(args, index, "missing_guild_id_value");
      index += 1;
    } else if (arg === "--channel-id") {
      options.channelId = readValue(args, index, "missing_channel_id_value");
      index += 1;
    } else if (arg === "--actor-user-id") {
      options.actorDiscordUserId = readValue(args, index, "missing_actor_user_id_value");
      index += 1;
    } else if (arg === "--message-id") {
      options.messageId = readValue(args, index, "missing_message_id_value");
      index += 1;
    } else if (arg === "--allow-storage-write") {
      options.allowStorageWrite = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex").slice(0, 24);
}

function resolveAuditWriteAdmission({ allowStorageWrite, env }) {
  const envEnabled = env?.[AUDIT_WRITE_ENV] === AUDIT_WRITE_ENV_VALUE;
  if (!allowStorageWrite && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "audit_write_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowStorageWrite && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "audit_write_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["button_route_audit_write_double_guard_missing"],
  };
}

function buildAuditPayload(smoke = {}, input = {}) {
  return {
    interaction_type: smoke.routeAudit?.interactionType || input.type || null,
    route_kind: smoke.routeAudit?.routeKind || null,
    custom_id: smoke.routeAudit?.customId || null,
    response_type: smoke.routeAudit?.responseType || null,
    execution_status: smoke.routeAudit?.executionStatus || null,
    storage_write_attempted: smoke.routeAudit?.storageWriteAttempted === true,
    storage_write_status: smoke.routeAudit?.storageWriteStatus || null,
    slash_commands_admitted: false,
    command_executed: false,
    guild_id: input.guildId || null,
    channel_id: input.channelId || null,
    message_id: input.messageId || null,
    actor_fingerprint: fingerprint(input.actorDiscordUserId),
    proof_payload: {
      source: "discordos.button_route_audit_persistence",
      sendsMessages: false,
      callsDiscordApi: false,
      rawTokenDataStored: false,
    },
    reason_codes: smoke.reasonCodes || [],
  };
}

async function executeAuditWrite({ payload, env, fetchImpl }) {
  const config = supabaseRpcInternals.getServiceRoleRpcConfig(env);
  if (!config.ok) {
    return {
      ok: false,
      attempted: false,
      status: "blocked",
      rpc: AUDIT_WRITE_RPC,
      httpStatus: null,
      row: null,
      reasonCodes: config.reasonCodes,
    };
  }

  const rpcResult = await supabaseRpcInternals.callServiceRoleRpc({
    ...config,
    functionName: AUDIT_WRITE_RPC,
    payload: { payload },
    fetchImpl,
  });

  return {
    ok: rpcResult.ok,
    attempted: true,
    status: rpcResult.ok ? "written" : "failed",
    rpc: AUDIT_WRITE_RPC,
    httpStatus: rpcResult.httpStatus,
    row: rpcResult.ok ? rpcResult.payload : null,
    reasonCodes: rpcResult.ok ? [] : ["button_route_audit_write_rpc_failed"],
  };
}

async function buildButtonRouteAuditPersistence({
  env = process.env,
  fetchImpl = fetch,
  allowStorageWrite = false,
  apply = false,
  ...input
} = {}) {
  const smoke = await smokeInternals.buildSignedInteractionEndpointSmoke({
    ...input,
    env,
    fetchImpl,
  });
  const admission = resolveAuditWriteAdmission({ allowStorageWrite, env });
  const auditPayload = buildAuditPayload(smoke, input);
  let auditWriteResult = {
    ok: false,
    attempted: false,
    status: apply ? "blocked" : "not_requested",
    rpc: AUDIT_WRITE_RPC,
    httpStatus: null,
    row: null,
    reasonCodes: apply && !admission.admitted ? ["button_route_audit_write_not_admitted"] : [],
  };

  if (apply && admission.admitted && smoke.ok) {
    auditWriteResult = await executeAuditWrite({
      payload: auditPayload,
      env,
      fetchImpl,
    });
  }

  const routeAuditReady = smoke.signatureVerified === true
    && smoke.routeAudit?.routeKind === "message_component"
    && Boolean(smoke.routeAudit?.customId);
  if (apply && admission.admitted && routeAuditReady && !auditWriteResult.attempted) {
    auditWriteResult = await executeAuditWrite({
      payload: auditPayload,
      env,
      fetchImpl,
    });
  }
  const reasonCodes = [...new Set([
    ...(routeAuditReady ? [] : smoke.reasonCodes),
    ...admission.reasonCodes,
    ...auditWriteResult.reasonCodes,
  ])];
  const result = {
    ok: routeAuditReady && reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: auditWriteResult.attempted,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "button_route_audit_persistence_ready" : "blocked",
    smoke: {
      status: smoke.status,
      interactionType: smoke.interactionType,
      responseType: smoke.responseType,
      signatureVerified: smoke.signatureVerified,
      routeAudit: smoke.routeAudit,
      routeReasonCodes: smoke.reasonCodes,
    },
    admission,
    auditPayload,
    auditWritePreview: {
      rpc: AUDIT_WRITE_RPC,
      operation: "insert",
      tableRefs: ["discordos.discordos_button_route_audit"],
      parameterized: true,
      storesRawTokenData: false,
    },
    auditWriteResult,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.button_route.audit_persistence_ready"
        : "discordos.button_route.audit_persistence_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.button_route.audit_persistence",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        interactionType: result.smoke.interactionType,
        responseType: result.smoke.responseType,
        executesStorageWrite: result.executesStorageWrite,
        slashCommandsAdmitted: false,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Button Route Audit Persistence",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- audit rpc: \`${result.auditWritePreview.rpc}\``,
    `- audit write status: \`${result.auditWriteResult.status}\``,
    `- response type: \`${result.smoke.responseType || "none"}\``,
    `- route kind: \`${result.smoke.routeAudit.routeKind || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildButtonRouteAuditPersistence(options);
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
    AUDIT_WRITE_ENV,
    AUDIT_WRITE_ENV_VALUE,
    AUDIT_WRITE_RPC,
    parseArgs,
    fingerprint,
    resolveAuditWriteAdmission,
    buildAuditPayload,
    executeAuditWrite,
    buildButtonRouteAuditPersistence,
    renderMarkdown,
  },
};
