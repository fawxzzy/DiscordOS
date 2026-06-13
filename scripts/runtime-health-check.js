const path = require("node:path");
const { _internals: proofInternals } = require("./runtime-health-proof");
const { _internals: summaryInternals } = require("./runtime-health-summary");

function parseArgs(args) {
  const options = {
    endpoint: proofInternals.DEFAULT_ENDPOINT,
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    maxSnapshotAgeHours: 24,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--endpoint") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_endpoint_value");
      }
      options.endpoint = value.trim();
      index += 1;
    } else if (arg === "--snapshot-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_snapshot_dir_value");
      }
      options.snapshotDir = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--max-age-hours") {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("invalid_max_age_hours");
      }
      options.maxSnapshotAgeHours = value;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function runRuntimeHealthCheck({ endpoint, snapshotDir, maxSnapshotAgeHours, fetchImpl = fetch, now }) {
  const proof = await proofInternals.fetchRuntimeHealthProof({
    endpoint,
    fetchImpl,
    expectOperational: true,
  });
  const snapshot = await proofInternals.writeRuntimeHealthSnapshot(proof, { snapshotDir });
  const records = await summaryInternals.loadRuntimeHealthSnapshots({
    snapshotDir,
    limit: 10,
  });
  const summary = summaryInternals.summarizeRuntimeHealthSnapshots(records, {
    snapshotDir,
    requireLatestPass: true,
    requireFreshSnapshot: true,
    maxSnapshotAgeHours,
    now: now || new Date(),
  });

  return {
    ok: proof.ok && summary.ok,
    endpoint,
    snapshotPath: snapshot.snapshotPath,
    proof,
    summary,
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Runtime Health Check",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- endpoint: \`${result.endpoint}\``,
    `- snapshot path: \`${result.snapshotPath}\``,
    `- proof result: \`${result.proof.ok ? "pass" : "fail"}\``,
    `- summary result: \`${result.summary.ok ? "pass" : "fail"}\``,
    `- latest fresh: \`${result.summary.latest?.fresh === true ? "true" : "false"}\``,
    `- latest age hours: \`${Number.isFinite(result.summary.latest?.ageHours) ? result.summary.latest.ageHours.toFixed(2) : "unknown"}\``,
    `- latest posture: \`${result.summary.latest?.posture || "unknown"}\``,
    `- latest readiness percent: \`${result.summary.latest?.readinessPercent ?? "unknown"}\``,
    `- latest event type: \`${result.summary.latest?.eventType || "unknown"}\``,
    `- latest blocked reasons: \`${result.summary.latest?.blockedReasons?.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runRuntimeHealthCheck(options);
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
    runRuntimeHealthCheck,
    renderMarkdown,
  },
};
