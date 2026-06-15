const {
  _internals: supabaseRpcInternals,
} = require("./discordos-supabase-service-rpc");

function parseArgs(args) {
  const options = {
    json: false,
  };

  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function gateStatus(env = process.env) {
  const rpcConfig = supabaseRpcInternals.getServiceRoleRpcConfig(env);
  const boardGate = env.DISCORDOS_BOARD_ACTIVE_WRITE_ADAPTER === "enabled";
  const moderationGate = env.DISCORDOS_MODERATION_AUDIT_WRITE_ADAPTER === "enabled";

  return {
    supabaseTransportReady: rpcConfig.ok,
    transport: rpcConfig.ok ? rpcConfig.transport : "blocked",
    boardWriterGateEnabled: boardGate,
    moderationWriterGateEnabled: moderationGate,
    edgeBridgeEnabled: rpcConfig.edgeProxyEnabled,
    anonKeyConfigured: rpcConfig.anonKeyConfigured,
    serviceRoleKeyConfigured: rpcConfig.serviceRoleKeyConfigured,
    reasonCodes: rpcConfig.reasonCodes,
  };
}

function buildSteps(status) {
  return [
    {
      id: "enable_edge_bridge",
      command: "$env:DISCORDOS_SUPABASE_WORKFLOW_RPC_EDGE='enabled'",
      ready: status.edgeBridgeEnabled && status.anonKeyConfigured,
    },
    {
      id: "enable_board_writer_gate",
      command: "$env:DISCORDOS_BOARD_ACTIVE_WRITE_ADAPTER='enabled'",
      ready: status.boardWriterGateEnabled,
    },
    {
      id: "enable_moderation_writer_gate",
      command: "$env:DISCORDOS_MODERATION_AUDIT_WRITE_ADAPTER='enabled'",
      ready: status.moderationWriterGateEnabled,
    },
    {
      id: "run_board_apply",
      command: "npm run ops:discordos:board-lifecycle-sync -- --apply-storage",
      ready: status.supabaseTransportReady && status.boardWriterGateEnabled,
    },
    {
      id: "run_moderation_apply",
      command: "npm run ops:discordos:moderation-audit-write-adapter-guard -- --allow-storage-write --apply",
      ready: status.supabaseTransportReady && status.moderationWriterGateEnabled,
    },
    {
      id: "run_live_readback",
      command: "npm run ops:discordos:product-workflow-live-readback -- --live",
      ready: status.supabaseTransportReady,
    },
  ];
}

function buildOperatorActivationRunbook({ env = process.env } = {}) {
  const status = gateStatus(env);
  const steps = buildSteps(status);
  const result = {
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: "runbook_ready",
    activationReady: steps.every((step) => step.ready),
    gateStatus: status,
    steps,
    reasonCodes: status.reasonCodes,
  };

  return {
    ...result,
    event: {
      type: "discordos.operator.activation_runbook_ready",
      severity: "info",
      subject: "discordos.operator.activation_runbook",
      status: "pass",
      dimensions: {
        activationReady: result.activationReady,
        readyStepCount: steps.filter((step) => step.ready).length,
        stepCount: steps.length,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Operator Activation Runbook",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- activation ready: \`${result.activationReady ? "true" : "false"}\``,
    `- transport: \`${result.gateStatus.transport}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const step of result.steps) {
    lines.push(`- step ${step.id}: \`${step.ready ? "ready" : "pending"}\` command \`${step.command}\``);
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildOperatorActivationRunbook(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
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
    gateStatus,
    buildSteps,
    buildOperatorActivationRunbook,
    renderMarkdown,
  },
};
