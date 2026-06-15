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
    return "npm run ops:discordos:board-active-write-adapter-guard";
  }
  if (featureId === "moderation") {
    return "npm run ops:discordos:moderation-audit-write-adapter-guard";
  }
  if (featureId === "music_sesh") {
    return "npm run ops:discordos:music-sesh-preflight";
  }
  return null;
}

function nextGateForFeature(feature, storageProof) {
  if (feature.id === "board" && feature.status === "active" && feature.liveBehaviorAdmitted === false) {
    return "guarded_storage_write_adapter";
  }
  if (feature.id === "moderation" && storageProof?.ok && feature.liveBehaviorAdmitted === false) {
    return "guarded_moderation_audit_adapter";
  }
  if (storageProof?.ok && feature.status === "contract_only") {
    return "shadow_registry_admission";
  }
  if (feature.status === "preflight_only") {
    return "runtime_or_shadow_storage_lane";
  }
  return "continue_governed_verification";
}

function buildReleaseSummary(workflows) {
  const storageBackedWorkflows = workflows.filter((workflow) => workflow.storageProofReady);
  const liveBehaviorAdmittedWorkflows = workflows.filter((workflow) => workflow.liveBehaviorAdmitted);
  const guardedAdapterWorkflows = workflows.filter((workflow) =>
    workflow.nextGate === "guarded_storage_write_adapter" ||
    workflow.nextGate === "guarded_moderation_audit_adapter"
  );

  return {
    status: "operator_ready",
    workflowCount: workflows.length,
    storageBackedWorkflowCount: storageBackedWorkflows.length,
    liveBehaviorAdmittedCount: liveBehaviorAdmittedWorkflows.length,
    guardedAdapterWorkflowCount: guardedAdapterWorkflows.length,
    storageApplyReadbackCommand: "npm run ops:discordos:supabase-apply-readback-proof",
    nextReleaseGate: guardedAdapterWorkflows.length > 0
      ? "guarded_write_adapter_review"
      : "music_sesh_runtime_queue",
  };
}

function buildOperatorSummary(workflows) {
  return {
    boardCommand: workflows.find((workflow) => workflow.id === "board")?.workflowCommand || null,
    moderationCommand: workflows.find((workflow) => workflow.id === "moderation")?.workflowCommand || null,
    musicCommand: workflows.find((workflow) => workflow.id === "music_sesh")?.workflowCommand || null,
    proofCommand: "npm run ops:discordos:supabase-apply-readback-proof",
    dashboardCommand: "npm run ops:discordos:product-workflow-dashboard",
  };
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
    releaseSummary: buildReleaseSummary(workflows),
    operatorSummary: buildOperatorSummary(workflows),
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
    `- release status: \`${result.releaseSummary.status}\``,
    `- next release gate: \`${result.releaseSummary.nextReleaseGate}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
    "## Operator Summary",
    "",
    `- board command: \`${result.operatorSummary.boardCommand || "none"}\``,
    `- moderation command: \`${result.operatorSummary.moderationCommand || "none"}\``,
    `- music command: \`${result.operatorSummary.musicCommand || "none"}\``,
    `- proof command: \`${result.operatorSummary.proofCommand}\``,
    `- dashboard command: \`${result.operatorSummary.dashboardCommand}\``,
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
    buildReleaseSummary,
    buildOperatorSummary,
    classifyProductWorkflowDashboardEvent,
    buildDiscordOSProductWorkflowDashboard,
    renderMarkdown,
  },
};
