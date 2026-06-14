const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_REGISTRY_PATH = path.resolve(process.cwd(), "config", "discordos-feature-contract-registry.json");
const ADMITTED_STATUSES = new Set([
  "contract_only",
  "preflight_only",
  "shadow",
  "active",
]);

function parseArgs(args) {
  const options = {
    json: false,
    registryPath: DEFAULT_REGISTRY_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--registry") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_registry_value");
      }
      options.registryPath = path.resolve(value.trim());
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function readRegistry(registryPath = DEFAULT_REGISTRY_PATH, fsImpl = fs) {
  const raw = await fsImpl.readFile(registryPath, "utf8");
  return JSON.parse(raw);
}

function classifyRegistryFeature(feature) {
  const reasonCodes = [];
  if (!feature || typeof feature.id !== "string" || feature.id.trim().length === 0) {
    reasonCodes.push("feature_id_missing");
  }
  if (!ADMITTED_STATUSES.has(feature?.status)) {
    reasonCodes.push("feature_status_not_admitted");
  }
  if (feature?.liveBehaviorAdmitted === true && feature.status !== "active") {
    reasonCodes.push("live_behavior_admitted_below_active");
  }
  if (typeof feature?.statusCommand !== "string" || !feature.statusCommand.startsWith("npm run ops:discordos:")) {
    reasonCodes.push("feature_status_command_invalid");
  }

  return {
    id: feature?.id || null,
    label: feature?.label || null,
    domain: feature?.domain || null,
    status: feature?.status || null,
    docsPath: feature?.docsPath || null,
    sourcePath: feature?.sourcePath || null,
    statusCommand: feature?.statusCommand || null,
    liveBehaviorAdmitted: feature?.liveBehaviorAdmitted === true,
    ok: reasonCodes.length === 0,
    reasonCodes,
  };
}

function buildDashboardReadModel(registry) {
  const reasonCodes = [];
  if (!registry || registry.version !== 1) {
    reasonCodes.push("registry_version_invalid");
  }
  if (!Array.isArray(registry?.features)) {
    reasonCodes.push("registry_features_missing");
  }

  const features = Array.isArray(registry?.features)
    ? registry.features.map(classifyRegistryFeature)
    : [];
  const statusCounts = features.reduce((counts, feature) => {
    const status = feature.status || "unknown";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const liveBehaviorAdmittedCount = features.filter((feature) => feature.liveBehaviorAdmitted).length;
  const blockedFeatures = features.filter((feature) => !feature.ok);
  reasonCodes.push(...blockedFeatures.flatMap((feature) => feature.reasonCodes));

  return {
    ok: reasonCodes.length === 0,
    version: registry?.version ?? null,
    featureCount: features.length,
    statusCounts,
    liveBehaviorAdmittedCount,
    blockedFeatureCount: blockedFeatures.length,
    features,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function classifyDashboardEvent(result) {
  return {
    type: result.ok
      ? "discordos.feature_contract.registry_dashboard_ready"
      : "discordos.feature_contract.registry_dashboard_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.feature_contract.registry_dashboard",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      featureCount: result.featureCount,
      blockedFeatureCount: result.blockedFeatureCount,
      liveBehaviorAdmittedCount: result.liveBehaviorAdmittedCount,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildFeatureContractRegistryDashboard({
  registryPath = DEFAULT_REGISTRY_PATH,
  fsImpl = fs,
} = {}) {
  const registry = await readRegistry(registryPath, fsImpl);
  const readModel = buildDashboardReadModel(registry);
  const result = {
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: readModel.ok ? "ready" : "blocked",
    ...readModel,
  };

  return {
    ...result,
    event: classifyDashboardEvent(result),
  };
}

function renderMarkdown(result) {
  const featureLines = result.features.map((feature) =>
    `- ${feature.id || "unknown"}: \`${feature.status || "unknown"}\`, live behavior admitted: \`${feature.liveBehaviorAdmitted ? "true" : "false"}\``
  );
  return [
    "# DiscordOS Feature Contract Registry Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- feature count: \`${result.featureCount}\``,
    `- blocked feature count: \`${result.blockedFeatureCount}\``,
    `- live behavior admitted: \`${result.liveBehaviorAdmittedCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
    "## Features",
    "",
    ...featureLines,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildFeatureContractRegistryDashboard(options);
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
    DEFAULT_REGISTRY_PATH,
    ADMITTED_STATUSES,
    parseArgs,
    classifyRegistryFeature,
    buildDashboardReadModel,
    classifyDashboardEvent,
    buildFeatureContractRegistryDashboard,
    renderMarkdown,
  },
};
