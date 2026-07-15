import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import lifecycleSyncModule from "./discordos-board-lifecycle-sync.js";

const { _internals: lifecycleSyncInternals } = lifecycleSyncModule;

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_CONTRACTS_ROOT = path.resolve(
  REPO_ROOT,
  "..",
  "..",
  "packages",
  "atlas-contracts",
);
export const RECEIPT_CONTRACT_VERSION =
  "discordos.atlas-card-board-consumer-receipt.v1";
export const CARD_SCHEMA_ID = "atlas.card-record.v2";
export const EVENT_SCHEMA_ID = "atlas.board-event.v2";

const READBACK_STATUSES = new Set([
  "applied",
  "duplicate",
  "conflict",
  "failed",
  "verified",
]);
const FORBIDDEN_MUTATION_FLAG =
  /(?:^|[-_])(?:apply|live|mutate|mutation|write|storage|discord|deploy|deployment|production|prod|send|publish)(?:$|[-_])/i;
const AUTHORITY_KEY_PATTERN =
  /writer|authority|production|deploy|apply|mutation|storage.*write|discord.*write|external.*write/i;
const AUTHORITY_VALUE_PATTERN =
  /\b(?:production|deploy(?:ment)?|live[-_ ]?apply|authorized|allowed|enabled|granted|second[-_ ]?writer)\b/i;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const LIFECYCLE_STATE_MAP = Object.freeze({
  intake: "opened",
  planning: "opened",
  ready: "opened",
  "in-progress": "in_progress",
  review: "in_progress",
  completed: "completed",
  archived: "closed",
  blocked: "blocked",
});

export class AtlasCardBoardConsumerError extends Error {
  constructor(reasonCode, errors = []) {
    super(reasonCode);
    this.name = "AtlasCardBoardConsumerError";
    this.reasonCode = reasonCode;
    this.errors = [...new Set(errors)].sort();
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function stableStringify(value, { pretty = true } = {}) {
  return `${JSON.stringify(canonicalize(value), null, pretty ? 2 : 0)}\n`;
}

export function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new AtlasCardBoardConsumerError("usage_error", [`${flag} requires a path`]);
  }
  return value;
}

export function assertNoMutationArguments(argv) {
  for (const token of argv) {
    if (token.startsWith("--") && FORBIDDEN_MUTATION_FLAG.test(token.split("=", 1)[0])) {
      throw new AtlasCardBoardConsumerError("mutation_not_admitted");
    }
  }
}

export function parseArgs(argv) {
  assertNoMutationArguments(argv);
  const options = {
    cardPath: null,
    eventPath: null,
    contractsRoot: null,
    dryRun: true,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--dry-run") {
      continue;
    }
    if (token === "--card") {
      options.cardPath = readValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--event") {
      options.eventPath = readValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--contracts-root") {
      options.contractsRoot = readValue(argv, index, token);
      index += 1;
      continue;
    }
    throw new AtlasCardBoardConsumerError("usage_error", [
      `unsupported argument: ${token}`,
    ]);
  }

  if (!options.cardPath || !options.eventPath) {
    throw new AtlasCardBoardConsumerError("usage_error", [
      "--card and --event are required",
    ]);
  }
  return options;
}

async function readJsonArtifact(inputPath, label, cwd) {
  let bytes;
  try {
    bytes = await fs.readFile(path.resolve(cwd, inputPath));
  } catch {
    throw new AtlasCardBoardConsumerError(`${label}_input_unreadable`);
  }

  let document;
  try {
    document = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new AtlasCardBoardConsumerError(`${label}_json_invalid`);
  }
  return { document, digest: sha256(bytes) };
}

function portableSchemaReference(schemaId) {
  return `packages/atlas-contracts/schemas/${schemaId}.schema.json`;
}

export async function loadAtlasContracts({ contractsRoot = null, cwd = process.cwd() } = {}) {
  const resolution = contractsRoot ? "explicit_override" : "atlas_layout_default";
  const root = contractsRoot
    ? path.resolve(cwd, contractsRoot)
    : DEFAULT_CONTRACTS_ROOT;

  let packageMetadata;
  try {
    packageMetadata = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  } catch {
    throw new AtlasCardBoardConsumerError("atlas_contracts_package_unavailable");
  }
  if (packageMetadata.name !== "@atlas/contracts") {
    throw new AtlasCardBoardConsumerError("atlas_contracts_package_invalid");
  }

  try {
    const validator = await import(
      pathToFileURL(path.join(root, "scripts", "lib", "validate-json-schema.mjs")).href
    );
    const semantics = await import(
      pathToFileURL(path.join(root, "scripts", "lib", "validate-semantics.mjs")).href
    );
    return {
      root,
      resolution,
      packageVersion: packageMetadata.version,
      loadKnownSchema: validator.loadKnownSchema,
      validateJsonSchema: validator.validateJsonSchema,
      validateContractSemantics: semantics.validateContractSemantics,
    };
  } catch {
    throw new AtlasCardBoardConsumerError("atlas_contracts_validator_unavailable");
  }
}

async function validateCanonicalArtifact(contracts, artifact, schemaId, label) {
  const loadedSchema = await contracts.loadKnownSchema(schemaId);
  if (!loadedSchema.ok) {
    throw new AtlasCardBoardConsumerError(`${label}_schema_unavailable`, [
      loadedSchema.code || "unknown_schema_error",
    ]);
  }

  const errors = [
    ...contracts.validateJsonSchema(artifact, loadedSchema.schema),
    ...contracts.validateContractSemantics(schemaId, artifact),
  ];
  if (errors.length > 0) {
    throw new AtlasCardBoardConsumerError(`${label}_schema_invalid`, errors);
  }

  const relativeSchemaPath = path.relative(contracts.root, loadedSchema.path);
  if (
    !relativeSchemaPath
    || relativeSchemaPath.startsWith("..")
    || path.isAbsolute(relativeSchemaPath)
  ) {
    throw new AtlasCardBoardConsumerError(`${label}_schema_source_invalid`);
  }

  return {
    schema_id: schemaId,
    schema_reference: portableSchemaReference(schemaId),
    schema_digest: sha256(await fs.readFile(loadedSchema.path)),
    status: "valid",
  };
}

function isStableIdentifier(value) {
  return (
    typeof value === "string"
    && value === value.trim()
    && STABLE_ID_PATTERN.test(value)
  );
}

export function deriveExpectedBoardEventIdentity(event) {
  const identity = {
    job_id: event.job_id,
    card_id: event.card_id,
    board_id: event.board_id,
    expected_version: event.expected_version,
    from: event.intent.from,
    to: event.intent.to,
    reason: event.intent.reason,
  };
  const idempotencyKey = `abk_${crypto
    .createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex")
    .slice(0, 32)}`;
  const eventId = `abe_${crypto
    .createHash("sha256")
    .update(
      `${idempotencyKey}\n${event.event_type}\n${event.result.status}\n${event.occurred_at}`,
    )
    .digest("hex")
    .slice(0, 32)}`;
  return { eventId, idempotencyKey };
}

function collectAuthorityDrift(value, atPath = "extensions", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectAuthorityDrift(child, `${atPath}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && AUTHORITY_VALUE_PATTERN.test(value)) {
      findings.push(`${atPath}:authority_grant_value`);
    }
    return findings;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${atPath}.${key}`;
    if (atPath === "extensions" && ["writer_authority", "external_mutation"].includes(key)) {
      continue;
    }
    if (AUTHORITY_KEY_PATTERN.test(key)) {
      findings.push(`${childPath}:authority_key`);
      continue;
    }
    collectAuthorityDrift(child, childPath, findings);
  }
  return findings;
}

function validateResultSemantics(event) {
  const result = event.result;
  const errors = [];
  if (result.status === "pending") {
    if (
      result.observed_version !== null
      || result.readback_at !== null
      || result.receipt_ref !== null
      || (result.error_code ?? null) !== null
    ) {
      errors.push("pending_result_claims_readback_or_error");
    }
  } else if (READBACK_STATUSES.has(result.status)) {
    if (
      !Number.isInteger(result.observed_version)
      || !result.readback_at
      || !result.receipt_ref
    ) {
      errors.push("observed_result_missing_readback_fields");
    }
    if (["conflict", "failed"].includes(result.status) && !result.error_code) {
      errors.push("failed_result_missing_error_code");
    }
  } else {
    errors.push("unsupported_result_status");
  }
  return errors;
}

export function validateDiscordOsSemantics(card, event) {
  const errors = [];
  if (event.card_id !== card.card_id) errors.push("card_id_mismatch");
  if (event.board_id !== card.board_id) errors.push("board_id_mismatch");
  if (event.expected_version !== card.board_version) errors.push("expected_version_mismatch");
  if (event.intent.from !== card.lifecycle) errors.push("from_state_mismatch");
  if (event.intent.to === null) errors.push("intent_to_missing");
  if (event.extensions?.writer_authority !== "discordos") {
    errors.push("writer_authority_mismatch");
  }
  if (!isStableIdentifier(event.event_id) || !isStableIdentifier(event.idempotency_key)) {
    errors.push("event_identity_unstable");
  }
  if (event.event_id === event.idempotency_key) errors.push("event_identity_collision");
  const expectedIdentity = deriveExpectedBoardEventIdentity(event);
  if (event.idempotency_key !== expectedIdentity.idempotencyKey) {
    errors.push("event_idempotency_key_unstable");
  }
  if (event.event_id !== expectedIdentity.eventId) {
    errors.push("event_id_unstable");
  }

  errors.push(...validateResultSemantics(event));
  const expectedExternalMutation = event.result.status === "pending"
    ? "not_performed"
    : "observed_only";
  if (event.extensions?.external_mutation !== expectedExternalMutation) {
    errors.push("external_mutation_semantics_invalid");
  }
  if (collectAuthorityDrift(event.extensions).length > 0) {
    errors.push("authority_drift_detected");
  }

  return [...new Set(errors)].sort();
}

function mapCardKind(cardType) {
  if (cardType === "feature" || cardType === "bug") return cardType;
  return "ops";
}

async function buildLifecycleDryRun(card, event) {
  const mappedState = LIFECYCLE_STATE_MAP[event.intent.to];
  if (!mappedState) {
    throw new AtlasCardBoardConsumerError("intent_to_not_mappable");
  }

  const lifecycle = await lifecycleSyncInternals.buildBoardLifecycleSync({
    workflow: card.board_id,
    cardId: card.card_id,
    kind: mapCardKind(card.card_type),
    state: mappedState,
    actor: "atlas-board-event-consumer",
    note: event.intent.reason,
    applyStorage: false,
    env: {},
    fetchImpl: async () => {
      throw new AtlasCardBoardConsumerError("external_call_attempted");
    },
  });

  if (!lifecycle.ok) {
    throw new AtlasCardBoardConsumerError(
      "lifecycle_dry_run_blocked",
      lifecycle.reasonCodes,
    );
  }
  if (
    lifecycle.storageApplied
    || lifecycle.sendsMessages
    || lifecycle.writesArtifacts
    || lifecycle.boardWriter.storageWritesAllowed
    || lifecycle.boardWriter.liveBehaviorAllowed
  ) {
    throw new AtlasCardBoardConsumerError("lifecycle_authority_drift_detected");
  }
  return lifecycle;
}

export async function buildConsumerReceipt({
  cardPath,
  eventPath,
  contractsRoot = null,
  cwd = process.cwd(),
} = {}) {
  if (!cardPath || !eventPath) {
    throw new AtlasCardBoardConsumerError("usage_error", [
      "cardPath and eventPath are required",
    ]);
  }

  const contracts = await loadAtlasContracts({ contractsRoot, cwd });
  const [cardInput, eventInput] = await Promise.all([
    readJsonArtifact(cardPath, "card", cwd),
    readJsonArtifact(eventPath, "event", cwd),
  ]);
  const [cardSchema, eventSchema] = await Promise.all([
    validateCanonicalArtifact(
      contracts,
      cardInput.document,
      CARD_SCHEMA_ID,
      "card",
    ),
    validateCanonicalArtifact(
      contracts,
      eventInput.document,
      EVENT_SCHEMA_ID,
      "event",
    ),
  ]);

  const card = cardInput.document;
  const event = eventInput.document;
  const semanticErrors = validateDiscordOsSemantics(card, event);
  if (semanticErrors.length > 0) {
    throw new AtlasCardBoardConsumerError("discordos_semantic_rejection", semanticErrors);
  }

  const lifecycle = await buildLifecycleDryRun(card, event);
  const eventIdentityDigest = sha256(stableStringify({
    board_id: event.board_id,
    card_id: event.card_id,
    event_id: event.event_id,
    event_type: event.event_type,
    expected_version: event.expected_version,
    idempotency_key: event.idempotency_key,
    intent: event.intent,
    occurred_at: event.occurred_at,
    result: event.result,
  }, { pretty: false }));
  const cardIdentityDigest = sha256(stableStringify({
    board_id: card.board_id,
    board_version: card.board_version,
    card_id: card.card_id,
    lifecycle: card.lifecycle,
    project_id: card.project_id,
  }, { pretty: false }));

  const receiptCore = {
    ok: true,
    contract_version: RECEIPT_CONTRACT_VERSION,
    status: "admitted_dry_run",
    card_record: {
      board_id: card.board_id,
      board_version: card.board_version,
      card_id: card.card_id,
      contract_version: card.contract_version,
      identity_digest: cardIdentityDigest,
      lifecycle: card.lifecycle,
      project_id: card.project_id,
    },
    board_event: {
      contract_version: event.contract_version,
      event_id: event.event_id,
      event_type: event.event_type,
      idempotency_key: event.idempotency_key,
      identity_digest: eventIdentityDigest,
      result_status: event.result.status,
    },
    canonical_schema_validation: {
      card_record: cardSchema,
      board_event: eventSchema,
    },
    schema_source: {
      package_name: "@atlas/contracts",
      package_version: contracts.packageVersion,
      resolution: contracts.resolution,
      validator_reference: "packages/atlas-contracts/scripts/lib/validate-json-schema.mjs",
      semantic_validator_reference:
        "packages/atlas-contracts/scripts/lib/validate-semantics.mjs",
    },
    input_digests: {
      board_event: eventInput.digest,
      card_record: cardInput.digest,
    },
    semantic_consumption: {
      card_id_matches: true,
      board_id_matches: true,
      expected_version_matches: true,
      from_state_matches: true,
      event_identity_stable: true,
      result_semantics_valid: true,
      intent_from: event.intent.from,
      intent_to: event.intent.to,
      mapped_lifecycle: LIFECYCLE_STATE_MAP[event.intent.to],
      lifecycle_sync: {
        adapter_status: lifecycle.boardWriter.adapterStatus,
        card_id: lifecycle.sync.cardId,
        state: lifecycle.sync.state,
        status: lifecycle.status,
        workflow: lifecycle.sync.workflow,
      },
    },
    writer_boundary: {
      authority_drift: false,
      external_mutation: false,
      live_behavior_allowed: false,
      messages_sent: false,
      sole_logical_writer: true,
      storage_applied: false,
      storage_writes_allowed: false,
      writer_authority: "discordos",
    },
  };
  return {
    ...receiptCore,
    receipt_id: `dacbcr_${sha256(stableStringify(receiptCore, { pretty: false }))
      .slice("sha256:".length, "sha256:".length + 32)}`,
  };
}

export function createErrorReceipt(error) {
  const reasonCode = error?.reasonCode || "consumer_failure";
  const receipt = {
    ok: false,
    contract_version: RECEIPT_CONTRACT_VERSION,
    status: "blocked",
    reason_code: reasonCode,
    external_mutation: false,
    authority_drift: false,
  };
  if (reasonCode !== "mutation_not_admitted" && error?.errors?.length > 0) {
    receipt.errors = error.errors;
  }
  return receipt;
}

export function renderMarkdown(receipt) {
  return [
    "# DiscordOS Atlas Card + Board Consumer",
    "",
    `- result: \`${receipt.ok ? "pass" : "fail"}\``,
    `- status: \`${receipt.status}\``,
    `- receipt id: \`${receipt.receipt_id || "none"}\``,
    `- card id: \`${receipt.card_record?.card_id || "unknown"}\``,
    `- event id: \`${receipt.board_event?.event_id || "unknown"}\``,
    `- mapped lifecycle: \`${receipt.semantic_consumption?.mapped_lifecycle || "none"}\``,
    `- writer authority: \`${receipt.writer_boundary?.writer_authority || "none"}\``,
    `- external mutation: \`${receipt.writer_boundary?.external_mutation ? "true" : "false"}\``,
    "",
  ].join("\n");
}

export async function runCli(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
    const receipt = await buildConsumerReceipt({
      cardPath: options.cardPath,
      eventPath: options.eventPath,
      contractsRoot: options.contractsRoot,
      cwd: process.cwd(),
    });
    process.stdout.write(options.json ? stableStringify(receipt) : renderMarkdown(receipt));
    return 0;
  } catch (error) {
    process.stdout.write(stableStringify(createErrorReceipt(error)));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
