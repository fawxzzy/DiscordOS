const FUNCTION_NAME = "discordos-update-drafts";

export const SERVICE_IDENTITY = "discordos-update-drafts-caller";
export const MAX_BODY_BYTES = 64 * 1024;

export const ERROR_STATUS_BY_CODE = Object.freeze({
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  METHOD_NOT_ALLOWED: 405,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PAYLOAD_TOO_LARGE: 413,
  INVALID_PAYLOAD: 400,
  UNSUPPORTED_ACTION: 400,
  INVALID_OPERATION_PAYLOAD: 422,
  INVALID_SELECTOR: 400,
  IMMUTABLE_FIELD: 422,
  INVALID_REVISION: 400,
  INVALID_TRANSITION: 422,
  EMPTY_UPDATE: 400,
  CONFLICT: 409,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
  PRIVILEGED_OPERATION_FAILED: 500,
});

export const ACTION_TO_RPC = Object.freeze({
  list_latest: "discordos_list_update_drafts",
  find_by_deployment_id: "discordos_get_update_draft_by_deployment_id",
  find_by_id: "discordos_get_update_draft_by_id",
  find_by_prefix: "discordos_get_update_draft_by_prefix",
  insert: "discordos_insert_update_draft",
  update: "discordos_update_update_draft",
});

const DRAFT_STATUSES = new Set(["draft", "published", "skipped", "ignored", "failed"]);
const TRANSITION_STATUSES = new Set(["published", "skipped", "ignored", "failed"]);
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AUTHORITY_FIELDS = new Set([
  "caller",
  "owner",
  "ownerService",
  "owner_service",
  "serviceIdentity",
  "service_identity",
  "subject",
  "tenant",
  "tenantId",
  "tenant_id",
]);
const SERVER_OWNED_FIELDS = new Set([
  "createdAt",
  "created_at",
  "id",
  "lastOperatedAt",
  "lastOperatedByService",
  "lastOperation",
  "last_operated_at",
  "last_operated_by_service",
  "last_operation",
  "ownerService",
  "owner_service",
  "publishedAt",
  "publishedByDiscordUserId",
  "published_at",
  "published_by_discord_user_id",
  "revision",
  "skippedAt",
  "skippedByDiscordUserId",
  "skipped_at",
  "skipped_by_discord_user_id",
  "source",
  "status",
  "updatedAt",
  "updated_at",
  "webhookReceivedAt",
  "webhook_received_at",
]);

const JSON_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
});

function stableError(status, error) {
  return ERROR_STATUS_BY_CODE[error] === status
    ? { status, error }
    : {
        status: ERROR_STATUS_BY_CODE.PRIVILEGED_OPERATION_FAILED,
        error: "PRIVILEGED_OPERATION_FAILED",
      };
}

function response(status, error, headers = {}) {
  const stable = stableError(status, error);
  return new Response(JSON.stringify({ ok: false, error: stable.error }), {
    status: stable.status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwnProperty(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function ownStringEnum(value, key, allowedValues) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    return { ok: false };
  }
  if (
    !descriptor ||
    !descriptor.enumerable ||
    !hasOwnProperty(descriptor, "value") ||
    typeof descriptor.value !== "string" ||
    !hasOwnProperty(allowedValues, descriptor.value)
  ) {
    return { ok: false };
  }
  return { ok: true, value: descriptor.value };
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasAuthorityOverride(value) {
  return isPlainObject(value) && Object.keys(value).some((key) => AUTHORITY_FIELDS.has(key));
}

function hasServerOwnedField(value) {
  return isPlainObject(value) && Object.keys(value).some((key) => SERVER_OWNED_FIELDS.has(key));
}

function optionalString(value, { max, pattern } = {}) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const normalized = value.trim();
  if (!normalized || (max && normalized.length > max) || (pattern && !pattern.test(normalized))) {
    return { ok: false };
  }
  return { ok: true, value: normalized };
}

function optionalHttpsUrl(value) {
  const normalized = optionalString(value, { max: 2048 });
  if (!normalized.ok || normalized.value === null) return normalized;
  try {
    const url = new URL(normalized.value);
    return url.protocol === "https:" ? normalized : { ok: false };
  } catch {
    return { ok: false };
  }
}

function canonicalUuid(value) {
  return typeof value === "string" && value.length === 36 && CANONICAL_UUID_PATTERN.test(value)
    ? value
    : null;
}

function validateMappedStrings(values, definitions) {
  const mapped = {};
  for (const [inputName, outputName, validator] of definitions) {
    if (!(inputName in values)) continue;
    const checked = validator(values[inputName]);
    if (!checked.ok) return null;
    mapped[outputName] = checked.value;
  }
  return mapped;
}

function validationError(status, error) {
  return { ok: false, ...stableError(status, error) };
}

function validateList(payload) {
  if (!hasOnlyKeys(payload, new Set(["limit", "status"]))) {
    return validationError(422, "INVALID_OPERATION_PAYLOAD");
  }
  if (payload.limit !== undefined && (!Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 10)) {
    return validationError(400, "INVALID_SELECTOR");
  }
  if (payload.status !== undefined && (typeof payload.status !== "string" || !DRAFT_STATUSES.has(payload.status))) {
    return validationError(400, "INVALID_SELECTOR");
  }
  return {
    ok: true,
    rpcPayload: {
      ...(payload.limit === undefined ? {} : { limit: payload.limit }),
      ...(payload.status === undefined ? {} : { status: payload.status }),
    },
  };
}

function validateDeploymentSelector(payload) {
  if (!hasOnlyKeys(payload, new Set(["deploymentId"]))) {
    return validationError(422, "INVALID_OPERATION_PAYLOAD");
  }
  const deploymentId = optionalString(payload.deploymentId, {
    max: 128,
    pattern: /^[A-Za-z0-9._:-]+$/,
  });
  return deploymentId.ok && deploymentId.value
    ? { ok: true, rpcPayload: { deployment_id: deploymentId.value } }
    : validationError(400, "INVALID_SELECTOR");
}

function validateDraftSelector(payload) {
  if (!hasOnlyKeys(payload, new Set(["draftId"]))) {
    return validationError(422, "INVALID_OPERATION_PAYLOAD");
  }
  const draftId = canonicalUuid(payload.draftId);
  return draftId
    ? { ok: true, rpcPayload: { id: draftId } }
    : validationError(400, "INVALID_SELECTOR");
}

function validatePrefixSelector(payload) {
  if (!hasOnlyKeys(payload, new Set(["lowerBound", "upperBound", "limit"]))) {
    return validationError(422, "INVALID_OPERATION_PAYLOAD");
  }
  const lower = canonicalUuid(payload.lowerBound);
  const upper = canonicalUuid(payload.upperBound);
  if (!lower || !upper || lower > upper) {
    return validationError(400, "INVALID_SELECTOR");
  }
  if (payload.limit !== undefined && (!Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 10)) {
    return validationError(400, "INVALID_SELECTOR");
  }
  return {
    ok: true,
    rpcPayload: {
      lower_bound: lower,
      upper_bound: upper,
      ...(payload.limit === undefined ? {} : { limit: payload.limit }),
    },
  };
}

const INSERT_FIELDS = new Set([
  "deploymentId",
  "deploymentUrl",
  "productionUrl",
  "vercelProjectId",
  "vercelProjectName",
  "vercelTarget",
  "gitCommitSha",
  "gitCommitRef",
  "gitCommitMessage",
  "userFacingTitle",
  "userFacingChanges",
  "userFacingWhyItMatters",
]);

function validateInsert(payload) {
  if (!hasOnlyKeys(payload, new Set(["values"])) || !isPlainObject(payload.values)) {
    return validationError(422, "INVALID_OPERATION_PAYLOAD");
  }
  if (hasAuthorityOverride(payload.values)) return validationError(403, "FORBIDDEN");
  if (hasServerOwnedField(payload.values) || !hasOnlyKeys(payload.values, INSERT_FIELDS)) {
    return validationError(422, "IMMUTABLE_FIELD");
  }

  const deploymentId = optionalString(payload.values.deploymentId, {
    max: 128,
    pattern: /^[A-Za-z0-9._:-]+$/,
  });
  if (!deploymentId.ok || !deploymentId.value) {
    return validationError(422, "INVALID_OPERATION_PAYLOAD");
  }

  const mapped = validateMappedStrings(payload.values, [
    ["deploymentUrl", "deployment_url", optionalHttpsUrl],
    ["productionUrl", "production_url", optionalHttpsUrl],
    ["vercelProjectId", "vercel_project_id", (value) => optionalString(value, { max: 128 })],
    ["vercelProjectName", "vercel_project_name", (value) => optionalString(value, { max: 128 })],
    ["vercelTarget", "vercel_target", (value) => optionalString(value, { max: 40, pattern: /^[a-z0-9_-]+$/i })],
    ["gitCommitSha", "git_commit_sha", (value) => optionalString(value, { max: 64, pattern: /^[0-9a-f]{7,64}$/i })],
    ["gitCommitRef", "git_commit_ref", (value) => optionalString(value, { max: 256 })],
    ["gitCommitMessage", "git_commit_message", (value) => optionalString(value, { max: 500 })],
    ["userFacingTitle", "user_facing_title", (value) => optionalString(value, { max: 120 })],
    ["userFacingChanges", "user_facing_changes", (value) => optionalString(value, { max: 1500 })],
    ["userFacingWhyItMatters", "user_facing_why_it_matters", (value) => optionalString(value, { max: 800 })],
  ]);
  if (!mapped) return validationError(422, "INVALID_OPERATION_PAYLOAD");
  return { ok: true, rpcPayload: { deployment_id: deploymentId.value, ...mapped } };
}

const UPDATE_VALUE_FIELDS = new Set([
  "userFacingTitle",
  "userFacingChanges",
  "userFacingWhyItMatters",
]);

function validateTransition(transition) {
  if (!isPlainObject(transition) || !hasOnlyKeys(transition, new Set(["to", "actorDiscordUserId", "reason"]))) {
    return null;
  }
  if (typeof transition.to !== "string" || !TRANSITION_STATUSES.has(transition.to)) return null;
  const actor = optionalString(transition.actorDiscordUserId, {
    max: 32,
    pattern: /^[0-9]{5,32}$/,
  });
  const reason = optionalString(transition.reason, { max: 500 });
  if (!actor.ok || !reason.ok) return null;
  if ((transition.to === "published" || transition.to === "skipped") && !actor.value) return null;
  if (transition.to === "skipped" && !reason.value) return null;
  if ((transition.to === "ignored" || transition.to === "failed") && actor.value) return null;
  if (transition.to !== "skipped" && reason.value) return null;
  return {
    transition_to: transition.to,
    ...(actor.value ? { actor_discord_user_id: actor.value } : {}),
    ...(reason.value ? { transition_reason: reason.value } : {}),
  };
}

function validateUpdate(payload) {
  if (!hasOnlyKeys(payload, new Set(["draftId", "expectedRevision", "values", "transition"]))) {
    return validationError(422, "INVALID_OPERATION_PAYLOAD");
  }
  if (hasAuthorityOverride(payload) || hasAuthorityOverride(payload.values)) {
    return validationError(403, "FORBIDDEN");
  }
  const draft = validateDraftSelector({ draftId: payload.draftId });
  if (!draft.ok) return draft;
  if (!Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 1) {
    return validationError(400, "INVALID_REVISION");
  }

  let mappedValues = {};
  if (payload.values !== undefined) {
    if (!isPlainObject(payload.values)) return validationError(422, "INVALID_OPERATION_PAYLOAD");
    if (hasServerOwnedField(payload.values) || !hasOnlyKeys(payload.values, UPDATE_VALUE_FIELDS)) {
      return validationError(422, "IMMUTABLE_FIELD");
    }
    mappedValues = validateMappedStrings(payload.values, [
      ["userFacingTitle", "user_facing_title", (value) => optionalString(value, { max: 120 })],
      ["userFacingChanges", "user_facing_changes", (value) => optionalString(value, { max: 1500 })],
      ["userFacingWhyItMatters", "user_facing_why_it_matters", (value) => optionalString(value, { max: 800 })],
    ]);
    if (!mappedValues) return validationError(422, "INVALID_OPERATION_PAYLOAD");
  }

  let mappedTransition = {};
  if (payload.transition !== undefined) {
    mappedTransition = validateTransition(payload.transition);
    if (!mappedTransition) return validationError(422, "INVALID_TRANSITION");
  }
  if (Object.keys(mappedValues).length === 0 && Object.keys(mappedTransition).length === 0) {
    return validationError(400, "EMPTY_UPDATE");
  }
  return {
    ok: true,
    rpcPayload: {
      id: draft.rpcPayload.id,
      expected_revision: payload.expectedRevision,
      ...mappedValues,
      ...mappedTransition,
    },
  };
}

export function validateOperation(body) {
  if (!isPlainObject(body) || !hasOnlyKeys(body, new Set(["action", "payload"]))) {
    return validationError(400, "INVALID_PAYLOAD");
  }
  const selectedAction = ownStringEnum(body, "action", ACTION_TO_RPC);
  if (!selectedAction.ok) {
    return validationError(400, "UNSUPPORTED_ACTION");
  }
  if (!isPlainObject(body.payload)) return validationError(422, "INVALID_OPERATION_PAYLOAD");
  if (hasAuthorityOverride(body.payload)) return validationError(403, "FORBIDDEN");

  const validators = {
    list_latest: validateList,
    find_by_deployment_id: validateDeploymentSelector,
    find_by_id: validateDraftSelector,
    find_by_prefix: validatePrefixSelector,
    insert: validateInsert,
    update: validateUpdate,
  };
  const action = selectedAction.value;
  const validated = validators[action](body.payload);
  return validated.ok
    ? { ...validated, action, rpc: ACTION_TO_RPC[action] }
    : validated;
}

function countTopLevelJsonKey(text, expectedKey) {
  let depth = 0;
  let count = 0;
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === '"') {
      const start = index;
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      if (depth === 1) {
        let next = index;
        while (/\s/.test(text[next] ?? "")) next += 1;
        if (text[next] === ":" && JSON.parse(text.slice(start, index)) === expectedKey) count += 1;
      }
      continue;
    }
    if (character === "{" || character === "[") depth += 1;
    if (character === "}" || character === "]") depth -= 1;
    index += 1;
  }
  return count;
}

async function readJsonBody(request) {
  if (!request.body) return { ok: false, status: 400, error: "INVALID_PAYLOAD" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, error: "PAYLOAD_TOO_LARGE" };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const parsed = JSON.parse(text);
    if (countTopLevelJsonKey(text, "action") > 1) {
      return { ok: false, status: 400, error: "INVALID_PAYLOAD" };
    }
    return isPlainObject(parsed)
      ? { ok: true, body: parsed }
      : { ok: false, status: 400, error: "INVALID_PAYLOAD" };
  } catch {
    return { ok: false, status: 400, error: "INVALID_PAYLOAD" };
  }
}

function mapRpcError(error) {
  if (error?.code === "DU001" || error?.code === "DU003" || error?.code === "DU004") {
    return { status: 409, error: "CONFLICT" };
  }
  if (error?.code === "DU002") return { status: 404, error: "NOT_FOUND" };
  return { status: 500, error: "PRIVILEGED_OPERATION_FAILED" };
}

export function createNamedServiceAuthenticator(verifyAuth) {
  if (typeof verifyAuth !== "function") throw new TypeError("verifyAuth is required");
  return async (request) => {
    const authorization = request.headers.get("authorization");
    const apikey = request.headers.get("apikey");
    if (authorization !== null) return { ok: false, status: 401, error: "UNAUTHORIZED" };
    if (
      typeof apikey !== "string" ||
      apikey !== apikey.trim() ||
      apikey.includes(",") ||
      !/^sb_secret_[A-Za-z0-9_-]{8,480}$/.test(apikey)
    ) {
      return { ok: false, status: 401, error: "UNAUTHORIZED" };
    }

    const exact = await verifyAuth(request, { auth: `secret:${SERVICE_IDENTITY}` });
    if (!exact.error) {
      return exact.data?.authMode === "secret" && exact.data?.keyName === SERVICE_IDENTITY
        ? { ok: true, serviceIdentity: SERVICE_IDENTITY }
        : { ok: false, status: 403, error: "FORBIDDEN" };
    }
    if (exact.error.status >= 500) return { ok: false, status: 503, error: "SERVICE_UNAVAILABLE" };

    const anyNamedSecret = await verifyAuth(request, { auth: "secret:*" });
    if (!anyNamedSecret.error) return { ok: false, status: 403, error: "FORBIDDEN" };
    if (anyNamedSecret.error.status >= 500) {
      return { ok: false, status: 503, error: "SERVICE_UNAVAILABLE" };
    }
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  };
}

export function createDiscordUpdateDraftsHandler({ authenticate, createRpcClient, now = () => new Date() }) {
  if (typeof authenticate !== "function" || typeof createRpcClient !== "function") {
    throw new TypeError("authenticate and createRpcClient are required");
  }

  return async (request) => {
    if (request.method !== "POST") {
      return response(405, "METHOD_NOT_ALLOWED", { Allow: "POST" });
    }
    if (request.headers.has("origin")) return response(403, "FORBIDDEN");

    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") return response(415, "UNSUPPORTED_MEDIA_TYPE");

    const contentLength = request.headers.get("content-length");
    if (contentLength !== null) {
      const parsedLength = Number(contentLength);
      if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) return response(400, "INVALID_PAYLOAD");
      if (parsedLength > MAX_BODY_BYTES) return response(413, "PAYLOAD_TOO_LARGE");
    }

    let authentication;
    try {
      authentication = await authenticate(request);
    } catch {
      return response(503, "SERVICE_UNAVAILABLE");
    }
    if (!authentication?.ok) {
      return response(authentication?.status ?? 401, authentication?.error ?? "UNAUTHORIZED");
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return response(parsed.status, parsed.error);
    const operation = validateOperation(parsed.body);
    if (!operation.ok) return response(operation.status, operation.error);

    let rpcClient;
    try {
      rpcClient = createRpcClient({ serviceIdentity: authentication.serviceIdentity });
    } catch {
      return response(503, "SERVICE_UNAVAILABLE");
    }

    let result;
    try {
      result = await rpcClient.rpc(operation.rpc, { payload: operation.rpcPayload });
    } catch {
      return response(500, "PRIVILEGED_OPERATION_FAILED");
    }
    if (result?.error) {
      const mapped = mapRpcError(result.error);
      return response(mapped.status, mapped.error);
    }

    const rows = Array.isArray(result?.data) ? result.data : result?.data ? [result.data] : [];
    return new Response(
      JSON.stringify({
        ok: true,
        service: FUNCTION_NAME,
        action: operation.action,
        rows,
        generatedAt: now().toISOString(),
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  };
}
