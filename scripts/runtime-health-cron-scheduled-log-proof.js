const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const DEFAULT_PROJECT = "fawxzzy-discordos";
const DEFAULT_SINCE = "24h";
const DEFAULT_LIMIT = 100;
const CRON_PATH = "/api/cron/runtime-health";

function parseArgs(args) {
  const options = {
    json: false,
    project: DEFAULT_PROJECT,
    since: DEFAULT_SINCE,
    until: null,
    limit: DEFAULT_LIMIT,
    expectedPath: CRON_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--project") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_project_value");
      }
      options.project = value.trim();
      index += 1;
    } else if (arg === "--since") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_since_value");
      }
      options.since = value.trim();
      index += 1;
    } else if (arg === "--until") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_until_value");
      }
      options.until = value.trim();
      index += 1;
    } else if (arg === "--limit") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
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

function buildVercelLogArgs({ project, since, until, limit, expectedPath }) {
  const args = [
    "logs",
    "--environment",
    "production",
    "--no-branch",
    "--project",
    project,
    "--since",
    since,
    "--limit",
    String(limit),
    "--query",
    expectedPath,
    "--json",
  ];

  if (until) {
    args.push("--until", until);
  }

  return args;
}

function getVercelExecutable(platform = process.platform) {
  return platform === "win32" ? "vercel.cmd" : "vercel";
}

async function runVercelLogs({ project, since, until, limit, expectedPath, execFileImpl = execFileAsync }) {
  const args = buildVercelLogArgs({
    project,
    since,
    until,
    limit,
    expectedPath,
  });
  const result = await execFileImpl(getVercelExecutable(), args, {
    maxBuffer: 1024 * 1024 * 4,
    shell: process.platform === "win32",
  });
  return {
    args,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function parseJsonLines(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function textFromValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function getFirstString(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function getFirstNumber(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return Number.parseInt(value, 10);
    }
  }
  return null;
}

function getFirstTimestampString(record, keys) {
  const stringValue = getFirstString(record, keys);
  if (stringValue) {
    return stringValue;
  }
  const numericValue = getFirstNumber(record, keys);
  if (numericValue) {
    return new Date(numericValue).toISOString();
  }
  return null;
}

function recordContainsPath(record, expectedPath) {
  const fields = [
    record?.path,
    record?.requestPath,
    record?.url,
    record?.requestUrl,
    record?.message,
    record?.text,
    record?.request?.path,
    record?.request?.url,
  ];
  return fields.some((field) => textFromValue(field).includes(expectedPath));
}

function recordContainsCronIdentity(record) {
  const fields = [
    record?.userAgent,
    record?.user_agent,
    record?.requestUserAgent,
    record?.request?.userAgent,
    record?.request?.headers?.["user-agent"],
    record?.request?.headers?.["User-Agent"],
    record?.headers?.["user-agent"],
    record?.headers?.["User-Agent"],
    record?.message,
    record?.text,
  ];
  return fields.some((field) => textFromValue(field).includes("vercel-cron/1.0"));
}

function normalizeLogRecord(record, expectedPath) {
  return {
    timestamp: getFirstTimestampString(record, ["timestamp", "time", "createdAt", "date"]),
    requestId: getFirstString(record, ["requestId", "request_id", "id"]),
    method: getFirstString(record, ["method", "requestMethod"]) || getFirstString(record?.request, ["method"]),
    path: getFirstString(record, ["path", "requestPath", "url", "requestUrl"]) ||
      getFirstString(record?.request, ["path", "url"]),
    statusCode: getFirstNumber(record, ["statusCode", "responseStatusCode", "status", "status_code"]) ||
      getFirstNumber(record?.response, ["statusCode", "status"]),
    containsExpectedPath: recordContainsPath(record, expectedPath),
    vercelCronIdentity: recordContainsCronIdentity(record),
  };
}

function selectScheduledCronCandidates(records, expectedPath) {
  return records
    .map((record) => normalizeLogRecord(record, expectedPath))
    .filter((record) => record.containsExpectedPath);
}

function summarizeStatusCounts(records) {
  return records.reduce((counts, record) => {
    const key = record.statusCode === null || record.statusCode === undefined
      ? "unknown"
      : String(record.statusCode);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function renderStatusCounts(counts) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0
    ? entries.map(([status, count]) => `${status}:${count}`).join(",")
    : "none";
}

function summarizeScheduledCronLogProof({ records, expectedPath, project, since, until }) {
  const candidates = selectScheduledCronCandidates(records, expectedPath);
  const passingCandidates = candidates.filter((record) => record.statusCode === 200);
  const verifiedCandidates = candidates.filter((record) => record.vercelCronIdentity);
  const verifiedPassingCandidates = verifiedCandidates.filter((record) => record.statusCode === 200);
  const unverifiedPassingCandidates = passingCandidates.filter((record) => !record.vercelCronIdentity);
  const latestPassing = verifiedPassingCandidates[0] || null;
  const latestUnverifiedPassing = unverifiedPassingCandidates[0] || null;
  const latestCandidate = candidates[0] || null;
  const proof = {
    ok: Boolean(latestPassing),
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    project,
    since,
    until: until || null,
    expectedPath,
    totalLogRecords: records.length,
    candidateCount: candidates.length,
    passingCandidateCount: passingCandidates.length,
    verifiedCandidateCount: verifiedCandidates.length,
    verifiedPassingCandidateCount: verifiedPassingCandidates.length,
    unverifiedPassingCandidateCount: unverifiedPassingCandidates.length,
    candidateStatusCounts: summarizeStatusCounts(candidates),
    latestCandidate,
    latestPassing,
    latestUnverifiedPassing,
    reasonCodes: latestPassing ? [] : (
      unverifiedPassingCandidates.length > 0
        ? ["scheduled_cron_identity_unverified"]
        : candidates.length > 0
          ? ["scheduled_cron_no_passing_candidate"]
          : ["scheduled_cron_log_not_found"]
    ),
  };

  return {
    ...proof,
    event: classifyScheduledCronLogProofEvent(proof),
  };
}

function classifyScheduledCronLogProofEvent(proof) {
  return {
    type: proof.ok
      ? "discordos.runtime_health.cron_scheduled_log_proof_pass"
      : "discordos.runtime_health.cron_scheduled_log_proof_missing",
    severity: proof.ok ? "info" : "warning",
    subject: "discordos.runtime",
    status: proof.ok ? "pass" : "fail",
    dimensions: {
      project: proof.project,
      expectedPath: proof.expectedPath,
      candidateCount: proof.candidateCount,
      passingCandidateCount: proof.passingCandidateCount,
      verifiedPassingCandidateCount: proof.verifiedPassingCandidateCount,
    },
  };
}

async function buildRuntimeHealthCronScheduledLogProof({
  project,
  since,
  until,
  limit,
  expectedPath,
  execFileImpl,
}) {
  const logResult = await runVercelLogs({
    project,
    since,
    until,
    limit,
    expectedPath,
    execFileImpl,
  });
  const records = parseJsonLines(logResult.stdout);
  return {
    ...summarizeScheduledCronLogProof({
      records,
      expectedPath,
      project,
      since,
      until,
    }),
    command: {
      executable: getVercelExecutable(),
      args: logResult.args,
    },
  };
}

function renderMarkdown(proof) {
  const lines = [
    "# DiscordOS Runtime Health Cron Scheduled Log Proof",
    "",
    `- result: \`${proof.ok ? "pass" : "fail"}\``,
    `- destructive: \`${proof.destructive ? "true" : "false"}\``,
    `- sends messages: \`${proof.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${proof.writesArtifacts ? "true" : "false"}\``,
    `- event type: \`${proof.event.type}\``,
    `- event severity: \`${proof.event.severity}\``,
    `- project: \`${proof.project}\``,
    `- since: \`${proof.since}\``,
    `- until: \`${proof.until || "now"}\``,
    `- expected path: \`${proof.expectedPath}\``,
    `- total log records: \`${proof.totalLogRecords}\``,
    `- cron candidate count: \`${proof.candidateCount}\``,
    `- passing candidate count: \`${proof.passingCandidateCount}\``,
    `- verified candidate count: \`${proof.verifiedCandidateCount}\``,
    `- verified passing candidate count: \`${proof.verifiedPassingCandidateCount}\``,
    `- unverified passing candidate count: \`${proof.unverifiedPassingCandidateCount}\``,
    `- candidate status counts: \`${renderStatusCounts(proof.candidateStatusCounts || {})}\``,
    `- latest candidate timestamp: \`${proof.latestCandidate?.timestamp || "none"}\``,
    `- latest candidate status: \`${proof.latestCandidate?.statusCode ?? "none"}\``,
    `- latest passing timestamp: \`${proof.latestPassing?.timestamp || "none"}\``,
    `- latest passing status: \`${proof.latestPassing?.statusCode ?? "none"}\``,
    `- latest unverified passing timestamp: \`${proof.latestUnverifiedPassing?.timestamp || "none"}\``,
    `- reason codes: \`${proof.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const proof = await buildRuntimeHealthCronScheduledLogProof(options);
    process.stdout.write(options.json ? `${JSON.stringify(proof, null, 2)}\n` : renderMarkdown(proof));
    if (!proof.ok) {
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
    DEFAULT_PROJECT,
    DEFAULT_SINCE,
    DEFAULT_LIMIT,
    CRON_PATH,
    parseArgs,
    buildVercelLogArgs,
    getVercelExecutable,
    runVercelLogs,
    parseJsonLines,
    recordContainsCronIdentity,
    normalizeLogRecord,
    selectScheduledCronCandidates,
    summarizeStatusCounts,
    renderStatusCounts,
    summarizeScheduledCronLogProof,
    classifyScheduledCronLogProofEvent,
    buildRuntimeHealthCronScheduledLogProof,
    renderMarkdown,
  },
};
