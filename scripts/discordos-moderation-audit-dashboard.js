const {
  _internals: searchInternals,
} = require("./discordos-moderation-audit-review-search");

function parseArgs(args) {
  return searchInternals.parseArgs(args);
}

function increment(map, key) {
  const normalized = key || "unknown";
  map[normalized] = (map[normalized] || 0) + 1;
}

function summarizeModerationRows(rows) {
  const actionCounts = {};
  const severityCounts = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    increment(actionCounts, row.actionType);
    increment(severityCounts, row.severity);
  }
  return {
    actionCounts,
    severityCounts,
    latestCaseId: rows?.[0]?.caseId || null,
  };
}

async function buildModerationAuditDashboard(options = {}) {
  const search = await searchInternals.buildModerationAuditReviewSearch(options);
  const summary = summarizeModerationRows(search.rows);
  const result = {
    ok: search.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    exportWrites: false,
    liveAttempted: search.liveAttempted,
    status: search.ok ? "dashboard_ready" : "blocked",
    returnedCount: search.returnedCount,
    summary,
    search,
    reasonCodes: search.reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.moderation.audit_dashboard_ready"
        : "discordos.moderation.audit_dashboard_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.moderation.audit_dashboard",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveAttempted: result.liveAttempted,
        returnedCount: result.returnedCount,
        exportWrites: result.exportWrites,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Moderation Audit Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- export writes: \`${result.exportWrites ? "true" : "false"}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- returned count: \`${result.returnedCount}\``,
    `- latest case: \`${result.summary.latestCaseId || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const [action, count] of Object.entries(result.summary.actionCounts)) {
    lines.push(`- action ${action}: \`${count}\``);
  }
  for (const [severity, count] of Object.entries(result.summary.severityCounts)) {
    lines.push(`- severity ${severity}: \`${count}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildModerationAuditDashboard(options);
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
    summarizeModerationRows,
    buildModerationAuditDashboard,
    renderMarkdown,
  },
};
