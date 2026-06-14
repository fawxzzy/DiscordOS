const {
  _internals: registryDashboardInternals,
} = require("./discordos-feature-contract-registry-dashboard");
const {
  _internals: storageProofInternals,
} = require("./discordos-storage-migration-rls-proof");

function parseArgs(args) {
  return registryDashboardInternals.parseArgs(args);
}

function buildWorkflowRows(registryDashboard, storageProofs) {
  const storageByFeature = new Map(storageProofs.map((proof) => [proof.feature, proof]));

  return registryDashboard.features.map((feature) => {
    const storageProof = storageByFeature.get(feature.id) || null;
    const persistenceStatus = storageProof?.ok
      ? "storage_migration_rls_ready"
      : feature.status === "preflight_only"
        ? "preflight_only"
        : "storage_not_proven";

    return {
      id: feature.id,
      label: feature.label,
      domain: feature.domain,
      registryStatus: feature.status,
      liveBehaviorAdmitted: feature.liveBehaviorAdmitted,
      persistenceStatus,
      storageProofReady: storageProof?.ok === true,
      statusCommand: feature.statusCommand,
      workflowCommand: commandForFeature(feature.id),
      nextGate: nextGateForFeature(feature, storageProof),
    };
  });
}

function commandForFeature(featureId) {
  if (featureId === "board") {
    return "npm run ops:discordos:board-active-admission-canary";
  }
  if (featureId === "moderation") {
    return "npm run ops:discordos:moderation-storage-migration-rls-proof";
  }
  if (featureId === "music_sesh") {
    return "npm run ops:discordos:music-sesh-preflight";
  }
  return null;
}

function nextGateForFeature(feature, storageProof) {
  if (feature.id === "board" && feature.status === "active" && feature.liveBehaviorAdmitted === false) {
    return "explicit_live_behavior_admission";
  }
  if (storageProof?.ok && feature.status === "contract_only") {
    return "shadow_registry_admission";
  }
  if (feature.status === "preflight_only") {
    return "runtime_or_shadow_storage_lane";
  }
  return "continue_governed_verification";
}

function classifyProductWorkflowDashboardEvent(result) {
  return {
    type: result.ok
      ? "discordos.product_workflow.dashboard_ready"
      : "discordos.product_workflow.dashboard_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.product_workflow.dashboard",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      workflowCount: result.workflowCount,
      storageProofReadyCount: result.storageProofReadyCount,
      liveBehaviorAdmittedCount: result.liveBehaviorAdmittedCount,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildDiscordOSProductWorkflowDashboard({
  registryPath = registryDashboardInternals.DEFAULT_REGISTRY_PATH,
  fsImpl,
} = {}) {
  const [registryDashboard, boardStorage, moderationStorage] = await Promise.all([
    registryDashboardInternals.buildFeatureContractRegistryDashboard({
      registryPath,
      fsImpl,
    }),
    storageProofInternals.buildStorageMigrationRlsProof({
      feature: "board",
      fsImpl,
    }),
    storageProofInternals.buildStorageMigrationRlsProof({
      feature: "moderation",
      fsImpl,
    }),
  ]);
  const workflows = buildWorkflowRows(registryDashboard, [boardStorage, moderationStorage]);
  const reasonCodes = [...new Set([
    ...registryDashboard.reasonCodes,
    ...boardStorage.reasonCodes,
    ...moderationStorage.reasonCodes,
  ])];
  const result = {
    ok: registryDashboard.ok && boardStorage.ok && moderationStorage.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: reasonCodes.length === 0 ? "ready" : "blocked",
    workflowCount: workflows.length,
    storageProofReadyCount: workflows.filter((workflow) => workflow.storageProofReady).length,
    liveBehaviorAdmittedCount: workflows.filter((workflow) => workflow.liveBehaviorAdmitted).length,
    workflows,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyProductWorkflowDashboardEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Product Workflow Dashboard",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- workflows: \`${result.workflowCount}\``,
    `- storage proofs ready: \`${result.storageProofReadyCount}\``,
    `- live behavior admitted: \`${result.liveBehaviorAdmittedCount}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
    "## Workflows",
    "",
  ];

  for (const workflow of result.workflows) {
    lines.push(
      `- ${workflow.id}: registry \`${workflow.registryStatus}\`, persistence \`${workflow.persistenceStatus}\`, next gate \`${workflow.nextGate}\`, command \`${workflow.workflowCommand || workflow.statusCommand || "none"}\``
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordOSProductWorkflowDashboard(options);
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
    buildWorkflowRows,
    commandForFeature,
    nextGateForFeature,
    classifyProductWorkflowDashboardEvent,
    buildDiscordOSProductWorkflowDashboard,
    renderMarkdown,
  },
};
