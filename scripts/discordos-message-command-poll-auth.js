const GITHUB_ACTIONS_OIDC_OPENID_CONFIGURATION_URL = "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const GITHUB_ACTIONS_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const DEFAULT_GITHUB_ACTIONS_AUDIENCE = "discordos-message-command-poll";
const DEFAULT_GITHUB_REPOSITORY_ID = "1248508793";
const DEFAULT_GITHUB_REPOSITORY_OWNER_ID = "276708364";
const DEFAULT_GITHUB_REF = "refs/heads/main";
const CLOCK_SKEW_SECONDS = 60;
const CACHE_TTL_MS = 10 * 60 * 1000;

let openIdConfigurationCache = null;
let jsonWebKeySetCache = null;

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function readOptionalEnv(name, env = process.env) {
  return hasValue(env?.[name]) ? env[name].trim() : null;
}

function resolveGitHubActionsAudience(env = process.env) {
  return readOptionalEnv("DISCORDOS_MESSAGE_COMMAND_GITHUB_AUDIENCE", env) || DEFAULT_GITHUB_ACTIONS_AUDIENCE;
}

function resolveGitHubRepositoryId(env = process.env) {
  return readOptionalEnv("DISCORDOS_MESSAGE_COMMAND_GITHUB_REPOSITORY_ID", env) || DEFAULT_GITHUB_REPOSITORY_ID;
}

function resolveGitHubRepositoryOwnerId(env = process.env) {
  return readOptionalEnv("DISCORDOS_MESSAGE_COMMAND_GITHUB_REPOSITORY_OWNER_ID", env) || DEFAULT_GITHUB_REPOSITORY_OWNER_ID;
}

function resolveGitHubRef(env = process.env) {
  return readOptionalEnv("DISCORDOS_MESSAGE_COMMAND_GITHUB_REF", env) || DEFAULT_GITHUB_REF;
}

function resolveAuthorizationBearerToken(headers = {}) {
  const authorization = headers.authorization || headers.Authorization || "";
  const match = String(authorization).trim().match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function base64UrlToBase64(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  return remainder === 0 ? normalized : `${normalized}${"=".repeat(4 - remainder)}`;
}

function decodeBase64UrlText(value) {
  return Buffer.from(base64UrlToBase64(value), "base64").toString("utf8");
}

function decodeBase64UrlBytes(value) {
  return Uint8Array.from(Buffer.from(base64UrlToBase64(value), "base64"));
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseJwt(token) {
  const segments = String(token || "").split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return null;
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments;
  const header = parseJsonObject(decodeBase64UrlText(headerSegment));
  const payload = parseJsonObject(decodeBase64UrlText(payloadSegment));
  if (!header || !payload) {
    return null;
  }

  return {
    header,
    payload,
    signature: decodeBase64UrlBytes(signatureSegment),
    signingInput: new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
  };
}

function parseNumericClaim(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseStringClaim(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function matchesAudience(value, expectedAudience) {
  if (typeof value === "string") {
    return value === expectedAudience;
  }
  if (!Array.isArray(value)) {
    return false;
  }
  return value.includes(expectedAudience);
}

function parseCacheTtlMs(cacheControlHeader) {
  const match = String(cacheControlHeader || "").match(/max-age=(\d+)/i);
  const maxAgeSeconds = match ? Number.parseInt(match[1], 10) : NaN;
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) {
    return CACHE_TTL_MS;
  }

  return Math.max(60_000, Math.min(maxAgeSeconds * 1000, CACHE_TTL_MS));
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
    },
  });
  if (!response.ok) {
    return {
      ok: false,
      message: `OIDC discovery request failed with status ${response.status}.`,
    };
  }

  const parsed = parseJsonObject(await response.text());
  if (!parsed) {
    return {
      ok: false,
      message: "OIDC discovery returned invalid JSON.",
    };
  }

  return {
    ok: true,
    data: parsed,
    ttlMs: parseCacheTtlMs(response.headers.get("cache-control")),
  };
}

async function getOpenIdConfiguration(fetchImpl, nowMs) {
  if (openIdConfigurationCache && openIdConfigurationCache.expiresAt > nowMs) {
    return { ok: true, data: openIdConfigurationCache.value };
  }

  const response = await fetchJson(GITHUB_ACTIONS_OIDC_OPENID_CONFIGURATION_URL, fetchImpl);
  if (!response.ok) {
    return response;
  }

  openIdConfigurationCache = {
    value: response.data,
    expiresAt: nowMs + response.ttlMs,
  };
  return { ok: true, data: response.data };
}

function isOidcJsonWebKey(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof value.kid === "string"
    && typeof value.kty === "string"
    && typeof value.use === "string"
  );
}

async function getJsonWebKeySet(fetchImpl, nowMs) {
  if (jsonWebKeySetCache && jsonWebKeySetCache.expiresAt > nowMs) {
    return { ok: true, keys: jsonWebKeySetCache.value };
  }

  const openIdConfiguration = await getOpenIdConfiguration(fetchImpl, nowMs);
  if (!openIdConfiguration.ok) {
    return openIdConfiguration;
  }

  const jwksUrl = parseStringClaim(openIdConfiguration.data.jwks_uri);
  if (!jwksUrl) {
    return {
      ok: false,
      message: "OIDC discovery response is missing a JWKS URL.",
    };
  }

  const response = await fetchJson(jwksUrl, fetchImpl);
  if (!response.ok) {
    return response;
  }

  const keys = Array.isArray(response.data.keys) ? response.data.keys.filter(isOidcJsonWebKey) : [];
  if (keys.length === 0) {
    return {
      ok: false,
      message: "OIDC JWKS response did not contain any keys.",
    };
  }

  jsonWebKeySetCache = {
    value: keys,
    expiresAt: nowMs + response.ttlMs,
  };
  return { ok: true, keys };
}

async function verifyJwtSignature({ token, fetchImpl, nowMs }) {
  if (!token) {
    return { ok: false, message: "Malformed JWT." };
  }

  const algorithm = parseStringClaim(token.header.alg);
  const keyId = parseStringClaim(token.header.kid);
  if (algorithm !== "RS256" || !keyId) {
    return { ok: false, message: "Unsupported GitHub Actions token header." };
  }

  const jwks = await getJsonWebKeySet(fetchImpl, nowMs);
  if (!jwks.ok) {
    return jwks;
  }

  const matchingKey = jwks.keys.find((key) => key.kid === keyId && key.kty === "RSA" && key.use === "sig");
  if (!matchingKey) {
    return { ok: false, message: "OIDC signing key was not found." };
  }

  const importedKey = await crypto.subtle.importKey(
    "jwk",
    matchingKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    importedKey,
    token.signature,
    token.signingInput,
  );
  if (!verified) {
    return { ok: false, message: "OIDC token signature verification failed." };
  }

  return { ok: true };
}

function validateGitHubActionsClaims(payload, env, nowMs) {
  const issuer = parseStringClaim(payload?.iss);
  const repositoryId = parseStringClaim(payload?.repository_id);
  const repositoryOwnerId = parseStringClaim(payload?.repository_owner_id);
  const ref = parseStringClaim(payload?.ref);
  const eventName = parseStringClaim(payload?.event_name);
  const exp = parseNumericClaim(payload?.exp);
  const nbf = parseNumericClaim(payload?.nbf);
  const iat = parseNumericClaim(payload?.iat);

  if (issuer !== GITHUB_ACTIONS_OIDC_ISSUER) {
    return { ok: false, message: "Unexpected OIDC issuer." };
  }
  if (!matchesAudience(payload?.aud, resolveGitHubActionsAudience(env))) {
    return { ok: false, message: "Unexpected OIDC audience." };
  }
  if (repositoryId !== resolveGitHubRepositoryId(env)) {
    return { ok: false, message: "Unexpected GitHub repository id." };
  }
  if (repositoryOwnerId !== resolveGitHubRepositoryOwnerId(env)) {
    return { ok: false, message: "Unexpected GitHub owner id." };
  }
  if (ref !== resolveGitHubRef(env)) {
    return { ok: false, message: "Unexpected GitHub ref." };
  }
  if (eventName !== "schedule" && eventName !== "workflow_dispatch") {
    return { ok: false, message: "Unexpected GitHub event." };
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  if (!exp || exp < nowSeconds - CLOCK_SKEW_SECONDS) {
    return { ok: false, message: "OIDC token has expired." };
  }
  if (nbf && nbf > nowSeconds + CLOCK_SKEW_SECONDS) {
    return { ok: false, message: "OIDC token is not active yet." };
  }
  if (iat && iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    return { ok: false, message: "OIDC token issued-at is invalid." };
  }

  return { ok: true };
}

async function authorizeDiscordOsMessageCommandPollRequest({
  headers = {},
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  const secret = readOptionalEnv("DISCORDOS_MESSAGE_COMMAND_POLL_SECRET", env) || readOptionalEnv("CRON_SECRET", env);
  const bearerToken = resolveAuthorizationBearerToken(headers);

  if (secret && bearerToken === secret) {
    return { ok: true, mode: "secret" };
  }

  if (!bearerToken) {
    return { ok: false, status: 401, message: "Unauthorized." };
  }

  if (typeof fetchImpl !== "function") {
    return { ok: false, status: 503, message: "GitHub Actions OIDC verification is unavailable." };
  }

  const token = parseJwt(bearerToken);
  if (!token) {
    return { ok: false, status: 401, message: "Unauthorized." };
  }

  try {
    const nowMs = now();
    const signatureResult = await verifyJwtSignature({
      token,
      fetchImpl,
      nowMs,
    });
    if (!signatureResult.ok) {
      return {
        ok: false,
        status: signatureResult.message.startsWith("OIDC discovery") ? 503 : 401,
        message: signatureResult.message.startsWith("OIDC discovery")
          ? "GitHub Actions OIDC verification is unavailable."
          : "Unauthorized.",
      };
    }

    const claimsResult = validateGitHubActionsClaims(token.payload, env, nowMs);
    if (!claimsResult.ok) {
      return { ok: false, status: 401, message: "Unauthorized." };
    }
  } catch (error) {
    console.error("[discordos-message-command] poll authorization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, status: 503, message: "GitHub Actions OIDC verification is unavailable." };
  }

  return { ok: true, mode: "github-actions" };
}

module.exports = {
  _internals: {
    DEFAULT_GITHUB_ACTIONS_AUDIENCE,
    DEFAULT_GITHUB_REPOSITORY_ID,
    DEFAULT_GITHUB_REPOSITORY_OWNER_ID,
    DEFAULT_GITHUB_REF,
    resolveAuthorizationBearerToken,
    parseJwt,
    authorizeDiscordOsMessageCommandPollRequest,
  },
};
