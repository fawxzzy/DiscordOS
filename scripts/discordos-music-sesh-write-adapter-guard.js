const crypto = require("node:crypto");
const {
  _internals: runtimeInternals,
} = require("./discordos-music-sesh-runtime");
const {
  _internals: supabaseRpcInternals,
} = require("./discordos-supabase-service-rpc");

const STORAGE_WRITE_ENV = "DISCORDOS_MUSIC_SESH_WRITE_ADAPTER";
const STORAGE_WRITE_ENV_VALUE = "enabled";
const STORAGE_WRITE_RPC = "discordos_upsert_music_sesh_event";
const ACTIVE_WRITE_GATES = [
  "music_sesh_runtime_input_valid",
  "music_sesh_storage_schema_admitted",
  "no_discord_send",
  "no_provider_playback",
  "parameterized_upsert_preview",
  "double_guard_required_for_storage_write",
];

function parseArgs(args) {
  const runtimeArgs = [];
  const options = {
    allowStorageWrite: false,
    apply: false,
  };

  for (const arg of args) {
    if (arg === "--allow-storage-write") {
      options.allowStorageWrite = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else {
      runtimeArgs.push(arg);
    }
  }

  return {
    ...runtimeInternals.parseArgs(runtimeArgs),
    ...options,
  };
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex").slice(0, 24);
}

function slug(value) {
  return String(value || "item")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "item";
}

function resolveStorageWriteAdmission({ allowStorageWrite, env }) {
  const envEnabled = env?.[STORAGE_WRITE_ENV] === STORAGE_WRITE_ENV_VALUE;
  if (!allowStorageWrite && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "no_write_guard_active",
      reasonCodes: [],
    };
  }
  if (allowStorageWrite && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "storage_write_plan_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["storage_write_double_guard_missing"],
  };
}

function buildStorageWritePreview(runtimePlan, input = {}) {
  return {
    rpc: STORAGE_WRITE_RPC,
    operation: "upsert",
    tableRefs: [
      "discordos.discordos_music_sesh_sessions",
      "discordos.discordos_music_sesh_queue_items",
      "discordos.discordos_music_sesh_votes",
    ],
    conflictTargets: ["session_id", "queue_item_id", "session_id:queue_item_id:actor_fingerprint"],
    idempotencyKey: input.sessionId || runtimePlan.workflow.sessionId,
    parameterized: true,
  };
}

function buildStorageWritePayload(runtimePlan, input = {}) {
  const sessionId = input.sessionId || runtimePlan.workflow.sessionId;
  const itemSlug = slug(input.itemTitle || "queued-item");
  const queueItemId = `${sessionId}:${itemSlug}`;
  const actorFingerprint = fingerprint(input.actorDiscordUserId);

  return {
    session_id: sessionId,
    action: input.action || runtimePlan.workflow.action,
    guild_id: input.guildId,
    channel_id: input.channelId,
    actor_fingerprint: actorFingerprint,
    item_title: input.itemTitle || null,
    queue_item_id: input.action === "queue_item" || input.action === "vote" ? queueItemId : null,
    queue_position: 0,
    vote_id: input.action === "vote" ? `${sessionId}:${queueItemId}:${actorFingerprint}` : null,
    vote_direction: input.voteDirection || null,
    proof_payload: {
      source: "discordos.music_sesh_write_adapter_guard",
      providerCallsAllowed: false,
      playbackAllowed: false,
    },
    reason_codes: runtimePlan.reasonCodes,
  };
}

async function executeStorageWrite({ payload, env, fetchImpl }) {
  const config = supabaseRpcInternals.getServiceRoleRpcConfig(env);
  if (!config.ok) {
    return {
      ok: false,
      attempted: false,
      status: "blocked",
      rpc: STORAGE_WRITE_RPC,
      httpStatus: null,
      row: null,
      reasonCodes: config.reasonCodes,
    };
  }

  const rpcResult = await supabaseRpcInternals.callServiceRoleRpc({
    ...config,
    functionName: STORAGE_WRITE_RPC,
    payload: { payload },
    fetchImpl,
  });

  return {
    ok: rpcResult.ok,
    attempted: true,
    status: rpcResult.ok ? "written" : "failed",
    rpc: STORAGE_WRITE_RPC,
    httpStatus: rpcResult.httpStatus,
    row: rpcResult.ok ? rpcResult.payload : null,
    reasonCodes: rpcResult.ok ? [] : ["storage_write_rpc_failed"],
  };
}

async function buildMusicSeshWriteAdapterGuard({
  env = process.env,
  allowStorageWrite = false,
  apply = false,
  fetchImpl = fetch,
  ...input
} = {}) {
  const runtimePlan = runtimeInternals.buildMusicSeshRuntime(input);
  const storageAdmission = resolveStorageWriteAdmission({ allowStorageWrite, env });
  const storageWritesAllowed = runtimePlan.ok && storageAdmission.admitted;
  const storageWritePayload = buildStorageWritePayload(runtimePlan, input);
  let storageWriteResult = {
    ok: false,
    attempted: false,
    status: apply ? "blocked" : "not_requested",
    rpc: STORAGE_WRITE_RPC,
    httpStatus: null,
    row: null,
    reasonCodes: apply && !storageWritesAllowed ? ["storage_write_not_admitted"] : [],
  };

  if (apply && storageWritesAllowed) {
    storageWriteResult = await executeStorageWrite({
      payload: storageWritePayload,
      env,
      fetchImpl,
    });
  }

  const reasonCodes = [...new Set([
    ...runtimePlan.reasonCodes,
    ...storageAdmission.reasonCodes,
    ...storageWriteResult.reasonCodes,
  ])];
  const result = {
    ok: runtimePlan.ok && storageAdmission.reasonCodes.length === 0 && storageWriteResult.reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    executesStorageWrite: storageWriteResult.attempted,
    status: reasonCodes.length === 0 ? "guard_ready" : "blocked",
    adapterStatus: storageWriteResult.attempted && storageWriteResult.ok
      ? "storage_write_executed"
      : storageWritesAllowed
        ? "storage_write_plan_admitted"
        : "no_live_no_send_guarded",
    storageWritesAllowed,
    liveBehaviorAllowed: false,
    activeWriteGates: ACTIVE_WRITE_GATES,
    storageWriteAdmission: storageAdmission,
    storageWritePreview: buildStorageWritePreview(runtimePlan, input),
    storageWritePayload,
    storageWriteResult,
    runtimePlan: {
      ok: runtimePlan.ok,
      status: runtimePlan.status,
      action: runtimePlan.workflow.action,
    },
    reasonCodes,
  };

  return {
    ...result,
    event: classifyMusicSeshWriteAdapterGuardEvent(result),
  };
}

function classifyMusicSeshWriteAdapterGuardEvent(result) {
  return {
    type: result.ok
      ? "discordos.music_sesh.write_adapter_guard_ready"
      : "discordos.music_sesh.write_adapter_guard_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.music_sesh.write_adapter_guard",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      action: result.runtimePlan.action || "unknown",
      storageWritesAllowed: result.storageWritesAllowed,
      executesStorageWrite: result.executesStorageWrite,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Write Adapter Guard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- executes storage write: \`${result.executesStorageWrite ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- adapter status: \`${result.adapterStatus}\``,
    `- storage writes allowed: \`${result.storageWritesAllowed ? "true" : "false"}\``,
    `- storage write rpc: \`${result.storageWriteResult.rpc}\``,
    `- live behavior allowed: \`${result.liveBehaviorAllowed ? "true" : "false"}\``,
    `- action: \`${result.runtimePlan.action || "unknown"}\``,
    `- active write gates: \`${result.activeWriteGates.length}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshWriteAdapterGuard(options);
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
    STORAGE_WRITE_ENV,
    STORAGE_WRITE_ENV_VALUE,
    STORAGE_WRITE_RPC,
    ACTIVE_WRITE_GATES,
    parseArgs,
    fingerprint,
    slug,
    resolveStorageWriteAdmission,
    buildStorageWritePreview,
    buildStorageWritePayload,
    executeStorageWrite,
    buildMusicSeshWriteAdapterGuard,
    classifyMusicSeshWriteAdapterGuardEvent,
    renderMarkdown,
  },
};
