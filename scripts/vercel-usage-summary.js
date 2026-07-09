const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const process = require("node:process");

const DEFAULT_PROJECT_LINK_PATH = path.resolve(__dirname, "..", "config", "vercel.project.json");
const DEFAULT_DEPLOYMENT_LIMIT = 100;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function defaultPeriod() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return {
    from: formatDate(from),
    to: formatDate(to),
  };
}

function parseArgs(args) {
  const period = defaultPeriod();
  const options = {
    json: false,
    scope: null,
    from: period.from,
    to: period.to,
    breakdown: null,
    teamId: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--scope") {
      options.scope = String(args[index + 1] || "").trim() || null;
      index += 1;
    } else if (arg === "--from") {
      options.from = String(args[index + 1] || "").trim();
      index += 1;
    } else if (arg === "--to") {
      options.to = String(args[index + 1] || "").trim();
      index += 1;
    } else if (arg === "--breakdown") {
      options.breakdown = String(args[index + 1] || "").trim() || null;
      index += 1;
    } else if (arg === "--team-id") {
      options.teamId = String(args[index + 1] || "").trim() || null;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  if (!options.from || !options.to) {
    throw new Error("vercel_usage_range_required");
  }

  return options;
}

function getExecutable(command) {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replaceAll("'", "''");
}

function collectChildOutput(child, args) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        exitCode: 1,
        stdout,
        stderr: error instanceof Error ? error.message : String(error),
        args,
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        exitCode: code == null ? 1 : code,
        stdout,
        stderr,
        args,
      });
    });
  });
}

function runVercelUsage(options) {
  const args = ["usage", "--from", options.from, "--to", options.to, "--format", "json"];
  if (options.scope) {
    args.push("--scope", options.scope);
  }
  if (options.breakdown) {
    args.push("--breakdown", options.breakdown);
  }

  const child = spawn(getExecutable("vercel"), args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  return collectChildOutput(child, args);
}

function runVercelApi(endpoint, { scope = null } = {}) {
  if (process.platform === "win32") {
    const commandParts = [
      "&",
      "vercel",
      "api",
      `'${escapePowerShellSingleQuoted(endpoint)}'`,
      "--raw",
    ];
    if (scope) {
      commandParts.push("--scope", `'${escapePowerShellSingleQuoted(scope)}'`);
    }

    const args = ["-NoProfile", "-Command", commandParts.join(" ")];
    const child = spawn("powershell.exe", args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    return collectChildOutput(child, ["vercel", "api", endpoint, "--raw", ...(scope ? ["--scope", scope] : [])]);
  }

  const args = ["api", endpoint, "--raw"];
  if (scope) {
    args.push("--scope", scope);
  }
  const child = spawn(getExecutable("vercel"), args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  return collectChildOutput(child, args);
}

function parseCost(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return 0;
  }

  const normalized = value.replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeServices(services) {
  return (Array.isArray(services) ? services : [])
    .map((service) => ({
      name: service.service || service.name || "unknown",
      usage: service.usage || null,
      effectiveCost: parseCost(service.effectiveCost),
      billedCost: parseCost(service.billedCost),
    }))
    .sort((left, right) => right.billedCost - left.billedCost || right.effectiveCost - left.effectiveCost)
    .slice(0, 5);
}

function classifyUnavailableReason(stderr) {
  if (stderr.includes("Costs not found (404)")) {
    return "vercel_usage_costs_not_found";
  }
  if (stderr.includes("not recognized")) {
    return "vercel_cli_missing";
  }
  return "vercel_usage_command_failed";
}

function buildUnavailableSummary(run, options) {
  const stderr = run.stderr.trim();
  return {
    ok: false,
    status: "usage_data_not_available",
    scope: options.scope,
    period: {
      from: options.from,
      to: options.to,
    },
    reasonCodes: [classifyUnavailableReason(stderr)],
    stderr,
    command: ["vercel", ...run.args].join(" "),
    nextActions: [
      "check_vercel_usage_dashboard",
      "confirm_team_billing_usage_is_available",
    ],
  };
}

function buildSummary(parsed, options) {
  const totals = parsed.totals || parsed.grandTotal || {};
  return {
    ok: true,
    status: "ready",
    scope: options.scope || parsed.context?.scope || null,
    period: parsed.period || {
      from: options.from,
      to: options.to,
    },
    chargeCount: parsed.chargeCount || 0,
    totals: {
      effectiveCost: parseCost(totals.effectiveCost),
      billedCost: parseCost(totals.billedCost),
    },
    topServices: summarizeServices(parsed.services),
    breakdownCount: Array.isArray(parsed.breakdown) ? parsed.breakdown.length : 0,
  };
}

function parseDateBoundary(value, { endOfDay = false } = {}) {
  const trimmed = String(value || "").trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = Date.parse(dateOnly
    ? `${trimmed}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`
    : trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid_date:${value}`);
  }
  return parsed;
}

async function loadDefaultTeamId({
  projectLinkPath = DEFAULT_PROJECT_LINK_PATH,
  fsImpl = fs,
} = {}) {
  const parsed = JSON.parse(await fsImpl.readFile(projectLinkPath, "utf8"));
  if (typeof parsed?.orgId !== "string" || parsed.orgId.trim().length === 0) {
    throw new Error("vercel_team_id_missing_from_link_config");
  }
  return parsed.orgId.trim();
}

async function fetchVercelApiJson(endpoint, { scope = null, runVercelApiImpl = runVercelApi } = {}) {
  const run = await runVercelApiImpl(endpoint, { scope });
  if (!run.ok) {
    throw new Error(run.stderr.trim() || `vercel_api_failed:${endpoint}`);
  }
  return JSON.parse(run.stdout);
}

function normalizeProject(entry) {
  const id = typeof entry?.id === "string" ? entry.id.trim() : "";
  const name = typeof entry?.name === "string" ? entry.name.trim() : "";
  if (!id || !name) {
    return null;
  }

  return { id, name };
}

async function fetchTeamProjects({
  teamId,
  scope = null,
  fetchVercelApiJsonImpl = fetchVercelApiJson,
} = {}) {
  const parsed = await fetchVercelApiJsonImpl(
    `/v9/projects?teamId=${encodeURIComponent(teamId)}&limit=100`,
    { scope }
  );

  return (Array.isArray(parsed?.projects) ? parsed.projects : [])
    .map(normalizeProject)
    .filter(Boolean);
}

function normalizeDeployment(entry) {
  return {
    id: typeof entry?.uid === "string" ? entry.uid : typeof entry?.id === "string" ? entry.id : "",
    created: Number.isFinite(entry?.created) ? entry.created : Number.isFinite(entry?.createdAt) ? entry.createdAt : 0,
    state: typeof entry?.state === "string" ? entry.state : "",
    target: typeof entry?.target === "string" ? entry.target : null,
    meta: entry?.meta && typeof entry.meta === "object" ? entry.meta : {},
  };
}

async function fetchProjectDeployments({
  projectId,
  teamId,
  scope = null,
  from,
  to,
  limit = DEFAULT_DEPLOYMENT_LIMIT,
  fetchVercelApiJsonImpl = fetchVercelApiJson,
} = {}) {
  const deployments = [];
  const since = parseDateBoundary(from);
  const untilFloor = parseDateBoundary(to, { endOfDay: true });
  let until = untilFloor;

  while (true) {
    const endpoint = `/v6/deployments?projectId=${encodeURIComponent(projectId)}&teamId=${encodeURIComponent(teamId)}&since=${since}&until=${until}&limit=${limit}`;
    const parsed = await fetchVercelApiJsonImpl(endpoint, { scope });
    const batch = (Array.isArray(parsed?.deployments) ? parsed.deployments : [])
      .map(normalizeDeployment)
      .filter((entry) => entry.id && entry.created >= since && entry.created <= untilFloor);

    deployments.push(...batch);

    const next = Number.isFinite(parsed?.pagination?.next) ? parsed.pagination.next : null;
    if (batch.length < limit || next == null || next <= since) {
      break;
    }
    until = next - 1;
  }

  const deduped = new Map();
  for (const deployment of deployments) {
    if (!deduped.has(deployment.id)) {
      deduped.set(deployment.id, deployment);
    }
  }

  return [...deduped.values()].sort((left, right) => right.created - left.created);
}

function summarizeRepeatedMessages(deployments) {
  const counts = new Map();
  for (const deployment of deployments) {
    const message = deployment.meta.githubCommitMessage
      || deployment.meta.gitCommitMessage
      || "(no message)";
    counts.set(message, (counts.get(message) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([message, count]) => ({ message, count }));
}

function summarizeProjectUsage(project, deployments) {
  const productionDeployments = deployments.filter((deployment) => deployment.target === "production");
  const previewDeployments = deployments.filter((deployment) => deployment.target !== "production");

  return {
    projectId: project.id,
    project: project.name,
    totalDeployments: deployments.length,
    productionDeployments: productionDeployments.length,
    previewOrCustomDeployments: previewDeployments.length,
    readyDeployments: deployments.filter((deployment) => deployment.state === "READY").length,
    repeatedProductionMessages: summarizeRepeatedMessages(productionDeployments),
  };
}

function buildOptimizationSignals(projectSummaries) {
  const signals = [];

  const repeatedProduction = projectSummaries
    .flatMap((project) => project.repeatedProductionMessages.map((message) => ({
      project: project.project,
      count: message.count,
      message: message.message,
    })))
    .filter((entry) => entry.count >= 3)
    .sort((left, right) => right.count - left.count);

  for (const entry of repeatedProduction.slice(0, 5)) {
    signals.push({
      type: "repeated_production_redeploys",
      project: entry.project,
      count: entry.count,
      message: entry.message,
      recommendation: "Batch production deploys for unchanged commits and avoid repeated proof-only redeploys.",
    });
  }

  const heavyProjects = projectSummaries
    .filter((project) => project.productionDeployments >= 25)
    .sort((left, right) => right.productionDeployments - left.productionDeployments);

  for (const project of heavyProjects.slice(0, 3)) {
    signals.push({
      type: "high_production_deploy_volume",
      project: project.project,
      count: project.productionDeployments,
      recommendation: "Reduce production deploy frequency with batched merges, staging validation, or selective redeploys.",
    });
  }

  return signals;
}

function buildDeploymentProxySummary({
  options,
  teamId,
  projects,
  deploymentsByProject,
  reasonCodes = [],
} = {}) {
  const projectSummaries = projects
    .map((project) => summarizeProjectUsage(project, deploymentsByProject[project.id] || []))
    .sort((left, right) => right.totalDeployments - left.totalDeployments || left.project.localeCompare(right.project));

  return {
    ok: true,
    status: "proxy_ready",
    scope: options.scope,
    teamId,
    period: {
      from: options.from,
      to: options.to,
    },
    source: "deployment_proxy",
    reasonCodes,
    projectCount: projectSummaries.length,
    projectSummaries,
    topProjects: projectSummaries.slice(0, 5).map((project) => ({
      project: project.project,
      totalDeployments: project.totalDeployments,
      productionDeployments: project.productionDeployments,
      previewOrCustomDeployments: project.previewOrCustomDeployments,
    })),
    optimizationSignals: buildOptimizationSignals(projectSummaries),
    nextActions: [
      "review_repeated_production_redeploys",
      "check_vercel_usage_dashboard_for_actual_billing",
    ],
  };
}

async function buildDeploymentProxySummaryFromApi(
  options,
  {
    teamId,
    fetchTeamProjectsImpl = fetchTeamProjects,
    fetchProjectDeploymentsImpl = fetchProjectDeployments,
  } = {}
) {
  const projects = await fetchTeamProjectsImpl({
    teamId,
    scope: options.scope,
  });

  const deploymentsByProject = {};
  for (const project of projects) {
    deploymentsByProject[project.id] = await fetchProjectDeploymentsImpl({
      projectId: project.id,
      teamId,
      scope: options.scope,
      from: options.from,
      to: options.to,
    });
  }

  return buildDeploymentProxySummary({
    options,
    teamId,
    projects,
    deploymentsByProject,
    reasonCodes: ["vercel_usage_costs_not_found"],
  });
}

function renderMarkdown(summary) {
  if (!summary.ok) {
    return [
      "# Vercel Usage Summary",
      "",
      `- status: \`${summary.status}\``,
      `- period: \`${summary.period.from}\` to \`${summary.period.to}\``,
      `- reasons: \`${summary.reasonCodes.join(",")}\``,
      `- stderr: \`${summary.stderr || "none"}\``,
      `- next actions: \`${summary.nextActions.join(",")}\``,
      "",
    ].join("\n");
  }

  if (summary.status === "proxy_ready") {
    const lines = [
      "# Vercel Usage Summary",
      "",
      `- status: \`${summary.status}\``,
      `- period: \`${summary.period.from}\` to \`${summary.period.to}\``,
      `- source: \`${summary.source}\``,
      `- reasons: \`${summary.reasonCodes.join(",") || "none"}\``,
      `- project count: \`${summary.projectCount}\``,
    ];

    for (const project of summary.topProjects) {
      lines.push(`- project: \`${project.project}\` total=\`${project.totalDeployments}\` production=\`${project.productionDeployments}\` preview=\`${project.previewOrCustomDeployments}\``);
    }

    for (const signal of summary.optimizationSignals.slice(0, 5)) {
      lines.push(`- optimization: \`${signal.project}\` type=\`${signal.type}\` count=\`${signal.count}\` message=\`${signal.message || "n/a"}\``);
    }

    lines.push("");
    return lines.join("\n");
  }

  const lines = [
    "# Vercel Usage Summary",
    "",
    `- status: \`${summary.status}\``,
    `- period: \`${summary.period.from}\` to \`${summary.period.to}\``,
    `- effective cost: \`${summary.totals.effectiveCost.toFixed(2)}\``,
    `- billed cost: \`${summary.totals.billedCost.toFixed(2)}\``,
    `- charge count: \`${summary.chargeCount}\``,
    `- breakdown periods: \`${summary.breakdownCount}\``,
  ];

  for (const service of summary.topServices) {
    lines.push(`- service: \`${service.name}\` billed=\`${service.billedCost.toFixed(2)}\` effective=\`${service.effectiveCost.toFixed(2)}\` usage=\`${service.usage || "unknown"}\``);
  }

  lines.push("");
  return lines.join("\n");
}

async function buildUsageSummary(
  options,
  {
    runVercelUsageImpl = runVercelUsage,
    buildDeploymentProxySummaryFromApiImpl = buildDeploymentProxySummaryFromApi,
    loadDefaultTeamIdImpl = loadDefaultTeamId,
  } = {}
) {
  const run = await runVercelUsageImpl(options);
  if (run.ok) {
    return buildSummary(JSON.parse(run.stdout), options);
  }

  const unavailable = buildUnavailableSummary(run, options);
  if (!unavailable.reasonCodes.includes("vercel_usage_costs_not_found")) {
    return unavailable;
  }

  try {
    const teamId = options.teamId || await loadDefaultTeamIdImpl();
    return await buildDeploymentProxySummaryFromApiImpl(options, { teamId });
  } catch {
    return unavailable;
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const summary = await buildUsageSummary(options);
    process.stdout.write(options.json ? `${JSON.stringify(summary, null, 2)}\n` : renderMarkdown(summary));
    if (!summary.ok) {
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
    DEFAULT_DEPLOYMENT_LIMIT,
    DEFAULT_PROJECT_LINK_PATH,
    buildDeploymentProxySummary,
    buildDeploymentProxySummaryFromApi,
    buildOptimizationSignals,
    buildSummary,
    buildUnavailableSummary,
    buildUsageSummary,
    classifyUnavailableReason,
    defaultPeriod,
    fetchProjectDeployments,
    fetchTeamProjects,
    fetchVercelApiJson,
    escapePowerShellSingleQuoted,
    formatDate,
    loadDefaultTeamId,
    normalizeDeployment,
    normalizeProject,
    parseArgs,
    parseCost,
    parseDateBoundary,
    renderMarkdown,
    runVercelApi,
    runVercelUsage,
    summarizeProjectUsage,
    summarizeRepeatedMessages,
    summarizeServices,
  },
};
