const {
  _internals: contractInternals,
} = require("./discordos-music-provider-metadata-contract");

const LIVE_CANARY_ENV = "DISCORDOS_MUSIC_PROVIDER_METADATA_CANARY";
const LIVE_CANARY_ENV_VALUE = "enabled";

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
    live: false,
    providerAction: "search",
    query: "Music Sesh Live Canary",
    resultLimit: 5,
    allowProviderAdmission: false,
    allowLiveCanary: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--live") {
      options.live = true;
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
    } else if (arg === "--allow-live-canary") {
      options.allowLiveCanary = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function resolveLiveCanaryAdmission({ allowLiveCanary, env }) {
  const envEnabled = env?.[LIVE_CANARY_ENV] === LIVE_CANARY_ENV_VALUE;
  if (!allowLiveCanary && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "live_canary_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowLiveCanary && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "live_canary_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["provider_metadata_live_canary_double_guard_missing"],
  };
}

function normalizeProviderResult(result = {}) {
  return {
    providerTrackId: typeof result.providerTrackId === "string"
      ? result.providerTrackId
      : typeof result.id === "string"
        ? result.id
        : null,
    title: typeof result.title === "string" ? result.title : null,
    artistName: typeof result.artistName === "string"
      ? result.artistName
      : typeof result.artist === "string"
        ? result.artist
        : null,
    durationMs: Number.isFinite(Number(result.durationMs)) ? Number(result.durationMs) : null,
    sourceUrl: typeof result.sourceUrl === "string" ? result.sourceUrl : null,
  };
}

function validateProviderResults(results = [], { resultLimit = 5 } = {}) {
  const reasonCodes = [];
  if (!Array.isArray(results)) {
    return {
      ok: false,
      normalizedResults: [],
      reasonCodes: ["provider_metadata_results_not_array"],
    };
  }
  if (results.length > resultLimit) {
    reasonCodes.push("provider_metadata_result_limit_exceeded");
  }

  const normalizedResults = results.map(normalizeProviderResult);
  for (const [index, result] of normalizedResults.entries()) {
    if (!result.providerTrackId) {
      reasonCodes.push(`provider_track_id_missing:${index}`);
    }
    if (!result.title) {
      reasonCodes.push(`provider_title_missing:${index}`);
    }
  }

  return {
    ok: reasonCodes.length === 0,
    normalizedResults,
    reasonCodes,
  };
}

async function fetchLiveProviderMetadata({
  env = process.env,
  fetchImpl = fetch,
  contract,
} = {}) {
  if (env.DISCORDOS_MUSIC_PROVIDER_METADATA_SAMPLE) {
    const parsed = JSON.parse(env.DISCORDOS_MUSIC_PROVIDER_METADATA_SAMPLE);
    return {
      ok: true,
      attempted: true,
      status: "sample_loaded",
      httpStatus: null,
      payload: parsed,
      reasonCodes: [],
    };
  }
  if (!env.DISCORDOS_MUSIC_PROVIDER_METADATA_CANARY_URL) {
    return {
      ok: false,
      attempted: false,
      status: "blocked",
      httpStatus: null,
      payload: null,
      reasonCodes: ["provider_metadata_canary_url_missing"],
    };
  }

  const response = await fetchImpl(env.DISCORDOS_MUSIC_PROVIDER_METADATA_CANARY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      action: contract.providerAction,
      query: contract.normalizedQuery,
      limit: contract.resultLimit,
    }),
  });
  const payload = await response.json().catch(() => null);
  return {
    ok: response.ok,
    attempted: true,
    status: response.ok ? "live_canary_loaded" : "failed",
    httpStatus: response.status,
    payload,
    reasonCodes: response.ok ? [] : ["provider_metadata_live_canary_fetch_failed"],
  };
}

async function buildMusicProviderMetadataLiveCanary({
  env = process.env,
  fetchImpl = fetch,
  live = false,
  allowLiveCanary = false,
  ...input
} = {}) {
  const contract = contractInternals.buildMusicProviderMetadataContract({
    ...input,
    env,
  });
  const liveAdmission = resolveLiveCanaryAdmission({ allowLiveCanary, env });
  let liveResult = {
    ok: true,
    attempted: false,
    status: "not_requested",
    httpStatus: null,
    payload: null,
    normalizedResults: [],
    reasonCodes: [],
  };

  if (live) {
    if (!contract.ok) {
      liveResult = {
        ...liveResult,
        ok: false,
        status: "blocked",
        reasonCodes: ["provider_metadata_contract_not_ready"],
      };
    } else if (!liveAdmission.admitted) {
      liveResult = {
        ...liveResult,
        ok: false,
        status: "blocked",
        reasonCodes: ["provider_metadata_live_canary_not_admitted"],
      };
    } else {
      const fetched = await fetchLiveProviderMetadata({
        env,
        fetchImpl,
        contract: contract.contract,
      });
      const payloadResults = Array.isArray(fetched.payload)
        ? fetched.payload
        : Array.isArray(fetched.payload?.results)
          ? fetched.payload.results
          : [];
      const validation = validateProviderResults(payloadResults, contract.contract);
      liveResult = {
        ok: fetched.ok && validation.ok,
        attempted: fetched.attempted,
        status: fetched.ok && validation.ok ? "live_canary_ready" : "blocked",
        httpStatus: fetched.httpStatus,
        payload: fetched.payload,
        normalizedResults: validation.normalizedResults,
        reasonCodes: [...new Set([...fetched.reasonCodes, ...validation.reasonCodes])],
      };
    }
  }

  const reasonCodes = [...new Set([
    ...contract.reasonCodes,
    ...(live ? liveAdmission.reasonCodes : []),
    ...liveResult.reasonCodes,
  ])];
  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    callsMusicProviders: liveResult.attempted,
    controlsPlayback: false,
    slashCommandsAdmitted: false,
    status: reasonCodes.length === 0
      ? live
        ? "provider_metadata_live_canary_ready"
        : "ready_for_provider_metadata_live_canary"
      : "blocked",
    liveAttempted: liveResult.attempted,
    contract: contract.contract,
    providerAdmission: contract.providerAdmission,
    liveAdmission,
    liveResult,
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.music_provider.metadata_live_canary_ready"
        : "discordos.music_provider.metadata_live_canary_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.music_provider.metadata_live_canary",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        liveAttempted: result.liveAttempted,
        resultCount: result.liveResult.normalizedResults.length,
        controlsPlayback: false,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Music Provider Metadata Live Canary",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls music providers: \`${result.callsMusicProviders ? "true" : "false"}\``,
    `- controls playback: \`${result.controlsPlayback ? "true" : "false"}\``,
    `- slash commands admitted: \`${result.slashCommandsAdmitted ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- live attempted: \`${result.liveAttempted ? "true" : "false"}\``,
    `- result count: \`${result.liveResult.normalizedResults.length}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMusicProviderMetadataLiveCanary(options);
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
    LIVE_CANARY_ENV,
    LIVE_CANARY_ENV_VALUE,
    parseArgs,
    resolveLiveCanaryAdmission,
    normalizeProviderResult,
    validateProviderResults,
    fetchLiveProviderMetadata,
    buildMusicProviderMetadataLiveCanary,
    renderMarkdown,
  },
};
