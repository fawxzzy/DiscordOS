const {
  _internals: liveReadbackInternals,
} = require("./discordos-product-workflow-live-readback");

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
    live: false,
    minBoardCards: 0,
    minModerationAudits: 0,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--live") {
      options.live = true;
    } else if (arg === "--min-board-cards") {
      options.minBoardCards = Number.parseInt(readValue(args, index, "missing_min_board_cards_value"), 10);
      index += 1;
    } else if (arg === "--min-moderation-audits") {
      options.minModerationAudits = Number.parseInt(readValue(args, index, "missing_min_moderation_audits_value"), 10);
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function detectAnomalies({ readback, minBoardCards = 0, minModerationAudits = 0 }) {
  const anomalies = [];
  const boardCardCount = Number(readback?.summary?.boardCardCount || 0);
  const moderationAuditCount = Number(readback?.summary?.moderationAuditCount || 0);

  if (boardCardCount < minBoardCards) {
    anomalies.push("board_card_count_below_threshold");
  }
  if (moderationAuditCount < minModerationAudits) {
    anomalies.push("moderation_audit_count_below_threshold");
  }
  if (readback?.liveAttempted && !readback.summary.latestBoardCardPresent && boardCardCount > 0) {
    anomalies.push("latest_board_card_missing");
  }
  if (readback?.liveAttempted && !readback.summary.latestModerationAuditPresent && moderationAuditCount > 0) {
    anomalies.push("latest_moderation_audit_missing");
  }

  return anomalies;
}

async function buildProductWorkflowMonitor({
  env = process.env,
  fetchImpl = fetch,
  live = false,
  minBoardCards = 0,
  minModerationAudits = 0,
} = {}) {
  const readback = await liveReadbackInternals.buildProductWorkflowLiveReadback({ live, env, fetchImpl });
  const anomalies = readback.ok
    ? detectAnomalies({ readback, minBoardCards, minModerationAudits })
    : readback.reasonCodes;
  const result = {
    ok: readback.ok && anomalies.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    liveAttempted: readback.liveAttempted,
    status: readback.ok && anomalies.length === 0 ? "monitor_clear" : "monitor_attention",
    thresholds: {
      minBoardCards,
      minModerationAudits,
    },
    summary: readback.summary,
    anomalies,
    reasonCodes: anomalies,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.product_workflow.monitor_clear"
        : "discordos.product_workflow.monitor_attention",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.product_workflow.monitor",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveAttempted: result.liveAttempted,
        anomalyCount: result.anomalies.length,
        boardCardCount: result.summary.boardCardCount,
        moderationAuditCount: result.summary.moderationAuditCount,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Product Workflow Monitor",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- board cards: \`${result.summary.boardCardCount}\``,
    `- moderation audits: \`${result.summary.moderationAuditCount}\``,
    `- anomalies: \`${result.anomalies.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildProductWorkflowMonitor(options);
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
    parseArgs,
    detectAnomalies,
    buildProductWorkflowMonitor,
    renderMarkdown,
  },
};
