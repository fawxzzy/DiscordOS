const {
  _internals: activationGateInternals,
} = require("./discordos-feature-activation-gates");

const DEFAULT_FEATURE = "board";

function parseArgs(args) {
  const options = {
    ...activationGateInternals.parseArgs([]),
    feature: DEFAULT_FEATURE,
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
    } else if (arg === "--feature") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_feature_value");
      }
      options.feature = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function buildBoardFeatureActivationPilot({
  feature = DEFAULT_FEATURE,
  registryPath,
  fsImpl,
} = {}) {
  const gates = await activationGateInternals.buildFeatureActivationGates({
    registryPath,
    fsImpl,
  });
  const selectedFeature = gates.features.find((candidate) => candidate.id === feature) || null;
  const reasonCodes = [];

  if (!selectedFeature) {
    reasonCodes.push("feature_not_found");
  }
  if (selectedFeature && !["shadow", "active"].includes(selectedFeature.status)) {
    reasonCodes.push("feature_not_in_shadow_or_active_pilot");
  }
  if (selectedFeature?.liveBehaviorAdmitted === true) {
    reasonCodes.push("pilot_cannot_admit_live_behavior");
  }
  if (selectedFeature?.activationAllowed === true) {
    reasonCodes.push("pilot_must_stay_below_active_admission");
  }

  const resultReasonCodes = [...new Set([
    ...gates.reasonCodes.filter((reasonCode) => reasonCode === "live_behavior_admitted_below_active"),
    ...reasonCodes,
  ])];
  const result = {
    ok: gates.ok && resultReasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: resultReasonCodes.length === 0 ? "pilot_ready" : "blocked",
    feature,
    pilotStatus: selectedFeature?.status || "missing",
    activationAllowed: selectedFeature?.activationAllowed === true,
    liveBehaviorAdmitted: selectedFeature?.liveBehaviorAdmitted === true,
    nextGate: selectedFeature?.nextGate || "feature_registry_repair_required",
    registryMutated: false,
    liveBehaviorChanges: false,
    selectedFeature,
    reasonCodes: resultReasonCodes,
  };

  return {
    ...result,
    event: classifyBoardFeatureActivationPilotEvent(result),
  };
}

function classifyBoardFeatureActivationPilotEvent(result) {
  return {
    type: result.ok
      ? "discordos.board_feature.activation_pilot_ready"
      : "discordos.board_feature.activation_pilot_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.board_feature.activation_pilot",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      feature: result.feature,
      pilotStatus: result.pilotStatus,
      activationAllowed: result.activationAllowed,
      liveBehaviorAdmitted: result.liveBehaviorAdmitted,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Feature Activation Pilot",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- feature: \`${result.feature}\``,
    `- pilot status: \`${result.pilotStatus}\``,
    `- activation allowed: \`${result.activationAllowed ? "true" : "false"}\``,
    `- live behavior admitted: \`${result.liveBehaviorAdmitted ? "true" : "false"}\``,
    `- next gate: \`${result.nextGate}\``,
    `- registry mutated: \`${result.registryMutated ? "true" : "false"}\``,
    `- live behavior changes: \`${result.liveBehaviorChanges ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardFeatureActivationPilot(options);
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
    DEFAULT_FEATURE,
    parseArgs,
    buildBoardFeatureActivationPilot,
    classifyBoardFeatureActivationPilotEvent,
    renderMarkdown,
  },
};
