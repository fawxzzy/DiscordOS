const {
  _internals: registryStatusInternals,
} = require("./discordos-feature-contract-registry-status");

function parseArgs(args) {
  return registryStatusInternals.parseArgs(args);
}

function buildMusicSeshRatchetReadModel(registryStatus) {
  const music = registryStatus.features.find((feature) => feature.id === "music_sesh") || null;
  const reasonCodes = [...registryStatus.reasonCodes];
  if (!music) {
    reasonCodes.push("music_sesh_registry_record_missing");
  }
  if (music && music.status !== "shadow") {
    reasonCodes.push("music_sesh_not_shadow_ratcheted");
  }
  if (music?.liveBehaviorAdmitted) {
    reasonCodes.push("music_sesh_live_behavior_unexpected");
  }

  return {
    ok: reasonCodes.length === 0,
    featureId: "music_sesh",
    currentStatus: music?.status || null,
    targetStatus: "shadow",
    liveBehaviorAdmitted: music?.liveBehaviorAdmitted === true,
    runtimeCommand: "npm run ops:discordos:music-sesh-runtime",
    nextGate: "music_sesh_storage_contract_and_live_admission",
    reasonCodes: [...new Set(reasonCodes)],
  };
}

async function buildMusicSeshFeatureActivationRatchet({
  registryPath = registryStatusInternals.DEFAULT_REGISTRY_PATH,
  fsImpl,
} = {}) {
  const registryStatus = await registryStatusInternals.buildFeatureContractRegistryStatus({
    registryPath,
    fsImpl,
  });
  const readModel = buildMusicSeshRatchetReadModel(registryStatus);
  const result = {
    ok: readModel.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    liveBehaviorChanges: false,
    status: readModel.ok ? "ratchet_applied" : "blocked",
    ...readModel,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_sesh.feature_activation_ratchet_ready"
        : "discordos.music_sesh.feature_activation_ratchet_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_sesh.feature_activation_ratchet",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        currentStatus: result.currentStatus || "missing",
        targetStatus: result.targetStatus,
        liveBehaviorAdmitted: result.liveBehaviorAdmitted,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Sesh Feature Activation Ratchet",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- live behavior changes: \`${result.liveBehaviorChanges ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- current status: \`${result.currentStatus || "missing"}\``,
    `- target status: \`${result.targetStatus}\``,
    `- live behavior admitted: \`${result.liveBehaviorAdmitted ? "true" : "false"}\``,
    `- next gate: \`${result.nextGate}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicSeshFeatureActivationRatchet(options);
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
    buildMusicSeshRatchetReadModel,
    buildMusicSeshFeatureActivationRatchet,
    renderMarkdown,
  },
};
