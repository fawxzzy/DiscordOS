const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { _internals: consumer } = require("./discordos-github-projection-intent-consumer");
const { _internals: updateWriter } = require("./discord-update-post");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTRACT_VERSION = "discordos.github.projection-application.receipt.v1";
const SELF_CHECK_VERSION = "discordos.github.projection-application.self-check.v1";
const APPROVAL_CONTRACT_VERSION = "atlas.approval-record.v2";
const ATLAS_OWNER_COMMIT = "d718d14c5f23a08c402e9bd821db6526f541034a";
const APPROVAL_SCHEMA_SHA256 = "e882aae2ceb6ea65cc7a208f036e95ddc209c203f0b4b830372b8b2b35e954a2";
const APPROVAL_SCHEMA_RELATIVE_PATH = path.join("packages", "atlas-contracts", "schemas", "atlas.approval-record.v2.schema.json");
const MIRROR_SCHEMA_RELATIVE_PATH = path.join("src", "contracts", "atlas.approval-record.v2.schema.json");
const MIRROR_PROVENANCE_RELATIVE_PATH = path.join("src", "contracts", "atlas.approval-record.provenance.v2.json");
const REQUIRED_CONSTRAINTS = Object.freeze(["single-writer", "exact-readback", "no-mentions"]);
const FORBIDDEN_ARGUMENT_PATTERN = /(?:token|secret|credential|password|webhook|channel-id|message-id|bot)/i;

const ERROR_CODES = Object.freeze({
  usage: "discordos_github_projection_application_usage_error",
  input: "application_input_invalid",
  dryRunInvalid: "dry_run_receipt_invalid",
  dryRunMismatch: "dry_run_receipt_rebuild_mismatch",
  approvalInvalid: "approval_schema_invalid",
  approvalSchemaMissing: "approval_schema_missing",
  approvalSchemaDigestMismatch: "approval_schema_digest_mismatch",
  approvalMirrorInvalid: "approval_mirror_provenance_invalid",
  approvalDenied: "approval_not_exactly_authorized",
  approvalExpired: "approval_expired",
  approvalConstraintMissing: "approval_constraint_missing",
  priorInvalid: "prior_application_receipt_invalid",
  priorConflict: "prior_application_receipt_conflict_quarantined",
  reconciliationRequired: "prior_sent_but_unverified_requires_reconciliation",
  output: "application_output_write_failed",
});

function reasonError(reasonCode, errors = []) {
  const error = new Error(reasonCode);
  error.reasonCode = reasonCode;
  error.errors = errors;
  return error;
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value), "utf8").digest("hex")}`;
}

function pathExists(filePath) {
  try { return fs.statSync(filePath).isFile(); } catch { return false; }
}

function readText(filePath, reasonCode) {
  try { return fs.readFileSync(filePath, "utf8"); } catch { throw reasonError(reasonCode); }
}

function readJson(filePath, reasonCode) {
  try { return JSON.parse(readText(filePath, reasonCode)); } catch (error) {
    if (error?.reasonCode) throw error;
    throw reasonError(reasonCode);
  }
}

function findAtlasRoot(startDir = REPO_ROOT) {
  let current = path.resolve(startDir);
  while (true) {
    if (pathExists(path.join(current, APPROVAL_SCHEMA_RELATIVE_PATH))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function expectedProvenance() {
  return {
    contract_id: APPROVAL_CONTRACT_VERSION,
    contract_version: "v2",
    atlas_owner_repository: "ATLAS",
    atlas_owner_ref: "root-commit",
    atlas_owner_commit: ATLAS_OWNER_COMMIT,
    canonical_schema_path: APPROVAL_SCHEMA_RELATIVE_PATH.replaceAll("\\", "/"),
    canonical_sha256: APPROVAL_SCHEMA_SHA256,
    mirror_path: MIRROR_SCHEMA_RELATIVE_PATH.replaceAll("\\", "/"),
    mirror_sha256: APPROVAL_SCHEMA_SHA256,
    fallback_scope: "isolated_discordos_ci_only",
    fallback_statement: "Mirror fallback is for isolated DiscordOS CI only.",
  };
}

function assertApprovalSchema(schema) {
  if (schema?.properties?.contract_version?.const !== APPROVAL_CONTRACT_VERSION
    || schema?.properties?.action?.$ref !== "#/$defs/action") {
    throw reasonError(ERROR_CODES.approvalInvalid);
  }
}

function resolveApprovalSchema({ schemaPath = null, repoRoot = REPO_ROOT, cwd = process.cwd() } = {}) {
  const atlasRoot = findAtlasRoot(repoRoot) || findAtlasRoot(cwd);
  const mirrorPath = path.join(repoRoot, MIRROR_SCHEMA_RELATIVE_PATH);
  const provenancePath = path.join(repoRoot, MIRROR_PROVENANCE_RELATIVE_PATH);
  const load = (filePath, source, reference) => {
    const raw = readText(filePath, ERROR_CODES.approvalSchemaMissing);
    if (sha256(raw) !== `sha256:${APPROVAL_SCHEMA_SHA256}`) throw reasonError(ERROR_CODES.approvalSchemaDigestMismatch);
    const schema = JSON.parse(raw);
    assertApprovalSchema(schema);
    return { source, schema, digest: sha256(raw), schema_reference: reference };
  };
  if (schemaPath) {
    return load(path.resolve(cwd, schemaPath), "explicit", schemaPath.replaceAll("\\", "/"));
  }
  if (atlasRoot) {
    return load(path.join(atlasRoot, APPROVAL_SCHEMA_RELATIVE_PATH), "atlas_sibling_canonical", APPROVAL_SCHEMA_RELATIVE_PATH.replaceAll("\\", "/"));
  }
  if (!pathExists(mirrorPath) || !pathExists(provenancePath)) throw reasonError(ERROR_CODES.approvalSchemaMissing);
  const provenance = readJson(provenancePath, ERROR_CODES.approvalMirrorInvalid);
  if (!Object.entries(expectedProvenance()).every(([key, value]) => provenance?.[key] === value)) {
    throw reasonError(ERROR_CODES.approvalMirrorInvalid);
  }
  return load(mirrorPath, "repo_local_mirror", MIRROR_SCHEMA_RELATIVE_PATH.replaceAll("\\", "/"));
}

function validateApproval({ approval, schemaResolution, now = new Date() }) {
  consumer.validateAgainstSchema(schemaResolution.schema, schemaResolution.schema, approval).length
    && (() => { throw reasonError(ERROR_CODES.approvalInvalid); })();
  if (approval.decision !== "approved"
    || approval.action?.kind !== "external-mutation"
    || approval.action?.target !== "discordos:updates") {
    throw reasonError(ERROR_CODES.approvalDenied);
  }
  if (!approval.expires_at || Number.isNaN(Date.parse(approval.expires_at)) || Date.parse(approval.expires_at) <= now.getTime()) {
    throw reasonError(ERROR_CODES.approvalExpired);
  }
  if (!Array.isArray(approval.constraints) || !REQUIRED_CONSTRAINTS.every((constraint) => approval.constraints.includes(constraint))) {
    throw reasonError(ERROR_CODES.approvalConstraintMissing);
  }
}

function deriveApplicationReceiptIdentity(application, approval) {
  const material = `${application.application_id}\n${application.idempotency_key}\n${approval.approval_id}`;
  const digest = crypto.createHash("sha256").update(material, "utf8").digest("hex");
  return {
    application_receipt_id: `dpa_${digest.slice(0, 32)}`,
    idempotency_key: `dpak_${digest}`,
  };
}

function parseArgs(argv) {
  const options = { intentPath: null, sourceReceiptPath: null, dryRunReceiptPath: null, approvalPath: null, priorReceiptPaths: [], approvalSchemaPath: null, outputPath: null, apply: false, json: false, selfCheck: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") { options.json = true; continue; }
    if (token === "--self-check") { options.selfCheck = true; continue; }
    if (token === "--apply") { options.apply = true; continue; }
    if (FORBIDDEN_ARGUMENT_PATTERN.test(token)) throw reasonError(ERROR_CODES.usage);
    const mapping = { "--intent": "intentPath", "--source-receipt": "sourceReceiptPath", "--dry-run-receipt": "dryRunReceiptPath", "--approval": "approvalPath", "--prior-application-receipt": "priorReceiptPaths", "--approval-schema": "approvalSchemaPath", "--output": "outputPath" };
    const key = mapping[token];
    if (!key) throw reasonError(ERROR_CODES.usage);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw reasonError(ERROR_CODES.usage);
    if (key === "priorReceiptPaths") options[key].push(value); else options[key] = value;
    index += 1;
  }
  if (!options.selfCheck && [options.intentPath, options.sourceReceiptPath, options.dryRunReceiptPath, options.approvalPath].some((value) => !value)) throw reasonError(ERROR_CODES.usage);
  return options;
}

async function readJsonFromPath(filePath, reasonCode, cwd) {
  try { return { path: path.resolve(cwd, filePath), document: JSON.parse(await fsp.readFile(path.resolve(cwd, filePath), "utf8")) }; } catch { throw reasonError(reasonCode); }
}

function validateDryRunAgreement({ received, rebuilt }) {
  if (received?.contract_version !== consumer.CONTRACT_VERSION || consumer.stableStringify(received) !== consumer.stableStringify(rebuilt)) {
    throw reasonError(ERROR_CODES.dryRunMismatch);
  }
  if (rebuilt.status !== "requires_review" || rebuilt.projection?.destination !== "discordos_update" || rebuilt.projection?.operation !== "publish" || !rebuilt.command_plan?.title || !rebuilt.command_plan?.body) {
    throw reasonError(ERROR_CODES.dryRunInvalid);
  }
}

function analyzePriorApplicationReceipts({ priorReceipts, identity, application, approval, planFingerprint }) {
  const matching = [];
  for (const prior of priorReceipts) {
    const receipt = prior.document;
    if (receipt?.contract_version !== CONTRACT_VERSION || !receipt.application_receipt?.application_receipt_id || !receipt.application?.application_id || !receipt.approval?.approval_id || !receipt.plan_fingerprint) {
      throw reasonError(ERROR_CODES.priorInvalid);
    }
    if (receipt.application.application_id !== application.application_id) continue;
    const exact = receipt.application_receipt.application_receipt_id === identity.application_receipt_id
      && receipt.approval.approval_id === approval.approval_id && receipt.plan_fingerprint === planFingerprint;
    matching.push({ path: prior.path, receipt, exact });
  }
  const conflicts = matching.filter(({ exact }) => !exact);
  if (conflicts.length) return { state: "quarantined", reason_codes: [ERROR_CODES.priorConflict], exact_match_paths: [], conflicting_paths: conflicts.map(({ path }) => path) };
  const unverified = matching.filter(({ exact, receipt }) => exact && receipt.status === "sent_but_unverified");
  if (unverified.length) return { state: "reconciliation_required", reason_codes: [ERROR_CODES.reconciliationRequired], exact_match_paths: unverified.map(({ path }) => path), conflicting_paths: [] };
  const succeeded = matching.filter(({ exact, receipt }) => exact && receipt.status === "sent_verified");
  if (succeeded.length) return { state: "suppressed", reason_codes: ["exact_prior_successful_application_replay_suppressed"], exact_match_paths: succeeded.map(({ path }) => path), conflicting_paths: [] };
  return { state: "none", reason_codes: [], exact_match_paths: [], conflicting_paths: [] };
}

function notRequestedReadback() { return { requested: false, status: "not_requested", exactMatch: null, reasonCodes: ["readback_not_requested"] }; }

function buildReceipt({ rebuilt, approval, approvalSchema, identity, planFingerprint, replay, writerResult = null, apply }) {
  const sent = Boolean(writerResult?.sendsMessages);
  const verified = writerResult?.status === "sent" && writerResult?.readback?.ok === true;
  const blocked = replay.state === "quarantined" || replay.state === "reconciliation_required";
  const suppressed = replay.state === "suppressed";
  const status = blocked ? "blocked" : suppressed ? "suppressed" : !apply ? "ready" : verified ? "sent_verified" : sent ? "sent_but_unverified" : "blocked";
  return {
    ok: status === "ready" || status === "suppressed" || status === "sent_verified",
    contract_version: CONTRACT_VERSION,
    status,
    application_receipt: identity,
    application: rebuilt.application,
    projection: rebuilt.projection,
    source_correlation: rebuilt.source_correlation,
    dry_run: { receipt_contract_version: rebuilt.contract_version, fingerprint: sha256(consumer.stableStringify(rebuilt)), status: rebuilt.status },
    approval: { approval_id: approval.approval_id, job_id: approval.job_id, actor: approval.actor, target: approval.action.target, scope: approval.action.scope, decision: approval.decision, expires_at: approval.expires_at, constraints: approval.constraints.slice() },
    approval_schema: { source: approvalSchema.source, schema_reference: approvalSchema.schema_reference, digest: approvalSchema.digest, atlas_owner_commit: ATLAS_OWNER_COMMIT },
    writer_surface: "scripts/discord-update-post.js",
    route_decision: rebuilt.route_decision,
    command_plan: rebuilt.command_plan,
    plan_fingerprint: planFingerprint,
    mode: apply ? "apply" : "readiness",
    sends_messages: sent,
    writes_board: false,
    writes_storage: false,
    post: writerResult ? { ok: writerResult.status === "sent", httpStatus: writerResult.httpStatus || null, messageId: writerResult.messageId || null, channelId: writerResult.channelId || null, timestamp: writerResult.timestamp || null } : null,
    readback: writerResult?.readback || notRequestedReadback(),
    replay,
    reason_codes: [...new Set([...(rebuilt.reason_codes || []), ...replay.reason_codes, ...(writerResult?.reasonCodes || []), ...(apply ? [] : ["apply_flag_not_set"])])],
    evidence_refs: [...new Set([...(rebuilt.evidence_refs || []), approvalSchema.schema_reference, MIRROR_PROVENANCE_RELATIVE_PATH.replaceAll("\\", "/")])].sort(),
  };
}

async function buildApplicationReceipt({ intentPath, sourceReceiptPath, dryRunReceiptPath, approvalPath, priorReceiptPaths = [], approvalSchemaPath = null, apply = false, cwd = process.cwd(), repoRoot = REPO_ROOT, now = new Date(), writer = updateWriter } = {}) {
  const rebuilt = await consumer.buildConsumerReceipt({ intentPath, sourceReceiptPath, cwd, repoRoot });
  const receivedDryRun = await readJsonFromPath(dryRunReceiptPath, ERROR_CODES.dryRunInvalid, cwd);
  consumer.sanitizeNoSecretLikeContent(receivedDryRun.document, ERROR_CODES.input);
  validateDryRunAgreement({ received: receivedDryRun.document, rebuilt });
  const approvalDocument = await readJsonFromPath(approvalPath, ERROR_CODES.input, cwd);
  consumer.sanitizeNoSecretLikeContent(approvalDocument.document, ERROR_CODES.input);
  const approvalSchema = resolveApprovalSchema({ schemaPath: approvalSchemaPath, repoRoot, cwd });
  validateApproval({ approval: approvalDocument.document, schemaResolution: approvalSchema, now });
  const approval = approvalDocument.document;
  if (approval.action.scope !== `publish_projection:${rebuilt.projection.projection_id}`) throw reasonError(ERROR_CODES.approvalDenied);
  const identity = deriveApplicationReceiptIdentity(rebuilt.application, approval);
  const planFingerprint = sha256(consumer.stableStringify({ projection: rebuilt.projection, route_decision: rebuilt.route_decision, command_plan: rebuilt.command_plan }));
  const priorReceipts = [];
  for (const priorPath of priorReceiptPaths) priorReceipts.push(await readJsonFromPath(priorPath, ERROR_CODES.priorInvalid, cwd));
  const replay = analyzePriorApplicationReceipts({ priorReceipts, identity, application: rebuilt.application, approval, planFingerprint });
  if (replay.state !== "none") return buildReceipt({ rebuilt, approval, approvalSchema, identity, planFingerprint, replay, apply });
  let writerResult = null;
  if (apply) {
    writerResult = await writer.buildDiscordUpdatePost({ title: rebuilt.command_plan.title, body: rebuilt.command_plan.body, apply: true });
  }
  return buildReceipt({ rebuilt, approval, approvalSchema, identity, planFingerprint, replay, writerResult, apply });
}

function createSelfCheckResult({ cwd = process.cwd(), repoRoot = REPO_ROOT } = {}) {
  const schema = resolveApprovalSchema({ cwd, repoRoot });
  return { ok: true, contract_version: SELF_CHECK_VERSION, receipt_contract_version: CONTRACT_VERSION, approval_contract_version: APPROVAL_CONTRACT_VERSION, canonical_schema_digest: `sha256:${APPROVAL_SCHEMA_SHA256}`, atlas_owner_commit: ATLAS_OWNER_COMMIT, schema_resolution: { source: schema.source, schema_reference: schema.schema_reference }, guarantees: { no_apply_without_approval: true, dry_run_consumer_unchanged: true, writes_board: false, writes_storage: false } };
}

async function runCli(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const result = options.selfCheck ? createSelfCheckResult({ cwd: process.cwd() }) : await buildApplicationReceipt({ ...options, cwd: process.cwd() });
    const output = consumer.stableStringify(result);
    if (options.outputPath) await fsp.writeFile(path.resolve(process.cwd(), options.outputPath), output, "utf8");
    process.stdout.write(output);
    return result.ok ? 0 : 1;
  } catch (error) {
    process.stdout.write(consumer.stableStringify({ ok: false, reason_code: error?.reasonCode || ERROR_CODES.input }));
    return 1;
  }
}

if (require.main === module) runCli().then((code) => { process.exitCode = code; });

module.exports = { _internals: { REPO_ROOT, CONTRACT_VERSION, SELF_CHECK_VERSION, APPROVAL_CONTRACT_VERSION, ATLAS_OWNER_COMMIT, APPROVAL_SCHEMA_SHA256, REQUIRED_CONSTRAINTS, ERROR_CODES, sha256, findAtlasRoot, expectedProvenance, resolveApprovalSchema, validateApproval, deriveApplicationReceiptIdentity, parseArgs, validateDryRunAgreement, analyzePriorApplicationReceipts, buildApplicationReceipt, createSelfCheckResult, runCli } };
