const {
  _internals: supabaseRpcInternals,
} = require("./discordos-supabase-service-rpc");

const LIVE_READBACK_RPC = "discordos_get_product_workflow_readback";

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

function summarizeReadbackPayload(payload = {}) {
  return {
    boardCardCount: Number(payload.boardCardCount || 0),
    moderationAuditCount: Number(payload.moderationAuditCount || 0),
    latestBoardCardPresent: Boolean(payload.latestBoardCard),
    latestModerationAuditPresent: Boolean(payload.latestModerationAudit),
    generatedAtPresent: typeof payload.generatedAt === "string",
  };
}

function classifyProductWorkflowLiveReadbackEvent(result) {
  return {
    type: result.ok
      ? "discordos.product_workflow.live_readback_ready"
      : "discordos.product_workflow.live_readback_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.product_workflow.live_readback",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      liveAttempted: result.liveAttempted,
      boardCardCount: result.summary.boardCardCount,
      moderationAuditCount: result.summary.moderationAuditCount,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildProductWorkflowLiveReadback({
  live = false,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  let rpcResult = {
    ok: false,
    attempted: false,
    status: live ? "blocked" : "not_requested",
    rpc: LIVE_READBACK_RPC,
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
        functionName: LIVE_READBACK_RPC,
        payload: {},
        fetchImpl,
      });
      rpcResult = {
        ok: fetched.ok,
        attempted: true,
        status: fetched.ok ? "readback_loaded" : "failed",
        rpc: LIVE_READBACK_RPC,
        httpStatus: fetched.httpStatus,
        payload: fetched.ok ? fetched.payload : null,
        reasonCodes: fetched.ok ? [] : ["live_readback_rpc_failed"],
      };
    }
  }

  const summary = summarizeReadbackPayload(rpcResult.payload || {});
  const result = {
    ok: live ? rpcResult.reasonCodes.length === 0 : true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    liveAttempted: rpcResult.attempted,
    status: live
      ? rpcResult.status
      : "ready_for_live_readback",
    rpc: LIVE_READBACK_RPC,
    summary,
    readback: rpcResult.payload,
    reasonCodes: live ? rpcResult.reasonCodes : [],
  };

  return {
    ...result,
    event: classifyProductWorkflowLiveReadbackEvent(result),
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Product Workflow Live Readback",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- rpc: \`${result.rpc}\``,
    `- board cards: \`${result.summary.boardCardCount}\``,
    `- moderation audits: \`${result.summary.moderationAuditCount}\``,
    `- latest board card present: \`${result.summary.latestBoardCardPresent ? "true" : "false"}\``,
    `- latest moderation audit present: \`${result.summary.latestModerationAuditPresent ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildProductWorkflowLiveReadback(options);
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
    LIVE_READBACK_RPC,
    parseArgs,
    summarizeReadbackPayload,
    classifyProductWorkflowLiveReadbackEvent,
    buildProductWorkflowLiveReadback,
    renderMarkdown,
  },
};
