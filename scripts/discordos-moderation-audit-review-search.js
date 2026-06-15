const {
  _internals: moderationPreflightInternals,
} = require("./discordos-moderation-preflight");
const {
  _internals: supabaseRpcInternals,
} = require("./discordos-supabase-service-rpc");

const REVIEW_SEARCH_RPC = "discordos_search_moderation_audit";

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
    caseId: null,
    action: null,
    subjectFingerprint: null,
    limit: 10,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--live") {
      options.live = true;
    } else if (arg === "--case-id") {
      options.caseId = moderationPreflightInternals.normalizeCaseId(readValue(args, index, "missing_case_id_value"));
      index += 1;
    } else if (arg === "--action") {
      options.action = readValue(args, index, "missing_action_value");
      index += 1;
    } else if (arg === "--subject-fingerprint") {
      options.subjectFingerprint = readValue(args, index, "missing_subject_fingerprint_value");
      index += 1;
    } else if (arg === "--limit") {
      const value = Number.parseInt(readValue(args, index, "missing_limit_value"), 10);
      if (!Number.isInteger(value) || value < 1 || value > 50) {
        throw new Error("invalid_limit");
      }
      options.limit = value;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function validateSearchInput(input = {}) {
  const reasonCodes = [];
  if (input.action && !moderationPreflightInternals.ALLOWED_ACTIONS.has(input.action)) {
    reasonCodes.push("action_not_admitted");
  }
  if (input.subjectFingerprint && !/^[a-f0-9]{12}$/.test(input.subjectFingerprint)) {
    reasonCodes.push("subject_fingerprint_invalid");
  }
  return {
    ok: reasonCodes.length === 0,
    reasonCodes,
  };
}

function buildSearchPayload(input = {}) {
  return {
    case_id: input.caseId || null,
    action_type: input.action || null,
    subject_discord_user_fingerprint: input.subjectFingerprint || null,
    limit: input.limit || 10,
  };
}

function summarizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    caseId: row.caseId || null,
    actionType: row.actionType || null,
    severity: row.severity || null,
    actorFingerprintPresent: typeof row.actorFingerprint === "string",
    subjectFingerprintPresent: typeof row.subjectFingerprint === "string",
    reasonPresent: row.reasonPresent === true,
    notePresent: row.notePresent === true,
    occurredAt: row.occurredAt || null,
  }));
}

function classifyModerationAuditReviewSearchEvent(result) {
  return {
    type: result.ok
      ? "discordos.moderation.audit_review_search_ready"
      : "discordos.moderation.audit_review_search_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.moderation.audit_review_search",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      liveAttempted: result.liveAttempted,
      returnedCount: result.returnedCount,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildModerationAuditReviewSearch({
  live = false,
  env = process.env,
  fetchImpl = fetch,
  ...input
} = {}) {
  const validation = validateSearchInput(input);
  const payload = buildSearchPayload(input);
  let rpcResult = {
    ok: false,
    attempted: false,
    status: live ? "blocked" : "not_requested",
    httpStatus: null,
    payload: null,
    reasonCodes: live ? [] : ["live_flag_not_set"],
  };

  if (validation.ok && live) {
    const config = supabaseRpcInternals.getServiceRoleRpcConfig(env);
    if (!config.ok) {
      rpcResult = {
        ...rpcResult,
        reasonCodes: config.reasonCodes,
      };
    } else {
      const fetched = await supabaseRpcInternals.callServiceRoleRpc({
        ...config,
        functionName: REVIEW_SEARCH_RPC,
        payload: { payload },
        fetchImpl,
      });
      rpcResult = {
        ok: fetched.ok,
        attempted: true,
        status: fetched.ok ? "search_loaded" : "failed",
        httpStatus: fetched.httpStatus,
        payload: fetched.ok ? fetched.payload : null,
        reasonCodes: fetched.ok ? [] : ["moderation_audit_search_rpc_failed"],
      };
    }
  }

  const rows = summarizeRows(rpcResult.payload?.rows);
  const reasonCodes = [...new Set([
    ...validation.reasonCodes,
    ...(live ? rpcResult.reasonCodes : []),
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    liveAttempted: rpcResult.attempted,
    status: live ? rpcResult.status : "review_search_ready",
    rpc: REVIEW_SEARCH_RPC,
    query: payload,
    returnedCount: live ? Number(rpcResult.payload?.returnedCount || rows.length) : 0,
    rows,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyModerationAuditReviewSearchEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Moderation Audit Review Search",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- rpc: \`${result.rpc}\``,
    `- returned count: \`${result.returnedCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const row of result.rows) {
    lines.push(`- row ${row.caseId || "unknown"}: action \`${row.actionType || "unknown"}\`, severity \`${row.severity || "unknown"}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildModerationAuditReviewSearch(options);
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
    REVIEW_SEARCH_RPC,
    parseArgs,
    validateSearchInput,
    buildSearchPayload,
    summarizeRows,
    classifyModerationAuditReviewSearchEvent,
    buildModerationAuditReviewSearch,
    renderMarkdown,
  },
};
