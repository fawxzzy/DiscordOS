const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_REGISTRY_PATH = path.resolve(process.cwd(), "config", "discordos-feature-contract-registry.json");
const REQUIRED_FEATURE_FIELDS = [
  "id",
  "label",
  "domain",
  "status",
  "docsPath",
  "sourcePath",
  "statusCommand",
  "liveBehaviorAdmitted",
];
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

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function classifyFeatureRecord(record) {
  const reasonCodes = [];

  for (const field of REQUIRED_FEATURE_FIELDS) {
    if (!(field in record)) {
      reasonCodes.push(`feature_field_missing:${field}`);
    }
  }

  if (!hasValue(record.id)) {
    reasonCodes.push("feature_id_missing");
  }
  if (!hasValue(record.label)) {
    reasonCodes.push("feature_label_missing");
  }
  if (!hasValue(record.domain)) {
    reasonCodes.push("feature_domain_missing");
  }
  if (!ADMITTED_STATUSES.has(record.status)) {
    reasonCodes.push("feature_status_not_admitted");
  }
  if (!hasValue(record.docsPath) || !record.docsPath.startsWith("docs/contracts/")) {
    reasonCodes.push("feature_docs_path_invalid");
  }
  if (!hasValue(record.sourcePath) || !record.sourcePath.startsWith("src/contracts/")) {
    reasonCodes.push("feature_source_path_invalid");
  }
  if (!hasValue(record.statusCommand) || !record.statusCommand.startsWith("npm run ops:discordos:")) {
    reasonCodes.push("feature_status_command_invalid");
  }
  if (typeof record.liveBehaviorAdmitted !== "boolean") {
    reasonCodes.push("feature_live_behavior_flag_invalid");
  }

  return {
    ok: reasonCodes.length === 0,
    id: record.id || null,
    domain: record.domain || null,
    status: record.status || null,
    liveBehaviorAdmitted: record.liveBehaviorAdmitted === true,
    reasonCodes,
  };
}

function classifyRegistry(registry) {
  const reasonCodes = [];
  if (!registry || registry.version !== 1) {
    reasonCodes.push("registry_version_invalid");
  }
  if (!Array.isArray(registry?.features)) {
    reasonCodes.push("registry_features_missing");
  }

  const features = Array.isArray(registry?.features)
    ? registry.features.map(classifyFeatureRecord)
    : [];
  const ids = features.map((feature) => feature.id).filter(Boolean);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    reasonCodes.push("registry_feature_id_collision");
  }
  reasonCodes.push(...features.flatMap((feature) => feature.reasonCodes));

  return {
    ok: reasonCodes.length === 0,
    version: registry?.version ?? null,
    featureCount: features.length,
    liveBehaviorAdmittedCount: features.filter((feature) => feature.liveBehaviorAdmitted).length,
    features,
    duplicateIds: [...new Set(duplicateIds)],
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function classifyRegistryEvent(result) {
  return {
    type: result.ok
      ? "discordos.feature_contract.registry_ready"
      : "discordos.feature_contract.registry_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.feature_contract.registry",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      featureCount: result.featureCount,
      liveBehaviorAdmittedCount: result.liveBehaviorAdmittedCount,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildFeatureContractRegistryStatus({
  registryPath = DEFAULT_REGISTRY_PATH,
  fsImpl = fs,
} = {}) {
  const registry = await readRegistry(registryPath, fsImpl);
  const classified = classifyRegistry(registry);
  const result = {
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: classified.ok ? "ready" : "blocked",
    ...classified,
  };

  return {
    ...result,
    event: classifyRegistryEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Feature Contract Registry Status",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- feature count: \`${result.featureCount}\``,
    `- live behavior admitted: \`${result.liveBehaviorAdmittedCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildFeatureContractRegistryStatus(options);
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
    REQUIRED_FEATURE_FIELDS,
    ADMITTED_STATUSES,
    parseArgs,
    hasValue,
    classifyFeatureRecord,
    classifyRegistry,
    classifyRegistryEvent,
    buildFeatureContractRegistryStatus,
    renderMarkdown,
  },
};
