const {
  _internals: activationGateInternals,
} = require("./discordos-feature-activation-gates");
const {
  _internals: storageProofInternals,
} = require("./discordos-storage-migration-rls-proof");

function parseArgs(args) {
  const options = {
    json: false,
    registryPath: activationGateInternals.parseArgs([]).registryPath,
    migrationPath: null,
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
      options.registryPath = require("node:path").resolve(value.trim());
      index += 1;
    } else if (arg === "--migration-file") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_migration_file_value");
      }
      options.migrationPath = require("node:path").resolve(value.trim());
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function buildBoardActiveAdmissionCanary({
  registryPath,
  migrationPath,
  fsImpl,
} = {}) {
  const [gates, storageProof] = await Promise.all([
    activationGateInternals.buildFeatureActivationGates({
      registryPath,
      fsImpl,
    }),
    storageProofInternals.buildStorageMigrationRlsProof({
      feature: "board",
      migrationPath,
      fsImpl,
    }),
  ]);
  const board = gates.features.find((feature) => feature.id === "board") || null;
  const reasonCodes = [];

  if (!board) {
    reasonCodes.push("board_feature_missing");
  }
  if (board && board.status !== "active") {
    reasonCodes.push("board_feature_not_active_canary");
  }
  if (board?.liveBehaviorAdmitted === true) {
    reasonCodes.push("board_canary_cannot_admit_live_behavior");
  }
  if (!storageProof.ok) {
    reasonCodes.push("board_storage_proof_not_ready");
  }

  const resultReasonCodes = [...new Set([
    ...storageProof.reasonCodes,
    ...gates.reasonCodes.filter((reasonCode) => reasonCode === "live_behavior_admitted_below_active"),
    ...reasonCodes,
  ])];
  const result = {
    ok: gates.ok && storageProof.ok && resultReasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: resultReasonCodes.length === 0 ? "canary_ready" : "blocked",
    feature: "board",
    registryStatus: board?.status || "missing",
    activationAllowed: board?.activationAllowed === true,
    liveBehaviorAdmitted: board?.liveBehaviorAdmitted === true,
    nextGate: board?.nextGate || "feature_registry_repair_required",
    storageProof: {
      ok: storageProof.ok,
      table: storageProof.table,
      rlsEnabled: storageProof.rlsEnabled,
      serviceRoleOnly: storageProof.serviceRoleOnly,
      migrationApplied: storageProof.migrationApplied,
    },
    canaryWritesAllowed: false,
    liveBehaviorChanges: false,
    reasonCodes: resultReasonCodes,
  };

  return {
    ...result,
    event: classifyBoardActiveAdmissionCanaryEvent(result),
  };
}

function classifyBoardActiveAdmissionCanaryEvent(result) {
  return {
    type: result.ok
      ? "discordos.board_feature.active_admission_canary_ready"
      : "discordos.board_feature.active_admission_canary_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.board_feature.active_admission_canary",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      registryStatus: result.registryStatus,
      activationAllowed: result.activationAllowed,
      liveBehaviorAdmitted: result.liveBehaviorAdmitted,
      storageProofReady: result.storageProof.ok,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Active Admission Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- registry status: \`${result.registryStatus}\``,
    `- activation allowed: \`${result.activationAllowed ? "true" : "false"}\``,
    `- live behavior admitted: \`${result.liveBehaviorAdmitted ? "true" : "false"}\``,
    `- next gate: \`${result.nextGate}\``,
    `- storage proof ready: \`${result.storageProof.ok ? "true" : "false"}\``,
    `- storage table: \`${result.storageProof.table || "unknown"}\``,
    `- RLS enabled: \`${result.storageProof.rlsEnabled ? "true" : "false"}\``,
    `- service-role only: \`${result.storageProof.serviceRoleOnly ? "true" : "false"}\``,
    `- canary writes allowed: \`${result.canaryWritesAllowed ? "true" : "false"}\``,
    `- live behavior changes: \`${result.liveBehaviorChanges ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardActiveAdmissionCanary(options);
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
    buildBoardActiveAdmissionCanary,
    classifyBoardActiveAdmissionCanaryEvent,
    renderMarkdown,
  },
};
