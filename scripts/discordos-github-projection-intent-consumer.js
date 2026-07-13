const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { _internals: notificationRouterInternals } = require("./discordos-notification-router");
const { _internals: updatePostInternals } = require("./discord-update-post");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTRACT_VERSION = "discordos.github.projection-intent-consumer.receipt.v1";
const SELF_CHECK_VERSION = "discordos.github.projection-intent-consumer.self-check.v1";
const PROJECTION_INTENT_CONTRACT_VERSION = "atlas.github.projection-intent.v1";
const SOURCE_RECEIPT_CONTRACT_VERSION = "atlas.github.event-receipt.v1";
const ACCEPTED_ATLAS_CONTRACT_COMMIT = "5cca402e10e98db668f3f3d35d5304848c511e16";
const ACCEPTED_CANONICAL_SCHEMA_SHA256 = "1205438c82d4f36ba86b2b56087b26e6cc4108433ad3b10249ee59a3ef3baf1e";
const CANONICAL_SCHEMA_RELATIVE_PATH = path.join(
  "packages",
  "atlas-contracts",
  "schemas",
  "atlas.github.projection-intent.v1.schema.json"
);
const SOURCE_RECEIPT_SCHEMA_RELATIVE_PATH = path.join(
  "packages",
  "atlas-contracts",
  "schemas",
  "atlas.github.event-receipt.v1.schema.json"
);
const MIRROR_SCHEMA_RELATIVE_PATH = path.join(
  "src",
  "contracts",
  "atlas.github.projection-intent.v1.schema.json"
);
const MIRROR_PROVENANCE_RELATIVE_PATH = path.join(
  "src",
  "contracts",
  "atlas.github.projection-intent.provenance.v1.json"
);
const SCHEMA_SOURCE = Object.freeze({
  explicit: "explicit",
  atlasSiblingCanonical: "atlas_sibling_canonical",
  mirrorFallback: "repo_local_mirror",
});
const DEFAULT_ROUTE_IDENTITIES = Object.freeze({
  update: {
    source: "updates",
    type: "atlas.github.release.observed",
    severity: "info",
  },
  alert: {
    source: "atlas-github",
    type: "atlas.github.security_alert.observed",
    severity: "critical",
  },
});
const DEFAULT_ROUTING_BY_DESTINATION = Object.freeze({
  atlas_ledger: {
    routeDecision: "no_external_action",
    adapterScript: null,
  },
  discordos_update: {
    routeDecision: "updates_route",
    adapterScript: "scripts/discord-update-post.js",
    adapterCommand:
      'npm run ops:discord:update-post -- --title "<planned title>" --body "<planned body>" --json',
  },
  discordos_alerts: {
    routeDecision: "alerts_route",
    adapterScript: "scripts/runtime-health-alert-delivery.js",
    adapterCommand:
      "npm run ops:runtime-health:alert-delivery -- --json",
  },
  discordos_board: {
    routeDecision: "not_admitted_in_v1",
    adapterScript: null,
  },
});
const FORBIDDEN_ARGUMENTS = new Set([
  "--allow-sync",
  "--allow-storage-write",
  "--apply",
  "--bot-token",
  "--channel-id",
  "--credential",
  "--credentials",
  "--discord-bot-token",
  "--discord-token",
  "--live",
  "--message-id",
  "--password",
  "--probe-live",
  "--secret",
  "--send",
  "--token",
  "--webhook",
  "--webhook-url",
  "--write",
]);
const FORBIDDEN_FLAG_PATTERN = /^(--.*(?:apply|live|send|webhook|token|secret|password|credential|channel-id|message-id))/i;
const DISCORD_WEBHOOK_PATTERN = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[\w-]+$/i;
const DISCORD_TOKEN_PATTERN = /^(?:Bot\s+)?[A-Za-z0-9._-]{24,}$/;
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const SECRET_KEYS = new Set([
  "access_key",
  "access_token",
  "api_key",
  "auth_token",
  "authorization",
  "bot_token",
  "client_secret",
  "credential",
  "credentials",
  "message_id",
  "password",
  "private_key",
  "secret",
  "token",
  "webhook_url",
]);
const SUPPORTED_STATUSES = new Set([
  "blocked",
  "no_external_action",
  "planned",
  "requires_review",
  "suppressed",
]);
const REQUIRED_PROJECTION_SCHEMA_FIELDS = Object.freeze([
  "contract_version",
  "projection_id",
  "idempotency_key",
  "created_at",
  "admission_ref",
  "source_event",
  "decision",
  "destination",
  "operation",
  "route",
  "normalized_fact_refs",
  "reason_codes",
  "authority",
  "external_mutation",
  "evidence_refs",
]);
const REQUIRED_SOURCE_SCHEMA_FIELDS = Object.freeze([
  "contract_version",
  "event_id",
  "idempotency_key",
  "observed_at",
  "event_family",
  "fact_state",
  "source",
  "subject",
  "correlation",
  "evidence_refs",
  "digest",
  "normalized_facts",
  "authority",
]);
const ERROR_CODES = Object.freeze({
  usageError: "discordos_github_projection_intent_consumer_usage_error",
  liveApplyNotAdmitted: "live_apply_not_admitted",
  intentPathRequired: "intent_path_required",
  intentJsonInvalid: "intent_json_invalid",
  sourceReceiptJsonInvalid: "source_receipt_json_invalid",
  priorReceiptJsonInvalid: "prior_receipt_json_invalid",
  intentSchemaInvalid: "projection_intent_schema_invalid",
  sourceReceiptSchemaInvalid: "source_receipt_schema_invalid",
  sourceReceiptRequired: "source_receipt_required_for_discord_destination",
  sourceReceiptSchemaMissing: "source_receipt_schema_missing",
  sourceReceiptSchemaIncompatible: "source_receipt_schema_incompatible",
  explicitSchemaMissing: "projection_intent_explicit_schema_missing",
  explicitSchemaInvalid: "projection_intent_explicit_schema_invalid",
  explicitSchemaDigestMismatch: "projection_intent_explicit_schema_digest_mismatch",
  canonicalSchemaMissing: "projection_intent_canonical_schema_missing",
  canonicalSchemaInvalid: "projection_intent_canonical_schema_invalid",
  canonicalSchemaDigestMismatch: "projection_intent_canonical_schema_digest_mismatch",
  mirrorSchemaMissing: "projection_intent_mirror_schema_missing",
  mirrorProvenanceMissing: "projection_intent_mirror_provenance_missing",
  mirrorProvenanceInvalid: "projection_intent_mirror_provenance_invalid",
  mirrorDigestMismatch: "projection_intent_mirror_digest_mismatch",
  sourceEvidenceMismatch: "source_receipt_correlation_failed",
  notificationRouteConfigInvalid: "notification_route_config_invalid",
  priorReceiptInvalid: "prior_receipt_invalid",
  outputWriteFailed: "output_write_failed",
});

function createReasonError(reasonCode, errors = []) {
  const error = new Error(reasonCode);
  error.reasonCode = reasonCode;
  error.errors = errors;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toPosixPath(value) {
  return String(value).replaceAll("\\", "/");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256(value) {
  return `sha256:${sha256Hex(value)}`;
}

function prefixedDigest(prefix, value) {
  return `${prefix}${sha256Hex(value)}`;
}

function toCanonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => toCanonicalValue(item));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, toCanonicalValue(value[key])])
    );
  }
  return value;
}

function stableStringify(value, { pretty = true } = {}) {
  return `${JSON.stringify(toCanonicalValue(value), null, pretty ? 2 : 0)}\n`;
}

function pathExists(filePath) {
  return fs.existsSync(filePath);
}

function isPathInside(basePath, filePath) {
  const relativePath = path.relative(basePath, filePath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function reportPath(filePath, { atlasRoot = null, repoRoot = REPO_ROOT } = {}) {
  if (atlasRoot && (filePath === atlasRoot || isPathInside(atlasRoot, filePath))) {
    return toPosixPath(path.relative(atlasRoot, filePath) || ".");
  }
  if (filePath === repoRoot || isPathInside(repoRoot, filePath)) {
    return toPosixPath(path.relative(repoRoot, filePath) || ".");
  }
  return path.basename(filePath);
}

function valueTypeMatches(expectedType, value) {
  switch (expectedType) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return Number.isInteger(value);
    case "object":
      return isPlainObject(value);
    case "string":
      return typeof value === "string";
    default:
      return false;
  }
}

function resolveSchemaRef(schemaRoot, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    throw new Error(`unsupported_schema_ref:${ref}`);
  }
  return ref
    .slice(2)
    .split("/")
    .reduce((node, segment) => node?.[segment], schemaRoot);
}

function validateAgainstSchema(schemaRoot, schema, value, valuePath = "$") {
  if (!schema) {
    return [`${valuePath} schema is missing`];
  }

  if (schema.$ref) {
    return validateAgainstSchema(schemaRoot, resolveSchemaRef(schemaRoot, schema.$ref), value, valuePath);
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) {
    return [`${valuePath} must equal ${JSON.stringify(schema.const)}`];
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return [`${valuePath} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`];
  }

  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expectedTypes.some((expectedType) => valueTypeMatches(expectedType, value))) {
      return [`${valuePath} must be ${expectedTypes.join(" or ")}`];
    }
  }

  if (value === null || value === undefined) {
    return [];
  }

  const errors = [];

  if (
    schema.type === "object"
    || (Array.isArray(schema.type) && isPlainObject(value))
  ) {
    const requiredFields = Array.isArray(schema.required) ? schema.required : [];
    for (const field of requiredFields) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        errors.push(`${valuePath}.${field} is required`);
      }
    }

    const properties = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${valuePath}.${key} is not allowed`);
        }
      }
    }

    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validateAgainstSchema(schemaRoot, childSchema, value[key], `${valuePath}.${key}`));
      }
    }
  } else if (
    schema.type === "array"
    || (Array.isArray(schema.type) && Array.isArray(value))
  ) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${valuePath} must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateAgainstSchema(schemaRoot, schema.items, item, `${valuePath}[${index}]`));
      });
    }
  } else if (
    schema.type === "string"
    || (Array.isArray(schema.type) && typeof value === "string")
  ) {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${valuePath} must be at least ${schema.minLength} characters`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern, "u").test(value))) {
      errors.push(`${valuePath} does not match required pattern`);
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      errors.push(`${valuePath} must be a valid date-time`);
    }
  }

  return errors;
}

function readJsonFile(filePath, reasonCode) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw createReasonError(reasonCode);
  }
}

function readTextFile(filePath, reasonCode) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    throw createReasonError(reasonCode);
  }
}

function findAtlasRoot(startDir = REPO_ROOT) {
  let current = path.resolve(startDir);
  while (true) {
    if (pathExists(path.join(current, CANONICAL_SCHEMA_RELATIVE_PATH))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function assertCompatibleProjectionSchema(schema, reasonCode) {
  if (!isPlainObject(schema)) {
    throw createReasonError(reasonCode, ["schema root must be an object"]);
  }
  if (schema.properties?.contract_version?.const !== PROJECTION_INTENT_CONTRACT_VERSION) {
    throw createReasonError(reasonCode, [`schema must declare contract_version ${PROJECTION_INTENT_CONTRACT_VERSION}`]);
  }
  const requiredFields = Array.isArray(schema.required) ? schema.required : [];
  for (const field of REQUIRED_PROJECTION_SCHEMA_FIELDS) {
    if (!requiredFields.includes(field)) {
      throw createReasonError(reasonCode, [`schema is missing required field ${field}`]);
    }
  }
  if (schema.properties?.authority?.$ref !== "#/$defs/authority") {
    throw createReasonError(reasonCode, ["schema.authority must resolve through #/$defs/authority"]);
  }
  if (schema.$defs?.authority?.properties?.intent_producer?.const !== "Atlas") {
    throw createReasonError(reasonCode, ["schema authority intent_producer must remain Atlas"]);
  }
  if (schema.$defs?.authority?.properties?.external_writer?.const !== "DiscordOS") {
    throw createReasonError(reasonCode, ["schema authority external_writer must remain DiscordOS"]);
  }
}

function assertCompatibleSourceReceiptSchema(schema, reasonCode) {
  if (!isPlainObject(schema)) {
    throw createReasonError(reasonCode, ["schema root must be an object"]);
  }
  if (schema.properties?.contract_version?.const !== SOURCE_RECEIPT_CONTRACT_VERSION) {
    throw createReasonError(reasonCode, [`schema must declare contract_version ${SOURCE_RECEIPT_CONTRACT_VERSION}`]);
  }
  const requiredFields = Array.isArray(schema.required) ? schema.required : [];
  for (const field of REQUIRED_SOURCE_SCHEMA_FIELDS) {
    if (!requiredFields.includes(field)) {
      throw createReasonError(reasonCode, [`schema is missing required field ${field}`]);
    }
  }
  if (schema.properties?.authority?.$ref !== "#/$defs/authority") {
    throw createReasonError(reasonCode, ["schema.authority must resolve through #/$defs/authority"]);
  }
  if (schema.$defs?.authority?.properties?.producer?.const !== "_stack") {
    throw createReasonError(reasonCode, ["schema authority producer must remain _stack"]);
  }
}

function loadCompatibleProjectionSchemaFromPath(filePath, reasonCode) {
  const raw = readTextFile(filePath, reasonCode);
  const schema = JSON.parse(raw);
  assertCompatibleProjectionSchema(schema, reasonCode);
  return { raw, schema };
}

function loadCompatibleSourceSchemaFromPath(filePath, reasonCode) {
  const raw = readTextFile(filePath, reasonCode);
  const schema = JSON.parse(raw);
  assertCompatibleSourceReceiptSchema(schema, reasonCode);
  return { raw, schema };
}

function mirrorSchemaPath(repoRoot = REPO_ROOT) {
  return path.join(repoRoot, MIRROR_SCHEMA_RELATIVE_PATH);
}

function mirrorProvenancePath(repoRoot = REPO_ROOT) {
  return path.join(repoRoot, MIRROR_PROVENANCE_RELATIVE_PATH);
}

function buildExpectedMirrorProvenance() {
  return {
    contract_id: PROJECTION_INTENT_CONTRACT_VERSION,
    contract_version: "v1",
    atlas_owner_repository: "ATLAS",
    atlas_owner_ref: "root-commit",
    atlas_owner_commit: ACCEPTED_ATLAS_CONTRACT_COMMIT,
    canonical_schema_path: toPosixPath(CANONICAL_SCHEMA_RELATIVE_PATH),
    canonical_sha256: ACCEPTED_CANONICAL_SCHEMA_SHA256,
    mirror_path: toPosixPath(MIRROR_SCHEMA_RELATIVE_PATH),
    mirror_sha256: ACCEPTED_CANONICAL_SCHEMA_SHA256,
    synchronization_command:
      "Copy-Item (Join-Path $AtlasRoot 'packages/atlas-contracts/schemas/atlas.github.projection-intent.v1.schema.json') 'src/contracts/atlas.github.projection-intent.v1.schema.json' -Force",
    deterministic_check:
      "Get-FileHash canonical and mirror schema files with SHA256 and require exact digest equality.",
    fallback_scope: "isolated_discordos_ci_only",
    fallback_statement: "Mirror fallback is for isolated DiscordOS CI only.",
  };
}

function isValidMirrorProvenance(provenance, mirrorDigest) {
  const expected = buildExpectedMirrorProvenance();
  return Object.entries(expected).every(([key, value]) => provenance?.[key] === value)
    && mirrorDigest === `sha256:${expected.mirror_sha256}`;
}

function inspectMirrorStatus({ repoRoot = REPO_ROOT } = {}) {
  const schemaPath = mirrorSchemaPath(repoRoot);
  const provenancePath = mirrorProvenancePath(repoRoot);
  const status = {
    schema_path: toPosixPath(MIRROR_SCHEMA_RELATIVE_PATH),
    provenance_path: toPosixPath(MIRROR_PROVENANCE_RELATIVE_PATH),
    present: pathExists(schemaPath),
    provenance_present: pathExists(provenancePath),
    digest: null,
    digest_matches_canonical: false,
    provenance_valid: false,
    fallback_only_for: "isolated_discordos_ci_only",
  };

  if (status.present) {
    status.digest = sha256(readTextFile(schemaPath, ERROR_CODES.mirrorSchemaMissing));
    status.digest_matches_canonical = status.digest === `sha256:${ACCEPTED_CANONICAL_SCHEMA_SHA256}`;
  }

  if (status.provenance_present) {
    try {
      const provenance = readJsonFile(provenancePath, ERROR_CODES.mirrorProvenanceInvalid);
      status.provenance_valid = isValidMirrorProvenance(provenance, status.digest);
    } catch {
      status.provenance_valid = false;
    }
  }

  return status;
}

function resolveProjectionIntentSchema({
  schemaPath = null,
  repoRoot = REPO_ROOT,
  cwd = process.cwd(),
  atlasRoot = findAtlasRoot(repoRoot),
} = {}) {
  const mirrorStatus = inspectMirrorStatus({ repoRoot });
  const atlasSchemaPath = atlasRoot ? path.join(atlasRoot, CANONICAL_SCHEMA_RELATIVE_PATH) : null;

  if (schemaPath != null) {
    const normalizedSchemaPath = String(schemaPath || "").trim();
    if (normalizedSchemaPath.length === 0) {
      throw createReasonError(ERROR_CODES.explicitSchemaMissing, ["--schema requires a path"]);
    }
    const resolvedSchemaPath = path.resolve(cwd, normalizedSchemaPath);
    if (!pathExists(resolvedSchemaPath)) {
      throw createReasonError(ERROR_CODES.explicitSchemaMissing);
    }
    let loaded;
    try {
      loaded = loadCompatibleProjectionSchemaFromPath(resolvedSchemaPath, ERROR_CODES.explicitSchemaInvalid);
    } catch (error) {
      if (error.reasonCode === ERROR_CODES.explicitSchemaInvalid) {
        throw error;
      }
      throw createReasonError(ERROR_CODES.explicitSchemaInvalid);
    }
    const digest = sha256(loaded.raw);
    if (digest !== `sha256:${ACCEPTED_CANONICAL_SCHEMA_SHA256}`) {
      throw createReasonError(ERROR_CODES.explicitSchemaDigestMismatch);
    }
    return {
      source: SCHEMA_SOURCE.explicit,
      schema: loaded.schema,
      digest,
      schema_path: resolvedSchemaPath,
      schema_reference: reportPath(resolvedSchemaPath, { atlasRoot, repoRoot }),
      mirror_status: mirrorStatus,
      provenance: buildExpectedMirrorProvenance(),
    };
  }

  if (atlasSchemaPath && pathExists(atlasSchemaPath)) {
    let loaded;
    try {
      loaded = loadCompatibleProjectionSchemaFromPath(atlasSchemaPath, ERROR_CODES.canonicalSchemaInvalid);
    } catch (error) {
      if (error.reasonCode === ERROR_CODES.canonicalSchemaInvalid) {
        throw error;
      }
      throw createReasonError(ERROR_CODES.canonicalSchemaInvalid);
    }
    const digest = sha256(loaded.raw);
    if (digest !== `sha256:${ACCEPTED_CANONICAL_SCHEMA_SHA256}`) {
      throw createReasonError(ERROR_CODES.canonicalSchemaDigestMismatch);
    }
    return {
      source: SCHEMA_SOURCE.atlasSiblingCanonical,
      schema: loaded.schema,
      digest,
      schema_path: atlasSchemaPath,
      schema_reference: toPosixPath(CANONICAL_SCHEMA_RELATIVE_PATH),
      mirror_status: mirrorStatus,
      provenance: buildExpectedMirrorProvenance(),
    };
  }

  if (!mirrorStatus.present) {
    throw createReasonError(ERROR_CODES.mirrorSchemaMissing);
  }
  if (!mirrorStatus.provenance_present) {
    throw createReasonError(ERROR_CODES.mirrorProvenanceMissing);
  }
  if (!mirrorStatus.digest_matches_canonical) {
    throw createReasonError(ERROR_CODES.mirrorDigestMismatch);
  }
  if (!mirrorStatus.provenance_valid) {
    throw createReasonError(ERROR_CODES.mirrorProvenanceInvalid);
  }

  const schemaFilePath = mirrorSchemaPath(repoRoot);
  let loaded;
  try {
    loaded = loadCompatibleProjectionSchemaFromPath(schemaFilePath, ERROR_CODES.mirrorSchemaMissing);
  } catch {
    throw createReasonError(ERROR_CODES.mirrorSchemaMissing);
  }
  return {
    source: SCHEMA_SOURCE.mirrorFallback,
    schema: loaded.schema,
    digest: mirrorStatus.digest,
    schema_path: schemaFilePath,
    schema_reference: toPosixPath(MIRROR_SCHEMA_RELATIVE_PATH),
    mirror_status: mirrorStatus,
    provenance: buildExpectedMirrorProvenance(),
  };
}

function loadSourceReceiptSchema({ atlasRoot = findAtlasRoot(REPO_ROOT) } = {}) {
  if (!atlasRoot) {
    throw createReasonError(ERROR_CODES.sourceReceiptSchemaMissing);
  }
  const schemaPath = path.join(atlasRoot, SOURCE_RECEIPT_SCHEMA_RELATIVE_PATH);
  if (!pathExists(schemaPath)) {
    throw createReasonError(ERROR_CODES.sourceReceiptSchemaMissing);
  }
  try {
    const loaded = loadCompatibleSourceSchemaFromPath(schemaPath, ERROR_CODES.sourceReceiptSchemaIncompatible);
    return {
      schema: loaded.schema,
      schema_path: schemaPath,
      schema_reference: toPosixPath(SOURCE_RECEIPT_SCHEMA_RELATIVE_PATH),
      digest: sha256(loaded.raw),
    };
  } catch (error) {
    if (error.reasonCode === ERROR_CODES.sourceReceiptSchemaIncompatible) {
      throw error;
    }
    throw createReasonError(ERROR_CODES.sourceReceiptSchemaIncompatible);
  }
}

function validateJsonDocument({ document, schema, reasonCode }) {
  const errors = validateAgainstSchema(schema, schema, document);
  if (errors.length > 0) {
    throw createReasonError(reasonCode, errors);
  }
}

function normalizeText(value, maxLength = 400) {
  const raw = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/@/g, "[at]");
  const flattened = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  const escaped = flattened
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "'")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\|/g, "\\|")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#");
  return escaped.length <= maxLength
    ? escaped
    : `${escaped.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizedFactsByKey(sourceReceipt) {
  return new Map(
    (sourceReceipt.normalized_facts || []).map((fact) => [fact.fact_key, fact])
  );
}

function correlateIntentWithSourceReceipt(intent, sourceReceipt) {
  const factMap = normalizedFactsByKey(sourceReceipt);
  const missingFactRefs = [];
  const matchedFacts = [];

  for (const factRef of intent.normalized_fact_refs) {
    const fact = factMap.get(factRef);
    if (!fact) {
      missingFactRefs.push(factRef);
      continue;
    }
    matchedFacts.push({
      fact_key: fact.fact_key,
      state: fact.state,
      value: fact.value,
      source_path: fact.source_path,
      note: fact.note,
    });
  }

  const mismatches = [];
  if (intent.source_event.event_id !== sourceReceipt.event_id) {
    mismatches.push("source_event_id_mismatch");
  }
  if (intent.source_event.event_family !== sourceReceipt.event_family) {
    mismatches.push("source_event_family_mismatch");
  }
  if (intent.source_event.digest_algorithm !== sourceReceipt.digest.algorithm) {
    mismatches.push("source_digest_algorithm_mismatch");
  }
  if (intent.source_event.digest_value !== sourceReceipt.digest.value) {
    mismatches.push("source_digest_value_mismatch");
  }
  if (missingFactRefs.length > 0) {
    mismatches.push("normalized_fact_refs_missing");
  }

  if (mismatches.length > 0) {
    throw createReasonError(
      ERROR_CODES.sourceEvidenceMismatch,
      [
        ...mismatches,
        ...missingFactRefs.map((factRef) => `missing_fact_ref:${factRef}`),
      ]
    );
  }

  return {
    required: true,
    provided: true,
    status: "matched",
    event_id: intent.source_event.event_id,
    event_family: intent.source_event.event_family,
    digest_algorithm: intent.source_event.digest_algorithm,
    digest_value: intent.source_event.digest_value,
    matched_fact_refs: intent.normalized_fact_refs.slice(),
    matched_facts: matchedFacts,
  };
}

function isDiscordDestination(destination) {
  return destination.startsWith("discordos_");
}

function deriveApplicationIdentity(intent) {
  const identity = stableStringify(
    {
      contract_version: PROJECTION_INTENT_CONTRACT_VERSION,
      destination: intent.destination,
      operation: intent.operation,
      projection_id: intent.projection_id,
      source_event_id: intent.source_event.event_id,
    },
    { pretty: false }
  );
  return prefixedDigest("dga_", identity);
}

function buildApplicationEnvelope(intent) {
  return {
    application_id: deriveApplicationIdentity(intent),
    atlas_projection_id: intent.projection_id,
    idempotency_key: intent.idempotency_key,
  };
}

function buildEvidenceRefs(intent, sourceReceipt, schemaResolution) {
  const combined = new Set(intent.evidence_refs || []);
  if (Array.isArray(sourceReceipt?.evidence_refs)) {
    sourceReceipt.evidence_refs.forEach((value) => combined.add(value));
  }
  combined.add(schemaResolution.schema_reference);
  combined.add(toPosixPath(MIRROR_PROVENANCE_RELATIVE_PATH));
  return [...combined].sort();
}

function buildSchemaReceipt(schemaResolution) {
  return {
    contract_version: PROJECTION_INTENT_CONTRACT_VERSION,
    atlas_owner_commit: ACCEPTED_ATLAS_CONTRACT_COMMIT,
    canonical_schema_digest: `sha256:${ACCEPTED_CANONICAL_SCHEMA_SHA256}`,
    selected_source: schemaResolution.source,
    selected_schema_reference: schemaResolution.schema_reference,
    selected_schema_digest: schemaResolution.digest,
    mirror_status: schemaResolution.mirror_status,
    provenance: schemaResolution.provenance,
  };
}

function buildProjectionReceipt(intent) {
  return {
    projection_id: intent.projection_id,
    admission_id: intent.admission_ref.admission_id,
    admission_decision: intent.admission_ref.decision,
    created_at: intent.created_at,
    destination: intent.destination,
    operation: intent.operation,
    atlas_decision: intent.decision,
  };
}

function loadAliasAwareNotificationRouteConfig({
  configPath = notificationRouterInternals.DEFAULT_CONFIG_PATH,
  notificationRouter = notificationRouterInternals,
} = {}) {
  const rawConfig = readJsonFile(
    configPath,
    ERROR_CODES.notificationRouteConfigInvalid
  );

  if (!rawConfig || rawConfig.version !== 1 || !Array.isArray(rawConfig.routes)) {
    throw createReasonError(ERROR_CODES.notificationRouteConfigInvalid);
  }

  const routes = [];
  for (const rawRoute of rawConfig.routes) {
    if (!isPlainObject(rawRoute)) {
      throw createReasonError(ERROR_CODES.notificationRouteConfigInvalid);
    }
    const aliases = Array.isArray(rawRoute.aliases) ? rawRoute.aliases : [];
    const { aliases: _ignoredAliases, ...primaryRoute } = rawRoute;
    routes.push(notificationRouter.normalizeRoute(primaryRoute));
    for (const aliasRoute of aliases) {
      routes.push(notificationRouter.normalizeRoute(aliasRoute));
    }
  }

  return {
    version: 1,
    routes,
  };
}

function buildNotificationRoute({
  source,
  type,
  severity,
  notificationRouter = notificationRouterInternals,
}) {
  const config = loadAliasAwareNotificationRouteConfig({
    configPath: notificationRouter.DEFAULT_CONFIG_PATH,
    notificationRouter,
  });
  const intent = notificationRouter.normalizeNotificationIntent({
    source,
    type,
    severity,
  });
  const decision = notificationRouter.resolveNotificationRoute({
    intent,
    config,
  });
  const ok = decision.status === "routed";
  const result = {
    ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: ok ? "ready" : "blocked",
    intent,
    route: decision.route
      ? {
          id: decision.route.id,
          target: decision.route.target,
          targetEnv: decision.route.targetEnv,
          fallbackTargetEnv: decision.route.fallbackTargetEnv,
          minSeverity: decision.route.minSeverity,
        }
      : null,
    routeDecision: {
      status: decision.status,
      reasonCodes: decision.reasonCodes,
    },
    reasonCodes: decision.reasonCodes,
  };

  return {
    ...result,
    event: notificationRouter.classifyNotificationRouterEvent(result),
  };
}

function buildUpdateTitle(sourceReceipt) {
  const subjectLabel = normalizeText(
    sourceReceipt.subject?.title
      || sourceReceipt.subject?.entity_ref
      || sourceReceipt.subject?.entity_id
      || "unknown release",
    180
  );
  return normalizeText(`GitHub release observed: ${subjectLabel}`, updatePostInternals.MAX_EMBED_TITLE_LENGTH);
}

function buildUpdateBody({ intent, sourceReceipt, correlation }) {
  const lines = [
    `Repository: ${normalizeText(sourceReceipt.subject?.repository || "unknown", 160)}`,
    `Event family: ${normalizeText(sourceReceipt.event_family || "unknown", 60)}`,
    `Projection decision: ${normalizeText(intent.decision, 60)}`,
  ];

  const boundedSummary = normalizeText(intent.summary || sourceReceipt.summary || "", 600);
  if (boundedSummary) {
    lines.push(`Summary: ${boundedSummary}`);
  }

  if (correlation.matched_facts.length > 0) {
    lines.push("Facts:");
    for (const fact of correlation.matched_facts.slice(0, 8)) {
      const factValue = fact.value == null ? "none" : normalizeText(fact.value, 160);
      lines.push(`- ${normalizeText(fact.fact_key, 80)}: ${factValue} [${normalizeText(fact.state, 40)}]`);
    }
  }

  const body = lines.join("\n");
  const normalized = updatePostInternals.normalizeMarkdownBody(body);
  return normalized.length <= updatePostInternals.MAX_EMBED_DESCRIPTION_LENGTH
    ? normalized
    : normalized.slice(0, updatePostInternals.MAX_EMBED_DESCRIPTION_LENGTH - 1).trimEnd();
}

function buildAlertSummary(sourceReceipt) {
  const label = normalizeText(
    sourceReceipt.subject?.title
      || sourceReceipt.subject?.entity_ref
      || sourceReceipt.subject?.entity_id
      || "unknown security alert",
    180
  );
  return normalizeText(`GitHub security alert observed: ${label}`, 240);
}

function buildAlertBody({ intent, sourceReceipt, correlation }) {
  const lines = [
    `Repository: ${normalizeText(sourceReceipt.subject?.repository || "unknown", 160)}`,
    `Event family: ${normalizeText(sourceReceipt.event_family || "unknown", 60)}`,
    `Projection decision: ${normalizeText(intent.decision, 60)}`,
  ];

  const boundedSummary = normalizeText(intent.summary || sourceReceipt.summary || "", 400);
  if (boundedSummary) {
    lines.push(`Summary: ${boundedSummary}`);
  }

  if (correlation.matched_facts.length > 0) {
    lines.push("Facts:");
    for (const fact of correlation.matched_facts.slice(0, 8)) {
      const factValue = fact.value == null ? "none" : normalizeText(fact.value, 160);
      lines.push(`- ${normalizeText(fact.fact_key, 80)}: ${factValue} [${normalizeText(fact.state, 40)}]`);
    }
  }

  return lines.join("\n");
}

async function buildRouteAndPlan({
  intent,
  sourceReceipt,
  correlation,
  notificationRouter = notificationRouterInternals,
}) {
  if (intent.destination === "atlas_ledger") {
    if (intent.operation !== "record") {
      return {
        status: "blocked",
        route: null,
        adapter: null,
        command_plan: null,
        reason_codes: ["unsupported_destination_operation"],
      };
    }
    return {
      status: "no_external_action",
      route: {
        route_id: null,
        notification_source: null,
        notification_type: null,
        notification_severity: null,
        target: null,
        target_env: [],
      },
      adapter: {
        adapter_script: null,
        command_surface: null,
      },
      command_plan: null,
      reason_codes: ["atlas_ledger_record_no_external_action"],
    };
  }

  if (intent.destination === "discordos_board") {
    return {
      status: "blocked",
      route: null,
      adapter: {
        adapter_script: null,
        command_surface: null,
      },
      command_plan: null,
      reason_codes: ["not_admitted_in_v1"],
    };
  }

  if (intent.destination === "discordos_update") {
    if (intent.operation !== "publish") {
      return {
        status: "blocked",
        route: null,
        adapter: null,
        command_plan: null,
        reason_codes: ["unsupported_destination_operation"],
      };
    }
    const routeDecision = await buildNotificationRoute({
      ...DEFAULT_ROUTE_IDENTITIES.update,
      notificationRouter,
    });
    const route = {
      route_id: routeDecision.route?.id || null,
      notification_source: DEFAULT_ROUTE_IDENTITIES.update.source,
      notification_type: DEFAULT_ROUTE_IDENTITIES.update.type,
      notification_severity: DEFAULT_ROUTE_IDENTITIES.update.severity,
      target: routeDecision.route?.target || null,
      target_env: [routeDecision.route?.targetEnv, routeDecision.route?.fallbackTargetEnv].filter(Boolean),
    };
    if (!routeDecision.ok) {
      return {
        status: "blocked",
        route,
        adapter: {
          adapter_script: DEFAULT_ROUTING_BY_DESTINATION.discordos_update.adapterScript,
          command_surface: DEFAULT_ROUTING_BY_DESTINATION.discordos_update.adapterCommand,
        },
        command_plan: null,
        reason_codes: ["notification_route_not_admitted", ...routeDecision.reasonCodes],
      };
    }

    const title = buildUpdateTitle(sourceReceipt);
    const body = buildUpdateBody({ intent, sourceReceipt, correlation });
    updatePostInternals.validatePayloadInputs({ title, body });

    return {
      status: intent.decision === "requires_review" ? "requires_review" : "planned",
      route,
      adapter: {
        adapter_script: DEFAULT_ROUTING_BY_DESTINATION.discordos_update.adapterScript,
        command_surface: DEFAULT_ROUTING_BY_DESTINATION.discordos_update.adapterCommand,
      },
      command_plan: {
        title,
        body,
      },
      reason_codes: [],
    };
  }

  if (intent.destination === "discordos_alerts") {
    if (intent.operation !== "alert") {
      return {
        status: "blocked",
        route: null,
        adapter: null,
        command_plan: null,
        reason_codes: ["unsupported_destination_operation"],
      };
    }
    const routeDecision = await buildNotificationRoute({
      ...DEFAULT_ROUTE_IDENTITIES.alert,
      notificationRouter,
    });
    const route = {
      route_id: routeDecision.route?.id || null,
      notification_source: DEFAULT_ROUTE_IDENTITIES.alert.source,
      notification_type: DEFAULT_ROUTE_IDENTITIES.alert.type,
      notification_severity: DEFAULT_ROUTE_IDENTITIES.alert.severity,
      target: routeDecision.route?.target || null,
      target_env: [routeDecision.route?.targetEnv, routeDecision.route?.fallbackTargetEnv].filter(Boolean),
    };
    if (!routeDecision.ok) {
      return {
        status: "blocked",
        route,
        adapter: {
          adapter_script: DEFAULT_ROUTING_BY_DESTINATION.discordos_alerts.adapterScript,
          command_surface: DEFAULT_ROUTING_BY_DESTINATION.discordos_alerts.adapterCommand,
        },
        command_plan: null,
        reason_codes: ["notification_route_not_admitted", ...routeDecision.reasonCodes],
      };
    }

    return {
      status: intent.decision === "requires_review" ? "requires_review" : "planned",
      route,
      adapter: {
        adapter_script: DEFAULT_ROUTING_BY_DESTINATION.discordos_alerts.adapterScript,
        command_surface: DEFAULT_ROUTING_BY_DESTINATION.discordos_alerts.adapterCommand,
      },
      command_plan: {
        alert_summary: buildAlertSummary(sourceReceipt),
        alert_body: buildAlertBody({ intent, sourceReceipt, correlation }),
      },
      reason_codes: [],
    };
  }

  return {
    status: "blocked",
    route: null,
    adapter: null,
    command_plan: null,
    reason_codes: ["unsupported_destination_operation"],
  };
}

function buildReplayFingerprint({
  application,
  projection,
  routeDecision,
  commandPlan,
  reasonCodes,
  sourceCorrelation,
}) {
  return sha256(
    stableStringify(
      {
        application,
        command_plan: commandPlan,
        projection,
        reason_codes: reasonCodes.slice().sort(),
        route_decision: routeDecision,
        source_correlation: {
          digest_value: sourceCorrelation?.digest_value || null,
          event_family: sourceCorrelation?.event_family || null,
          event_id: sourceCorrelation?.event_id || null,
          matched_fact_refs: sourceCorrelation?.matched_fact_refs || [],
          status: sourceCorrelation?.status || "not_required",
        },
      },
      { pretty: false }
    )
  );
}

function extractPriorReceiptMetadata(priorReceipt) {
  const applicationId = priorReceipt?.application?.application_id
    || priorReceipt?.application_id
    || null;
  const replayFingerprint = priorReceipt?.replay_fingerprint || null;
  const status = priorReceipt?.status || null;
  if (typeof applicationId !== "string" || applicationId.length === 0) {
    throw createReasonError(ERROR_CODES.priorReceiptInvalid, ["prior receipt application_id is required"]);
  }
  if (typeof replayFingerprint !== "string" || replayFingerprint.length === 0) {
    throw createReasonError(ERROR_CODES.priorReceiptInvalid, ["prior receipt replay_fingerprint is required"]);
  }
  if (status && !SUPPORTED_STATUSES.has(status)) {
    throw createReasonError(ERROR_CODES.priorReceiptInvalid, ["prior receipt status is not recognized"]);
  }
  return {
    application_id: applicationId,
    replay_fingerprint: replayFingerprint,
    status,
  };
}

function analyzePriorReceipts({
  priorReceipts,
  applicationId,
  replayFingerprint,
}) {
  const matching = [];
  for (const priorReceipt of priorReceipts) {
    const metadata = extractPriorReceiptMetadata(priorReceipt.document);
    if (metadata.application_id === applicationId) {
      matching.push({
        path: priorReceipt.path,
        ...metadata,
      });
    }
  }

  const exact = matching.filter((priorReceipt) => priorReceipt.replay_fingerprint === replayFingerprint);
  const conflicting = matching.filter((priorReceipt) => priorReceipt.replay_fingerprint !== replayFingerprint);

  if (conflicting.length > 0) {
    return {
      status: "blocked",
      exact_match_paths: exact.map((item) => item.path),
      conflicting_paths: conflicting.map((item) => item.path),
      reason_codes: ["prior_receipt_conflict_quarantined"],
    };
  }

  if (exact.length > 0) {
    return {
      status: "suppressed",
      exact_match_paths: exact.map((item) => item.path),
      conflicting_paths: [],
      reason_codes: ["exact_prior_application_receipt_replay_suppressed"],
    };
  }

  return {
    status: "none",
    exact_match_paths: [],
    conflicting_paths: [],
    reason_codes: [],
  };
}

function sanitizeNoSecretLikeContent(value, reasonCode = ERROR_CODES.liveApplyNotAdmitted) {
  const queue = [{ value }];
  while (queue.length > 0) {
    const current = queue.shift().value;
    if (Array.isArray(current)) {
      current.forEach((item) => queue.push({ value: item }));
      continue;
    }
    if (isPlainObject(current)) {
      for (const [key, child] of Object.entries(current)) {
        if (SECRET_KEYS.has(String(key).toLowerCase())) {
          throw createReasonError(reasonCode);
        }
        queue.push({ value: child });
      }
      continue;
    }
    if (typeof current === "string") {
      if (DISCORD_WEBHOOK_PATTERN.test(current)) {
        throw createReasonError(reasonCode);
      }
      if (current.includes("discord.com/api/webhooks")) {
        throw createReasonError(reasonCode);
      }
    }
  }
}

function assertNoForbiddenCliArgs(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const [flagName, inlineValue] = token.split("=", 2);
    if (FORBIDDEN_ARGUMENTS.has(flagName) || FORBIDDEN_FLAG_PATTERN.test(flagName)) {
      throw createReasonError(ERROR_CODES.liveApplyNotAdmitted);
    }
    if (inlineValue) {
      if (DISCORD_WEBHOOK_PATTERN.test(inlineValue) || DISCORD_TOKEN_PATTERN.test(inlineValue)) {
        throw createReasonError(ERROR_CODES.liveApplyNotAdmitted);
      }
    }

    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      continue;
    }
    const normalizedFlagName = flagName.toLowerCase();
    if (
      normalizedFlagName.includes("token")
      || normalizedFlagName.includes("secret")
      || normalizedFlagName.includes("credential")
      || normalizedFlagName.includes("password")
      || normalizedFlagName.includes("webhook")
      || normalizedFlagName.includes("channel-id")
      || normalizedFlagName.includes("message-id")
    ) {
      throw createReasonError(ERROR_CODES.liveApplyNotAdmitted);
    }
    if (
      DISCORD_WEBHOOK_PATTERN.test(nextValue)
      || nextValue.includes("discord.com/api/webhooks")
      || (/channel-id|message-id/i.test(normalizedFlagName) && DISCORD_SNOWFLAKE_PATTERN.test(nextValue))
      || (/token/i.test(normalizedFlagName) && DISCORD_TOKEN_PATTERN.test(nextValue))
    ) {
      throw createReasonError(ERROR_CODES.liveApplyNotAdmitted);
    }
  }
}

function parseArgs(argv) {
  assertNoForbiddenCliArgs(argv);

  const options = {
    intentPath: null,
    sourceReceiptPath: null,
    priorReceiptPaths: [],
    schemaPath: null,
    outputPath: null,
    json: false,
    selfCheck: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--self-check") {
      options.selfCheck = true;
      continue;
    }
    if (token === "--intent") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw createReasonError(ERROR_CODES.usageError, ["--intent requires a path"]);
      }
      options.intentPath = value;
      index += 1;
      continue;
    }
    if (token === "--source-receipt") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw createReasonError(ERROR_CODES.usageError, ["--source-receipt requires a path"]);
      }
      options.sourceReceiptPath = value;
      index += 1;
      continue;
    }
    if (token === "--prior-receipt") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw createReasonError(ERROR_CODES.usageError, ["--prior-receipt requires a path"]);
      }
      options.priorReceiptPaths.push(value);
      index += 1;
      continue;
    }
    if (token === "--schema") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw createReasonError(ERROR_CODES.usageError, ["--schema requires a path"]);
      }
      options.schemaPath = value;
      index += 1;
      continue;
    }
    if (token === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw createReasonError(ERROR_CODES.usageError, ["--output requires a path"]);
      }
      options.outputPath = value;
      index += 1;
      continue;
    }
    throw createReasonError(ERROR_CODES.usageError, [`unsupported argument: ${token}`]);
  }

  if (!options.selfCheck && !options.intentPath) {
    throw createReasonError(ERROR_CODES.intentPathRequired);
  }

  return options;
}

function createErrorResult(reasonCode, errors = []) {
  const result = {
    ok: false,
    reason_code: reasonCode,
  };
  if (errors.length > 0) {
    result.errors = errors;
  }
  return result;
}

function renderMarkdown(receipt) {
  const lines = [
    "# DiscordOS GitHub Projection Intent Consumer",
    "",
    `- result: \`${receipt.ok ? "pass" : "fail"}\``,
    `- status: \`${receipt.status}\``,
    `- application id: \`${receipt.application.application_id}\``,
    `- atlas projection id: \`${receipt.application.atlas_projection_id}\``,
    `- idempotency key: \`${receipt.application.idempotency_key}\``,
    `- atlas decision: \`${receipt.projection.atlas_decision}\``,
    `- destination: \`${receipt.projection.destination}\``,
    `- operation: \`${receipt.projection.operation}\``,
    `- route target envs: \`${receipt.route_decision.target_env.join(",") || "none"}\``,
    `- sends messages: \`${receipt.sends_messages ? "true" : "false"}\``,
    `- writes board: \`${receipt.writes_board ? "true" : "false"}\``,
    `- writes storage: \`${receipt.writes_storage ? "true" : "false"}\``,
    `- external mutation: \`${receipt.external_mutation}\``,
    `- readback state: \`${receipt.readback.state}\``,
    `- reason codes: \`${receipt.reason_codes.join(",") || "none"}\``,
  ];

  if (receipt.command_plan?.title) {
    lines.push(`- planned title: \`${receipt.command_plan.title}\``);
  }
  if (receipt.command_plan?.alert_summary) {
    lines.push(`- planned alert summary: \`${receipt.command_plan.alert_summary}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function readJsonFromPath(filePath, reasonCode, cwd = process.cwd()) {
  const resolvedPath = path.resolve(cwd, filePath);
  try {
    const text = await fsp.readFile(resolvedPath, "utf8");
    return {
      path: resolvedPath,
      document: JSON.parse(text),
    };
  } catch {
    throw createReasonError(reasonCode);
  }
}

function buildBaseReceipt({
  intent,
  application,
  projection,
  schemaResolution,
  sourceCorrelation,
  routeDecision,
  commandPlan,
  replay,
  reasonCodes,
  evidenceRefs,
  ok,
  status,
}) {
  return {
    ok,
    contract_version: CONTRACT_VERSION,
    status,
    application,
    projection,
    schema: buildSchemaReceipt(schemaResolution),
    source_correlation: sourceCorrelation,
    route_decision: routeDecision,
    adapter: routeDecision.adapter,
    command_plan: commandPlan,
    replay,
    sends_messages: false,
    writes_board: false,
    writes_storage: false,
    external_mutation: "denied",
    readback: {
      state: "not_requested",
    },
    reason_codes: [...new Set(reasonCodes)],
    evidence_refs: evidenceRefs,
  };
}

async function buildConsumerReceipt({
  intentPath,
  sourceReceiptPath,
  priorReceiptPaths = [],
  schemaPath = null,
  repoRoot = REPO_ROOT,
  cwd = process.cwd(),
  notificationRouter = notificationRouterInternals,
} = {}) {
  const resolvedAtlasRoot = findAtlasRoot(repoRoot) || findAtlasRoot(path.resolve(cwd));
  const schemaResolution = resolveProjectionIntentSchema({
    schemaPath,
    repoRoot,
    cwd,
    atlasRoot: resolvedAtlasRoot,
  });
  const intentDocument = await readJsonFromPath(intentPath, ERROR_CODES.intentJsonInvalid, cwd);
  sanitizeNoSecretLikeContent(intentDocument.document, ERROR_CODES.liveApplyNotAdmitted);
  validateJsonDocument({
    document: intentDocument.document,
    schema: schemaResolution.schema,
    reasonCode: ERROR_CODES.intentSchemaInvalid,
  });
  const intent = intentDocument.document;

  let sourceReceipt = null;
  let sourceCorrelation = {
    required: isDiscordDestination(intent.destination),
    provided: false,
    status: isDiscordDestination(intent.destination) ? "missing" : "not_required",
    event_id: intent.source_event.event_id,
    event_family: intent.source_event.event_family,
    digest_algorithm: intent.source_event.digest_algorithm,
    digest_value: intent.source_event.digest_value,
    matched_fact_refs: [],
    matched_facts: [],
  };

  if (isDiscordDestination(intent.destination) && !sourceReceiptPath) {
    throw createReasonError(ERROR_CODES.sourceReceiptRequired);
  }

  if (sourceReceiptPath) {
    const sourceSchemaResolution = loadSourceReceiptSchema({
      atlasRoot: resolvedAtlasRoot,
    });
    const sourceReceiptDocument = await readJsonFromPath(
      sourceReceiptPath,
      ERROR_CODES.sourceReceiptJsonInvalid,
      cwd
    );
    sanitizeNoSecretLikeContent(sourceReceiptDocument.document, ERROR_CODES.liveApplyNotAdmitted);
    validateJsonDocument({
      document: sourceReceiptDocument.document,
      schema: sourceSchemaResolution.schema,
      reasonCode: ERROR_CODES.sourceReceiptSchemaInvalid,
    });
    sourceReceipt = sourceReceiptDocument.document;
    sourceCorrelation = correlateIntentWithSourceReceipt(intent, sourceReceipt);
  }

  const application = buildApplicationEnvelope(intent);
  const projection = buildProjectionReceipt(intent);
  const routePlan = await buildRouteAndPlan({
    intent,
    sourceReceipt,
    correlation: sourceCorrelation,
    notificationRouter,
  });

  let status = routePlan.status;
  let ok = status !== "blocked";
  let reasonCodes = [...intent.reason_codes, ...routePlan.reason_codes];
  let commandPlan = routePlan.command_plan;

  if (intent.decision === "suppressed") {
    status = "suppressed";
    ok = true;
    reasonCodes.push("atlas_projection_intent_suppressed");
    commandPlan = null;
  } else if (intent.decision === "blocked") {
    status = "blocked";
    ok = false;
    reasonCodes.push("atlas_projection_intent_blocked");
    commandPlan = null;
  } else if (intent.decision === "requires_review" && status === "planned") {
    status = "requires_review";
  }

  const provisionalRouteDecision = {
    route_id: routePlan.route?.route_id || null,
    notification_source: routePlan.route?.notification_source || null,
    notification_type: routePlan.route?.notification_type || null,
    notification_severity: routePlan.route?.notification_severity || null,
    target: routePlan.route?.target || null,
    target_env: routePlan.route?.target_env || [],
    adapter: routePlan.adapter,
  };
  const replayFingerprint = buildReplayFingerprint({
    application,
    projection,
    routeDecision: provisionalRouteDecision,
    commandPlan,
    reasonCodes,
    sourceCorrelation,
  });

  const priorReceipts = [];
  for (const priorReceiptPath of priorReceiptPaths) {
    const priorReceipt = await readJsonFromPath(
      priorReceiptPath,
      ERROR_CODES.priorReceiptJsonInvalid,
      cwd
    );
    sanitizeNoSecretLikeContent(priorReceipt.document, ERROR_CODES.liveApplyNotAdmitted);
    priorReceipts.push(priorReceipt);
  }

  const replay = analyzePriorReceipts({
    priorReceipts,
    applicationId: application.application_id,
    replayFingerprint,
  });

  if (replay.status === "blocked") {
    status = "blocked";
    ok = false;
    commandPlan = null;
    reasonCodes = [...reasonCodes, ...replay.reason_codes];
  } else if (replay.status === "suppressed") {
    status = "suppressed";
    ok = true;
    commandPlan = null;
    reasonCodes = [...reasonCodes, ...replay.reason_codes];
  }

  const evidenceRefs = buildEvidenceRefs(intent, sourceReceipt, schemaResolution);
  const receipt = buildBaseReceipt({
    intent,
    application,
    projection,
    schemaResolution,
    sourceCorrelation,
    routeDecision: provisionalRouteDecision,
    commandPlan,
    replay: {
      ...replay,
      replay_fingerprint: replayFingerprint,
    },
    reasonCodes,
    evidenceRefs,
    ok,
    status,
  });

  receipt.replay_fingerprint = replayFingerprint;
  return receipt;
}

function createSelfCheckResult({
  repoRoot = REPO_ROOT,
  cwd = process.cwd(),
} = {}) {
  const resolvedAtlasRoot = findAtlasRoot(repoRoot) || findAtlasRoot(path.resolve(cwd));
  const schemaResolution = resolveProjectionIntentSchema({
    repoRoot,
    cwd,
    atlasRoot: resolvedAtlasRoot,
  });

  return {
    ok: true,
    contract_version: SELF_CHECK_VERSION,
    receipt_contract_version: CONTRACT_VERSION,
    projection_intent_contract_version: PROJECTION_INTENT_CONTRACT_VERSION,
    atlas_contract_commit: ACCEPTED_ATLAS_CONTRACT_COMMIT,
    canonical_schema_digest: `sha256:${ACCEPTED_CANONICAL_SCHEMA_SHA256}`,
    schema_resolution: {
      selected_source: schemaResolution.source,
      selected_schema_reference: schemaResolution.schema_reference,
      mirror_status: schemaResolution.mirror_status,
    },
    route_mappings: {
      release_updates_route: DEFAULT_ROUTE_IDENTITIES.update,
      security_alerts_route: DEFAULT_ROUTE_IDENTITIES.alert,
    },
    guarantees: {
      sends_messages: false,
      writes_board: false,
      writes_storage: false,
      external_mutation: "denied",
      readback: "not_requested",
    },
  };
}

async function writeOutput(text, outputPath, cwd = process.cwd()) {
  const resolvedOutputPath = path.resolve(cwd, outputPath);
  try {
    await fsp.writeFile(resolvedOutputPath, text, "utf8");
  } catch {
    throw createReasonError(ERROR_CODES.outputWriteFailed);
  }
}

async function runCli(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);

    const receipt = options.selfCheck
      ? createSelfCheckResult({ cwd: process.cwd() })
      : await buildConsumerReceipt({
          intentPath: options.intentPath,
          sourceReceiptPath: options.sourceReceiptPath,
          priorReceiptPaths: options.priorReceiptPaths,
          schemaPath: options.schemaPath,
          cwd: process.cwd(),
        });

    const jsonOutput = stableStringify(receipt);
    if (options.outputPath) {
      await writeOutput(jsonOutput, options.outputPath, process.cwd());
    }
    process.stdout.write(options.json || options.selfCheck ? jsonOutput : renderMarkdown(receipt));
    return receipt.ok ? 0 : 1;
  } catch (error) {
    const reasonCode = error?.reasonCode || ERROR_CODES.intentSchemaInvalid;
    const errors = Array.isArray(error?.errors) ? error.errors : [];
    const payload = stableStringify(
      createErrorResult(
        reasonCode,
        reasonCode === ERROR_CODES.liveApplyNotAdmitted ? [] : errors
      )
    );
    process.stdout.write(payload);
    return 1;
  }
}

if (require.main === module) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  _internals: {
    REPO_ROOT,
    CONTRACT_VERSION,
    SELF_CHECK_VERSION,
    PROJECTION_INTENT_CONTRACT_VERSION,
    SOURCE_RECEIPT_CONTRACT_VERSION,
    ACCEPTED_ATLAS_CONTRACT_COMMIT,
    ACCEPTED_CANONICAL_SCHEMA_SHA256,
    CANONICAL_SCHEMA_RELATIVE_PATH,
    SOURCE_RECEIPT_SCHEMA_RELATIVE_PATH,
    MIRROR_SCHEMA_RELATIVE_PATH,
    MIRROR_PROVENANCE_RELATIVE_PATH,
    SCHEMA_SOURCE,
    DEFAULT_ROUTE_IDENTITIES,
    DEFAULT_ROUTING_BY_DESTINATION,
    ERROR_CODES,
    toCanonicalValue,
    stableStringify,
    sha256,
    validateAgainstSchema,
    findAtlasRoot,
    assertCompatibleProjectionSchema,
    assertCompatibleSourceReceiptSchema,
    inspectMirrorStatus,
    resolveProjectionIntentSchema,
    loadSourceReceiptSchema,
    validateJsonDocument,
    normalizeText,
    correlateIntentWithSourceReceipt,
    isDiscordDestination,
    deriveApplicationIdentity,
    buildApplicationEnvelope,
    buildEvidenceRefs,
    buildSchemaReceipt,
    buildProjectionReceipt,
    buildUpdateTitle,
    buildUpdateBody,
    buildAlertSummary,
    buildAlertBody,
    buildRouteAndPlan,
    buildReplayFingerprint,
    extractPriorReceiptMetadata,
    analyzePriorReceipts,
    sanitizeNoSecretLikeContent,
    assertNoForbiddenCliArgs,
    parseArgs,
    createErrorResult,
    renderMarkdown,
    readJsonFromPath,
    buildBaseReceipt,
    buildConsumerReceipt,
    createSelfCheckResult,
    runCli,
  },
};
