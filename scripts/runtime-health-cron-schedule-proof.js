const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const DEFAULT_VERCEL_CONFIG_PATH = path.join(__dirname, "..", "vercel.json");
const DEFAULT_EXPECTED_PATH = "/api/cron/runtime-health";

function parseArgs(args) {
  const options = {
    json: false,
    vercelConfigPath: DEFAULT_VERCEL_CONFIG_PATH,
    expectedPath: DEFAULT_EXPECTED_PATH,
    expectedSchedule: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--vercel-config") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_vercel_config_value");
      }
      options.vercelConfigPath = value.trim();
      index += 1;
    } else if (arg === "--expected-path") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_expected_path_value");
      }
      options.expectedPath = value.trim();
      index += 1;
    } else if (arg === "--expected-schedule") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_expected_schedule_value");
      }
      options.expectedSchedule = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function getVercelExecutable(platform = process.platform) {
  return platform === "win32" ? "vercel.cmd" : "vercel";
}

function buildVercelCronsArgs() {
  return ["crons", "ls", "--format", "json"];
}

async function runVercelCrons({ execFileImpl = execFileAsync } = {}) {
  const args = buildVercelCronsArgs();
  const result = await execFileImpl(getVercelExecutable(), args, {
    maxBuffer: 1024 * 1024 * 2,
    shell: process.platform === "win32",
  });
  return {
    args,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function extractJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.length === 0) {
    throw new Error("missing_vercel_crons_json");
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("invalid_vercel_crons_json");
  }

  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
}

function readExpectedScheduleFromConfig({ vercelConfigPath, expectedPath, fsImpl = fs }) {
  const parsed = JSON.parse(fsImpl.readFileSync(vercelConfigPath, "utf8"));
  const cron = Array.isArray(parsed.crons)
    ? parsed.crons.find((entry) => entry?.path === expectedPath)
    : null;

  if (!cron || typeof cron.schedule !== "string" || cron.schedule.trim().length === 0) {
    throw new Error("expected_cron_not_found_in_vercel_config");
  }

  return cron.schedule.trim();
}

function normalizeCronEntry(entry) {
  return {
    path: typeof entry?.path === "string" ? entry.path : null,
    schedule: typeof entry?.schedule === "string" ? entry.schedule : null,
    host: typeof entry?.host === "string" ? entry.host : null,
  };
}

function summarizeCronScheduleProof({ registry, expectedPath, expectedSchedule }) {
  const crons = Array.isArray(registry?.crons) ? registry.crons.map(normalizeCronEntry) : [];
  const undeployed = Array.isArray(registry?.undeployed) ? registry.undeployed : [];
  const modified = Array.isArray(registry?.modified) ? registry.modified : [];
  const enabled = registry?.enabled === true;
  const matches = crons.filter((entry) => entry.path === expectedPath);
  const exactMatches = matches.filter((entry) => entry.schedule === expectedSchedule);
  const reasonCodes = [];

  if (!enabled) {
    reasonCodes.push("vercel_crons_disabled");
  }
  if (matches.length === 0) {
    reasonCodes.push("expected_cron_not_deployed");
  }
  if (matches.length > 0 && exactMatches.length === 0) {
    reasonCodes.push("expected_cron_schedule_mismatch");
  }
  if (undeployed.length > 0) {
    reasonCodes.push("undeployed_crons_present");
  }
  if (modified.length > 0) {
    reasonCodes.push("modified_crons_present");
  }

  const proof = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    expectedPath,
    expectedSchedule,
    enabled,
    deployedCronCount: crons.length,
    matchingCronCount: matches.length,
    exactMatchingCronCount: exactMatches.length,
    deployed: exactMatches[0] || matches[0] || null,
    undeployedCount: undeployed.length,
    modifiedCount: modified.length,
    reasonCodes,
  };

  return {
    ...proof,
    event: classifyCronScheduleProofEvent(proof),
  };
}

function classifyCronScheduleProofEvent(proof) {
  return {
    type: proof.ok
      ? "discordos.runtime_health.cron_schedule_proof_pass"
      : "discordos.runtime_health.cron_schedule_proof_fail",
    severity: proof.ok ? "info" : "error",
    subject: "discordos.runtime",
    status: proof.ok ? "pass" : "fail",
    dimensions: {
      expectedPath: proof.expectedPath,
      expectedSchedule: proof.expectedSchedule,
      deployedCronCount: proof.deployedCronCount,
      matchingCronCount: proof.matchingCronCount,
      exactMatchingCronCount: proof.exactMatchingCronCount,
      undeployedCount: proof.undeployedCount,
      modifiedCount: proof.modifiedCount,
    },
  };
}

async function buildRuntimeHealthCronScheduleProof({
  vercelConfigPath,
  expectedPath,
  expectedSchedule,
  execFileImpl,
  fsImpl = fs,
}) {
  const resolvedExpectedSchedule = expectedSchedule || readExpectedScheduleFromConfig({
    vercelConfigPath,
    expectedPath,
    fsImpl,
  });
  const result = await runVercelCrons({ execFileImpl });
  const registry = extractJsonObject(`${result.stdout}\n${result.stderr}`);
  return {
    ...summarizeCronScheduleProof({
      registry,
      expectedPath,
      expectedSchedule: resolvedExpectedSchedule,
    }),
    command: {
      executable: getVercelExecutable(),
      args: result.args,
    },
  };
}

function renderMarkdown(proof) {
  const lines = [
    "# DiscordOS Runtime Health Cron Schedule Proof",
    "",
    `- result: \`${proof.ok ? "pass" : "fail"}\``,
    `- destructive: \`${proof.destructive ? "true" : "false"}\``,
    `- sends messages: \`${proof.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${proof.writesArtifacts ? "true" : "false"}\``,
    `- event type: \`${proof.event.type}\``,
    `- event severity: \`${proof.event.severity}\``,
    `- expected path: \`${proof.expectedPath}\``,
    `- expected schedule: \`${proof.expectedSchedule}\``,
    `- crons enabled: \`${proof.enabled ? "true" : "false"}\``,
    `- deployed cron count: \`${proof.deployedCronCount}\``,
    `- matching cron count: \`${proof.matchingCronCount}\``,
    `- exact matching cron count: \`${proof.exactMatchingCronCount}\``,
    `- deployed host: \`${proof.deployed?.host || "none"}\``,
    `- undeployed count: \`${proof.undeployedCount}\``,
    `- modified count: \`${proof.modifiedCount}\``,
    `- reason codes: \`${proof.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const proof = await buildRuntimeHealthCronScheduleProof(options);
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
    DEFAULT_VERCEL_CONFIG_PATH,
    DEFAULT_EXPECTED_PATH,
    parseArgs,
    getVercelExecutable,
    buildVercelCronsArgs,
    runVercelCrons,
    extractJsonObject,
    readExpectedScheduleFromConfig,
    normalizeCronEntry,
    summarizeCronScheduleProof,
    classifyCronScheduleProofEvent,
    buildRuntimeHealthCronScheduleProof,
    renderMarkdown,
  },
};
