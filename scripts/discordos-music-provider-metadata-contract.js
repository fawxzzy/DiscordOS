const {
  _internals: runtimeInternals,
} = require("./discordos-music-sesh-runtime");

const DEFAULT_RESULT_FIELDS = [
  "providerTrackId",
  "title",
  "artistName",
  "durationMs",
  "sourceUrl",
];

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

function parseArgs(args) {
  const options = {
    json: false,
    providerAction: "search",
    query: "Music Sesh Contract Probe",
    resultLimit: 5,
    allowProviderAdmission: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--provider-action") {
      options.providerAction = readValue(args, index, "missing_provider_action_value");
      index += 1;
    } else if (arg === "--query") {
      options.query = readValue(args, index, "missing_query_value");
      index += 1;
    } else if (arg === "--result-limit") {
      const value = Number(readValue(args, index, "missing_result_limit_value"));
      if (!Number.isInteger(value) || value < 1 || value > 25) {
        throw new Error("invalid_result_limit");
      }
      options.resultLimit = value;
      index += 1;
    } else if (arg === "--allow-provider-admission") {
      options.allowProviderAdmission = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function normalizeQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function buildMetadataContract({
  providerAction = "search",
  query = "",
  resultLimit = 5,
} = {}) {
  return {
    providerAction,
    normalizedQuery: normalizeQuery(query),
    resultLimit,
    readOnly: true,
    requiredResultFields: DEFAULT_RESULT_FIELDS,
    resultShape: {
      providerTrackId: "string",
      title: "string",
      artistName: "string|null",
      durationMs: "number|null",
      sourceUrl: "string|null",
    },
    disallowedActions: ["play", "pause", "skip", "stop", "queue_playback"],
  };
}

function validateMetadataContract(contract = {}) {
  const reasonCodes = [];
  if (contract.providerAction !== "search") {
    reasonCodes.push("metadata_contract_only_admits_search");
  }
  if (!contract.normalizedQuery) {
    reasonCodes.push("metadata_query_missing");
  }
  if (!Number.isInteger(contract.resultLimit) || contract.resultLimit < 1 || contract.resultLimit > 25) {
    reasonCodes.push("metadata_result_limit_invalid");
  }
  for (const field of DEFAULT_RESULT_FIELDS) {
    if (!contract.requiredResultFields?.includes(field)) {
      reasonCodes.push(`metadata_result_field_missing:${field}`);
    }
  }
  if (contract.readOnly !== true) {
    reasonCodes.push("metadata_contract_must_be_read_only");
  }
  return {
    ok: reasonCodes.length === 0,
    reasonCodes,
  };
}

function buildMusicProviderMetadataContract({
  env = process.env,
  ...input
} = {}) {
  const providerAdmission = runtimeInternals.buildProviderAdmission({
    providerAction: input.providerAction,
    allowProviderAdmission: input.allowProviderAdmission,
    env,
  });
  const contract = buildMetadataContract(input);
  const validation = validateMetadataContract(contract);
  const reasonCodes = [...new Set([
    ...providerAdmission.reasonCodes,
    ...validation.reasonCodes,
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: false,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0 ? "provider_metadata_contract_ready" : "blocked",
    providerAdmission,
    contract,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.metadata_contract_ready"
        : "discordos.music_provider.metadata_contract_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.metadata_contract",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        providerAction: contract.providerAction,
        resultLimit: contract.resultLimit,
        callsMusicProviders: false,
        controlsPlayback: false,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Metadata Contract",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- provider admission: \`${result.providerAdmission.status}\``,
    `- provider action: \`${result.contract.providerAction}\``,
    `- result fields: \`${result.contract.requiredResultFields.join(",")}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildMusicProviderMetadataContract(options);
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
    DEFAULT_RESULT_FIELDS,
    parseArgs,
    normalizeQuery,
    buildMetadataContract,
    validateMetadataContract,
    buildMusicProviderMetadataContract,
    renderMarkdown,
  },
};
