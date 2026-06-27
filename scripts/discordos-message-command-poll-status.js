const DEFAULT_REPO_FULL_NAME = "fawxzzy/DiscordOS";
const DEFAULT_WORKFLOW_ID = "discord-message-command-poll.yml";
const DEFAULT_MAX_STALE_MINUTES = 15;
const DEFAULT_RUNS_PER_PAGE = 5;

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseArgs(args) {
  const options = {
    json: false,
    repoFullName: DEFAULT_REPO_FULL_NAME,
    workflowId: DEFAULT_WORKFLOW_ID,
    maxStaleMinutes: DEFAULT_MAX_STALE_MINUTES,
    perPage: DEFAULT_RUNS_PER_PAGE,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--repo") {
      const value = args[index + 1];
      if (!hasValue(value)) {
        throw new Error("missing_repo_value");
      }
      options.repoFullName = value.trim();
      index += 1;
    } else if (arg === "--workflow") {
      const value = args[index + 1];
      if (!hasValue(value)) {
        throw new Error("missing_workflow_value");
      }
      options.workflowId = value.trim();
      index += 1;
    } else if (arg === "--max-stale-minutes") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1 || value > 1440) {
        throw new Error("invalid_max_stale_minutes");
      }
      options.maxStaleMinutes = value;
      index += 1;
    } else if (arg === "--per-page") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new Error("invalid_per_page");
      }
      options.perPage = value;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function cleanRepoPathSegment(value) {
  return encodeURIComponent(String(value || "").trim());
}

function buildWorkflowApiUrl(repoFullName, workflowId) {
  const [owner, repo] = String(repoFullName || "").split("/");
  if (!hasValue(owner) || !hasValue(repo)) {
    throw new Error("invalid_repo_full_name");
  }

  return `https://api.github.com/repos/${cleanRepoPathSegment(owner)}/${cleanRepoPathSegment(repo)}/actions/workflows/${encodeURIComponent(String(workflowId || "").trim())}`;
}

async function fetchJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      "cache-control": "no-cache",
      "user-agent": "discordos-message-command-poll-status/1.0",
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    payload,
  };
}

function parseIsoTimestamp(value) {
  if (!hasValue(value)) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeLatestRun(run, nowMs) {
  if (!run || typeof run !== "object") {
    return null;
  }

  const referenceTimestamp =
    parseIsoTimestamp(run.run_started_at)
    ?? parseIsoTimestamp(run.created_at)
    ?? parseIsoTimestamp(run.updated_at);
  const ageMinutes = referenceTimestamp === null
    ? null
    : Math.max(0, Math.floor((nowMs - referenceTimestamp) / 60000));

  return {
    id: typeof run.id === "number" ? run.id : null,
    runNumber: typeof run.run_number === "number" ? run.run_number : null,
    event: hasValue(run.event) ? run.event.trim() : null,
    status: hasValue(run.status) ? run.status.trim() : null,
    conclusion: hasValue(run.conclusion) ? run.conclusion.trim() : null,
    createdAt: hasValue(run.created_at) ? run.created_at.trim() : null,
    updatedAt: hasValue(run.updated_at) ? run.updated_at.trim() : null,
    runStartedAt: hasValue(run.run_started_at) ? run.run_started_at.trim() : null,
    url: hasValue(run.html_url) ? run.html_url.trim() : null,
    ageMinutes,
  };
}

function classifyMessageCommandPollStatus({
  workflow = {},
  runs = [],
  repoFullName,
  workflowId,
  maxStaleMinutes,
  nowMs,
}) {
  const reasonCodes = [];
  const latestRun = normalizeLatestRun(Array.isArray(runs) ? runs[0] : null, nowMs);
  const workflowState = hasValue(workflow.state) ? workflow.state.trim() : "unknown";
  const workflowName = hasValue(workflow.name) ? workflow.name.trim() : String(workflowId);

  if (workflowState !== "active") {
    reasonCodes.push("workflow_not_active");
  }

  if (!latestRun) {
    reasonCodes.push("workflow_run_missing");
  } else {
    if (latestRun.ageMinutes === null || latestRun.ageMinutes > maxStaleMinutes) {
      reasonCodes.push("latest_run_stale");
    }

    if (latestRun.status === "completed" && latestRun.conclusion !== "success") {
      reasonCodes.push("latest_run_not_successful");
    }

    if (latestRun.status !== "completed" && latestRun.status !== "in_progress" && latestRun.status !== "queued") {
      reasonCodes.push("latest_run_unexpected_status");
    }
  }

  const ok = reasonCodes.length === 0;
  return {
    ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: ok ? "ready" : "action_required",
    repoFullName,
    workflowId,
    workflowName,
    workflowState,
    maxStaleMinutes,
    latestRun,
    reasonCodes,
    event: {
      type: ok
        ? "discordos.message_command_poll.ready"
        : "discordos.message_command_poll.action_required",
      severity: ok ? "info" : "warning",
      subject: "discordos.message_command_poll",
      status: ok ? "pass" : "fail",
      dimensions: {
        workflowState,
        latestRunStatus: latestRun?.status || "missing",
        latestRunConclusion: latestRun?.conclusion || "missing",
        latestRunAgeMinutes: latestRun?.ageMinutes ?? -1,
      },
    },
  };
}

async function buildDiscordMessageCommandPollStatus({
  repoFullName = DEFAULT_REPO_FULL_NAME,
  workflowId = DEFAULT_WORKFLOW_ID,
  maxStaleMinutes = DEFAULT_MAX_STALE_MINUTES,
  perPage = DEFAULT_RUNS_PER_PAGE,
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const workflowUrl = buildWorkflowApiUrl(repoFullName, workflowId);
  const runsUrl = `${workflowUrl}/runs?per_page=${perPage}`;

  try {
    const [workflowResponse, runsResponse] = await Promise.all([
      fetchJson(workflowUrl, fetchImpl),
      fetchJson(runsUrl, fetchImpl),
    ]);

    if (!workflowResponse.ok) {
      return {
        ok: false,
        destructive: false,
        sendsMessages: false,
        writesArtifacts: false,
        status: "api_unavailable",
        repoFullName,
        workflowId,
        workflowName: String(workflowId),
        workflowState: "unknown",
        maxStaleMinutes,
        latestRun: null,
        reasonCodes: ["workflow_lookup_failed"],
        event: {
          type: "discordos.message_command_poll.api_unavailable",
          severity: "warning",
          subject: "discordos.message_command_poll",
          status: "fail",
          dimensions: {
            httpStatus: workflowResponse.status,
          },
        },
      };
    }

    if (!runsResponse.ok) {
      return {
        ok: false,
        destructive: false,
        sendsMessages: false,
        writesArtifacts: false,
        status: "api_unavailable",
        repoFullName,
        workflowId,
        workflowName: hasValue(workflowResponse.payload?.name) ? workflowResponse.payload.name.trim() : String(workflowId),
        workflowState: hasValue(workflowResponse.payload?.state) ? workflowResponse.payload.state.trim() : "unknown",
        maxStaleMinutes,
        latestRun: null,
        reasonCodes: ["workflow_runs_lookup_failed"],
        event: {
          type: "discordos.message_command_poll.api_unavailable",
          severity: "warning",
          subject: "discordos.message_command_poll",
          status: "fail",
          dimensions: {
            httpStatus: runsResponse.status,
          },
        },
      };
    }

    return classifyMessageCommandPollStatus({
      workflow: workflowResponse.payload || {},
      runs: Array.isArray(runsResponse.payload?.workflow_runs) ? runsResponse.payload.workflow_runs : [],
      repoFullName,
      workflowId,
      maxStaleMinutes,
      nowMs: now(),
    });
  } catch (error) {
    return {
      ok: false,
      destructive: false,
      sendsMessages: false,
      writesArtifacts: false,
      status: "api_unavailable",
      repoFullName,
      workflowId,
      workflowName: String(workflowId),
      workflowState: "unknown",
      maxStaleMinutes,
      latestRun: null,
      reasonCodes: ["workflow_api_request_failed"],
      event: {
        type: "discordos.message_command_poll.api_unavailable",
        severity: "warning",
        subject: "discordos.message_command_poll",
        status: "fail",
        dimensions: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }
}

function renderMarkdown(status) {
  const lines = [
    "# DiscordOS Message Command Poll Status",
    "",
    `- result: \`${status.ok ? "pass" : "fail"}\``,
    `- destructive: \`${status.destructive ? "true" : "false"}\``,
    `- sends messages: \`${status.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${status.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${status.status}\``,
    `- event type: \`${status.event.type}\``,
    `- workflow: \`${status.workflowName}\``,
    `- workflow state: \`${status.workflowState}\``,
    `- repo: \`${status.repoFullName}\``,
    `- stale threshold minutes: \`${status.maxStaleMinutes}\``,
    `- reason codes: \`${status.reasonCodes.join(",") || "none"}\``,
    "",
    "## Latest Run",
    "",
    `- id: \`${status.latestRun?.id ?? "none"}\``,
    `- run number: \`${status.latestRun?.runNumber ?? "none"}\``,
    `- event: \`${status.latestRun?.event || "none"}\``,
    `- status: \`${status.latestRun?.status || "none"}\``,
    `- conclusion: \`${status.latestRun?.conclusion || "none"}\``,
    `- age minutes: \`${status.latestRun?.ageMinutes ?? "none"}\``,
    `- started at: \`${status.latestRun?.runStartedAt || "none"}\``,
    `- url: \`${status.latestRun?.url || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const status = await buildDiscordMessageCommandPollStatus(options);
    process.stdout.write(options.json ? `${JSON.stringify(status, null, 2)}\n` : renderMarkdown(status));
    if (!status.ok) {
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
    DEFAULT_REPO_FULL_NAME,
    DEFAULT_WORKFLOW_ID,
    DEFAULT_MAX_STALE_MINUTES,
    DEFAULT_RUNS_PER_PAGE,
    parseArgs,
    buildWorkflowApiUrl,
    normalizeLatestRun,
    classifyMessageCommandPollStatus,
    buildDiscordMessageCommandPollStatus,
    renderMarkdown,
  },
};
