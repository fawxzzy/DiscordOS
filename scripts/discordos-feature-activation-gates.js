const {
  _internals: registryDashboardInternals,
} = require("./discordos-feature-contract-registry-dashboard");

function parseArgs(args) {
  return registryDashboardInternals.parseArgs(args);
}

function classifyFeatureActivationGate(feature) {
  const reasonCodes = [...(feature.reasonCodes || [])];
  const featureOk = feature.ok !== false;
  let activationAllowed = false;
  let nextGate = "repair_registry_feature";

  if (featureOk) {
    if (feature.status === "active" && feature.liveBehaviorAdmitted) {
      activationAllowed = true;
      nextGate = "active_live_behavior_admitted";
    } else if (feature.status === "active") {
      reasonCodes.push("active_feature_without_live_behavior_admission");
      nextGate = "live_behavior_admission_required";
    } else if (feature.status === "shadow") {
      reasonCodes.push("shadow_feature_requires_active_admission");
      nextGate = "active_admission_required";
    } else if (feature.status === "preflight_only") {
      reasonCodes.push("preflight_feature_requires_shadow_or_active_admission");
      nextGate = "shadow_or_active_admission_required";
    } else if (feature.status === "contract_only") {
      reasonCodes.push("contract_feature_requires_preflight_admission");
      nextGate = "preflight_admission_required";
    }
  }

  return {
    id: feature.id,
    label: feature.label,
    domain: feature.domain,
    status: feature.status,
    liveBehaviorAdmitted: feature.liveBehaviorAdmitted,
    statusCommand: feature.statusCommand,
    activationAllowed,
    nextGate,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function buildActivationGateReadModel(registryDashboard) {
  const features = registryDashboard.features.map(classifyFeatureActivationGate);
  const activationAllowedCount = features.filter((feature) => feature.activationAllowed).length;
  const blockedFeatureCount = features.filter((feature) => !feature.activationAllowed).length;
  const impossibleLiveAdmissionCount = features.filter((feature) =>
    feature.reasonCodes.includes("live_behavior_admitted_below_active")
  ).length;
  const reasonCodes = [...new Set([
    ...registryDashboard.reasonCodes,
    ...features.flatMap((feature) => feature.reasonCodes),
  ])];

  return {
    ok: registryDashboard.ok && impossibleLiveAdmissionCount === 0,
    featureCount: features.length,
    activationAllowedCount,
    blockedFeatureCount,
    impossibleLiveAdmissionCount,
    features,
    reasonCodes,
  };
}

function classifyActivationGateEvent(result) {
  return {
    type: result.ok
      ? "discordos.feature_activation.gates_ready"
      : "discordos.feature_activation.gates_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.feature_activation",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      featureCount: result.featureCount,
      activationAllowedCount: result.activationAllowedCount,
      blockedFeatureCount: result.blockedFeatureCount,
      impossibleLiveAdmissionCount: result.impossibleLiveAdmissionCount,
    },
  };
}

async function buildFeatureActivationGates({
  registryPath = registryDashboardInternals.DEFAULT_REGISTRY_PATH,
  fsImpl,
} = {}) {
  const registryDashboard = await registryDashboardInternals.buildFeatureContractRegistryDashboard({
    registryPath,
    fsImpl,
  });
  const readModel = buildActivationGateReadModel(registryDashboard);
  const result = {
    ok: readModel.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: readModel.ok ? "ready" : "blocked",
    liveBehaviorChanges: false,
    ...readModel,
  };

  return {
    ...result,
    event: classifyActivationGateEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Feature Activation Gates",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- live behavior changes: \`${result.liveBehaviorChanges ? "true" : "false"}\``,
    `- event type: \`${result.event.type}\``,
    `- features: \`${result.featureCount}\``,
    `- activation allowed: \`${result.activationAllowedCount}\``,
    `- blocked features: \`${result.blockedFeatureCount}\``,
    `- impossible live admissions: \`${result.impossibleLiveAdmissionCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
    "## Gates",
    "",
  ];

  for (const feature of result.features) {
    lines.push(
      `- ${feature.id}: status \`${feature.status}\`, activation \`${feature.activationAllowed ? "allowed" : "blocked"}\`, next gate \`${feature.nextGate}\``
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildFeatureActivationGates(options);
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
    classifyFeatureActivationGate,
    buildActivationGateReadModel,
    classifyActivationGateEvent,
    buildFeatureActivationGates,
    renderMarkdown,
  },
};
