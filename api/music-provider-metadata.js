const {
  _internals: contractInternals,
} = require("../scripts/discordos-music-provider-metadata-contract");
const {
  _internals: canaryInternals,
} = require("../scripts/discordos-music-provider-metadata-live-canary");

const DEFAULT_PROVIDER_RESULT_COUNT = 3;

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeRequestBody(body) {
  if (body == null) {
    return {};
  }

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof body === "object" ? body : {};
}

function normalizeQuerySlug(query) {
  return contractInternals.normalizeQuery(query)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "music-sesh";
}

function buildFallbackProviderResults(contract = {}) {
  const normalizedQuery = contractInternals.normalizeQuery(contract.normalizedQuery);
  const slug = normalizeQuerySlug(normalizedQuery);
  const resultCount = Math.max(1, Math.min(contract.resultLimit || 1, DEFAULT_PROVIDER_RESULT_COUNT));

  return Array.from({ length: resultCount }, (_, index) => ({
    providerTrackId: `${slug}-track-${index + 1}`,
    title: resultCount === 1
      ? normalizedQuery
      : `${normalizedQuery} ${index + 1}`,
    artistName: "DiscordOS Preview",
    durationMs: 180000 + (index * 15000),
    sourceUrl: `https://fawxzzy-discordos.vercel.app/music-provider/${slug}-${index + 1}`,
  }));
}

function parseSampleResults(value) {
  if (!hasValue(value)) {
    return {
      ok: false,
      results: [],
      source: "fallback",
    };
  }

  try {
    const parsed = JSON.parse(value);
    const results = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.results)
        ? parsed.results
        : [];
    return {
      ok: Array.isArray(results),
      results,
      source: "env_sample",
    };
  } catch {
    return {
      ok: false,
      results: [],
      source: "fallback",
    };
  }
}

function resolveProviderResults({ env = process.env, contract } = {}) {
  const sample = parseSampleResults(env.DISCORDOS_MUSIC_PROVIDER_METADATA_SAMPLE);
  if (sample.ok) {
    const validation = canaryInternals.validateProviderResults(sample.results, contract);
    if (validation.ok) {
      return {
        ok: true,
        source: sample.source,
        results: validation.normalizedResults,
      };
    }
  }

  const fallbackResults = buildFallbackProviderResults(contract);
  const validation = canaryInternals.validateProviderResults(fallbackResults, contract);
  return {
    ok: validation.ok,
    source: "fallback_preview",
    results: validation.normalizedResults,
    reasonCodes: validation.reasonCodes,
  };
}

function buildMusicProviderMetadataResponse({
  method = "POST",
  body,
  env = process.env,
} = {}) {
  if (method !== "POST") {
    return {
      statusCode: 405,
      allow: "POST",
      payload: {
        ok: false,
        error: "METHOD_NOT_ALLOWED",
      },
    };
  }

  const normalizedBody = normalizeRequestBody(body);
  const resultLimit = Number.isFinite(Number(normalizedBody.limit))
    ? Number(normalizedBody.limit)
    : 5;
  const metadataEnv = {
    ...env,
    DISCORDOS_MUSIC_PROVIDER_ADAPTER: hasValue(env.DISCORDOS_MUSIC_PROVIDER_ADAPTER)
      ? env.DISCORDOS_MUSIC_PROVIDER_ADAPTER
      : "enabled",
  };
  const contractResult = contractInternals.buildMusicProviderMetadataContract({
    env: metadataEnv,
    providerAction: normalizedBody.action,
    query: normalizedBody.query,
    resultLimit,
    allowProviderAdmission: true,
  });

  if (!contractResult.ok) {
    return {
      statusCode: 400,
      allow: "POST",
      payload: {
        ok: false,
        error: "provider_metadata_contract_blocked",
        reasonCodes: contractResult.reasonCodes,
      },
    };
  }

  const providerResults = resolveProviderResults({
    env: metadataEnv,
    contract: contractResult.contract,
  });

  if (!providerResults.ok) {
    return {
      statusCode: 500,
      allow: "POST",
      payload: {
        ok: false,
        error: "provider_metadata_results_invalid",
        reasonCodes: providerResults.reasonCodes || [],
      },
    };
  }

  return {
    statusCode: 200,
    allow: "POST",
    payload: {
      ok: true,
      action: contractResult.contract.providerAction,
      query: contractResult.contract.normalizedQuery,
      limit: contractResult.contract.resultLimit,
      readOnly: true,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
      callsMusicProviders: false,
      source: providerResults.source,
      results: providerResults.results,
      resultCount: providerResults.results.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

module.exports = async function musicProviderMetadata(req, res) {
  const response = buildMusicProviderMetadataResponse({
    method: req.method,
    body: req.body,
  });
  res.setHeader("Allow", response.allow);
  return res.status(response.statusCode).json(response.payload);
};

module.exports._internals = {
  DEFAULT_PROVIDER_RESULT_COUNT,
  normalizeRequestBody,
  normalizeQuerySlug,
  buildFallbackProviderResults,
  parseSampleResults,
  resolveProviderResults,
  buildMusicProviderMetadataResponse,
};
