const fs = require("node:fs/promises");
const path = require("node:path");
const { _internals: proofInternals } = require("./runtime-health-proof");

function parseArgs(args) {
  const options = {
    json: false,
    limit: 10,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    requireLatestPass: true,
    requireFreshSnapshot: true,
    maxSnapshotAgeHours: 24,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--allow-latest-fail") {
      options.requireLatestPass = false;
    } else if (arg === "--allow-stale") {
      options.requireFreshSnapshot = false;
    } else if (arg === "--max-age-hours") {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("invalid_max_age_hours");
      }
      options.maxSnapshotAgeHours = value;
      index += 1;
    } else if (arg === "--limit") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("invalid_limit");
      }
      options.limit = value;
      index += 1;
    } else if (arg === "--snapshot-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_snapshot_dir_value");
      }
      options.snapshotDir = path.resolve(value.trim());
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function safeGeneratedAt(snapshot) {
  return typeof snapshot?.summary?.generatedAt === "string" ? snapshot.summary.generatedAt : null;
}

function snapshotSortValue(snapshot, fileName) {
  return safeGeneratedAt(snapshot) || fileName;
}

function computeSnapshotFreshness(generatedAt, { maxSnapshotAgeHours, now = new Date() } = {}) {
  const maxAgeMs = maxSnapshotAgeHours * 60 * 60 * 1000;
  const generatedTime = Date.parse(generatedAt || "");
  const nowTime = now instanceof Date ? now.getTime() : Date.parse(now);

  if (!Number.isFinite(generatedTime)) {
    return {
      fresh: false,
      ageHours: null,
      staleReason: "invalid_latest_generated_at",
    };
  }

  if (!Number.isFinite(nowTime)) {
    throw new Error("invalid_now");
  }

  const ageMs = nowTime - generatedTime;
  const ageHours = Math.max(0, ageMs / (60 * 60 * 1000));

  if (ageMs < 0) {
    return {
      fresh: false,
      ageHours,
      staleReason: "latest_snapshot_from_future",
    };
  }

  if (ageMs > maxAgeMs) {
    return {
      fresh: false,
      ageHours,
      staleReason: "latest_snapshot_stale",
    };
  }

  return {
    fresh: true,
    ageHours,
    staleReason: null,
  };
}

async function readSnapshotFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    filePath,
    fileName: path.basename(filePath),
    snapshot: parsed,
  };
}

async function loadRuntimeHealthSnapshots({ snapshotDir, limit }) {
  let entries;
  try {
    entries = await fs.readdir(snapshotDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const jsonEntries = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(snapshotDir, entry.name));
  const snapshots = [];

  for (const filePath of jsonEntries) {
    snapshots.push(await readSnapshotFile(filePath));
  }

  return snapshots
    .sort((left, right) =>
      snapshotSortValue(right.snapshot, right.fileName).localeCompare(snapshotSortValue(left.snapshot, left.fileName))
    )
    .slice(0, limit);
}

function summarizeRuntimeHealthSnapshots(
  records,
  {
    snapshotDir,
    requireLatestPass = true,
    requireFreshSnapshot = true,
    maxSnapshotAgeHours = 24,
    now = new Date(),
  } = {}
) {
  const latest = records[0] || null;
  const passCount = records.filter((record) => record.snapshot?.ok === true).length;
  const failCount = records.length - passCount;
  const latestPass = latest?.snapshot?.ok === true;
  const latestEventType = latest?.snapshot?.event?.type || null;
  const latestPosture = latest?.snapshot?.summary?.posture || null;
  const latestReadinessPercent = Number.isInteger(latest?.snapshot?.summary?.readinessPercent)
    ? latest.snapshot.summary.readinessPercent
    : null;
  const latestGeneratedAt = safeGeneratedAt(latest?.snapshot);
  const freshness = latest
    ? computeSnapshotFreshness(latestGeneratedAt, { maxSnapshotAgeHours, now })
    : {
        fresh: false,
        ageHours: null,
        staleReason: "missing_snapshot",
      };
  const latestBlockedReasons = Array.isArray(latest?.snapshot?.summary?.blockedReasons)
    ? latest.snapshot.summary.blockedReasons
    : [];
  const eventTypes = [...new Set(records.map((record) => record.snapshot?.event?.type).filter(Boolean))];
  const statuses = records.map((record) => ({
    fileName: record.fileName,
    ok: record.snapshot?.ok === true,
    posture: record.snapshot?.summary?.posture || null,
    readinessPercent: Number.isInteger(record.snapshot?.summary?.readinessPercent)
      ? record.snapshot.summary.readinessPercent
      : null,
    eventType: record.snapshot?.event?.type || null,
    generatedAt: safeGeneratedAt(record.snapshot),
  }));
  const blockedReasons = [
    ...new Set(records.flatMap((record) => record.snapshot?.summary?.blockedReasons || [])),
  ];
  const ok = records.length > 0 && (!requireLatestPass || latestPass) && (!requireFreshSnapshot || freshness.fresh);

  return {
    ok,
    snapshotDir,
    maxSnapshotAgeHours,
    totalSnapshots: records.length,
    passCount,
    failCount,
    latest: latest
      ? {
          fileName: latest.fileName,
          ok: latestPass,
          posture: latestPosture,
          readinessPercent: latestReadinessPercent,
          eventType: latestEventType,
          generatedAt: latestGeneratedAt,
          ageHours: freshness.ageHours,
          fresh: freshness.fresh,
          staleReason: freshness.staleReason,
          blockedReasons: latestBlockedReasons,
        }
      : null,
    eventTypes,
    blockedReasons,
    statuses,
  };
}

function renderMarkdown(summary) {
  const lines = [
    "# DiscordOS Runtime Health Snapshot Summary",
    "",
    `- result: \`${summary.ok ? "pass" : "fail"}\``,
    `- snapshot dir: \`${summary.snapshotDir}\``,
    `- total snapshots: \`${summary.totalSnapshots}\``,
    `- pass count: \`${summary.passCount}\``,
    `- fail count: \`${summary.failCount}\``,
    `- max snapshot age hours: \`${summary.maxSnapshotAgeHours ?? "unknown"}\``,
    `- latest file: \`${summary.latest?.fileName || "none"}\``,
    `- latest generated at: \`${summary.latest?.generatedAt || "unknown"}\``,
    `- latest age hours: \`${Number.isFinite(summary.latest?.ageHours) ? summary.latest.ageHours.toFixed(2) : "unknown"}\``,
    `- latest fresh: \`${summary.latest?.fresh === true ? "true" : "false"}\``,
    `- latest stale reason: \`${summary.latest?.staleReason || "none"}\``,
    `- latest posture: \`${summary.latest?.posture || "unknown"}\``,
    `- latest readiness percent: \`${summary.latest?.readinessPercent ?? "unknown"}\``,
    `- latest event type: \`${summary.latest?.eventType || "unknown"}\``,
    `- latest blocked reasons: \`${summary.latest?.blockedReasons?.join(",") || "none"}\``,
    "",
    "## Recent Snapshots",
    "",
  ];

  for (const status of summary.statuses) {
    lines.push(
      `- \`${status.fileName}\`: ${status.ok ? "pass" : "fail"}, ${status.posture || "unknown"}, ${status.readinessPercent ?? "unknown"}`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const records = await loadRuntimeHealthSnapshots(options);
    const summary = summarizeRuntimeHealthSnapshots(records, options);
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
    parseArgs,
    loadRuntimeHealthSnapshots,
    summarizeRuntimeHealthSnapshots,
    renderMarkdown,
  },
};
