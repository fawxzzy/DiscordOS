const fs = require("node:fs/promises");
const path = require("node:path");
const { _internals: proofInternals } = require("./runtime-health-proof");
const { _internals: alertInternals } = require("./runtime-health-alert");

function parseArgs(args) {
  const options = {
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    alertDir: alertInternals.DEFAULT_ALERT_DIR,
    keepCount: 50,
    keepDays: 30,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--snapshot-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_snapshot_dir_value");
      }
      options.snapshotDir = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--alert-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_alert_dir_value");
      }
      options.alertDir = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--keep-count") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("invalid_keep_count");
      }
      options.keepCount = value;
      index += 1;
    } else if (arg === "--keep-days") {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("invalid_keep_days");
      }
      options.keepDays = value;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function artifactTimestamp(payload, fileName) {
  return (
    payload?.summary?.generatedAt ||
    payload?.decision?.writtenAt ||
    payload?.snapshot?.writtenAt ||
    timestampFromFileName(fileName)
  );
}

function timestampFromFileName(fileName) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?Z)/.exec(fileName);
  if (!match) {
    return null;
  }
  const [datePart, millisecondPart = "000"] = match[1].split(/-(?=\d{3}Z$)/);
  const normalized = `${datePart.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3").replace(/Z$/, "")}.${millisecondPart.replace(/Z$/, "")}Z`;
  return normalized;
}

async function loadRetentionArtifacts(dir, family) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(dir, entry.name);
    const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
    const timestamp = artifactTimestamp(payload, entry.name);
    records.push({
      family,
      fileName: entry.name,
      filePath,
      timestamp,
      timestampMs: Date.parse(timestamp || ""),
      ok: payload?.ok === true,
      eventType: payload?.event?.type || null,
      severity: payload?.severity || payload?.event?.severity || null,
    });
  }

  return records.sort((left, right) => {
    const rightValue = Number.isFinite(right.timestampMs) ? right.timestampMs : 0;
    const leftValue = Number.isFinite(left.timestampMs) ? left.timestampMs : 0;
    return rightValue - leftValue || right.fileName.localeCompare(left.fileName);
  });
}

function classifyRetentionArtifacts(records, { keepCount, keepDays, now = new Date() }) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    throw new Error("invalid_now");
  }
  const maxAgeMs = keepDays * 24 * 60 * 60 * 1000;

  return records.map((record, index) => {
    const reasons = [];
    const eligibleReasons = [];
    const ageDays = Number.isFinite(record.timestampMs)
      ? Math.max(0, (nowMs - record.timestampMs) / (24 * 60 * 60 * 1000))
      : null;

    if (!Number.isFinite(record.timestampMs)) {
      reasons.push("retain_unparseable_timestamp");
    }
    if (index < keepCount) {
      reasons.push("retain_within_keep_count");
    }
    if (ageDays !== null && ageDays <= keepDays) {
      reasons.push("retain_within_keep_days");
    }
    if (record.ok !== true || record.eventType === "discordos.runtime_health.alert_triggered") {
      reasons.push("retain_non_clear_evidence");
    }

    if (index >= keepCount) {
      eligibleReasons.push("outside_keep_count");
    }
    if (ageDays !== null && ageDays > keepDays) {
      eligibleReasons.push("older_than_keep_days");
    }

    const action = reasons.length > 0 ? "retain" : "eligible_for_review";
    return {
      ...record,
      ageDays,
      action,
      reasons: action === "retain" ? reasons : eligibleReasons,
    };
  });
}

function summarizeRetentionPlan({ snapshotDir, alertDir, healthPlan, alertPlan, keepCount, keepDays }) {
  const all = [...healthPlan, ...alertPlan];
  const retainCount = all.filter((record) => record.action === "retain").length;
  const eligibleForReviewCount = all.length - retainCount;

  return {
    ok: true,
    destructive: false,
    snapshotDir,
    alertDir,
    policy: {
      keepCount,
      keepDays,
      action: "plan_only",
    },
    totals: {
      artifacts: all.length,
      retain: retainCount,
      eligibleForReview: eligibleForReviewCount,
      healthArtifacts: healthPlan.length,
      alertArtifacts: alertPlan.length,
    },
    health: healthPlan,
    alerts: alertPlan,
  };
}

async function buildRuntimeHealthRetentionPlan({ snapshotDir, alertDir, keepCount, keepDays, now }) {
  const [healthRecords, alertRecords] = await Promise.all([
    loadRetentionArtifacts(snapshotDir, "runtime_health"),
    loadRetentionArtifacts(alertDir, "runtime_health_alert"),
  ]);
  const retentionOptions = { keepCount, keepDays, now: now || new Date() };

  return summarizeRetentionPlan({
    snapshotDir,
    alertDir,
    keepCount,
    keepDays,
    healthPlan: classifyRetentionArtifacts(healthRecords, retentionOptions),
    alertPlan: classifyRetentionArtifacts(alertRecords, retentionOptions),
  });
}

function renderMarkdown(plan) {
  const lines = [
    "# DiscordOS Runtime Health Retention Plan",
    "",
    `- result: \`${plan.ok ? "pass" : "fail"}\``,
    `- destructive: \`${plan.destructive ? "true" : "false"}\``,
    `- policy action: \`${plan.policy.action}\``,
    `- keep count: \`${plan.policy.keepCount}\``,
    `- keep days: \`${plan.policy.keepDays}\``,
    `- snapshot dir: \`${plan.snapshotDir}\``,
    `- alert dir: \`${plan.alertDir}\``,
    `- total artifacts: \`${plan.totals.artifacts}\``,
    `- retain count: \`${plan.totals.retain}\``,
    `- eligible for review count: \`${plan.totals.eligibleForReview}\``,
    `- health artifacts: \`${plan.totals.healthArtifacts}\``,
    `- alert artifacts: \`${plan.totals.alertArtifacts}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const plan = await buildRuntimeHealthRetentionPlan(options);
    process.stdout.write(options.json ? `${JSON.stringify(plan, null, 2)}\n` : renderMarkdown(plan));
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
    timestampFromFileName,
    loadRetentionArtifacts,
    classifyRetentionArtifacts,
    summarizeRetentionPlan,
    buildRuntimeHealthRetentionPlan,
    renderMarkdown,
  },
};
