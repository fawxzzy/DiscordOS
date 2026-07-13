const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals: consumer } = require("../scripts/discordos-github-projection-intent-consumer");
const { _internals } = require("../scripts/discordos-github-projection-application");

const repoRoot = path.resolve(__dirname, "..");
const sourceText = fs.readFileSync(path.join(repoRoot, "scripts", "discordos-github-projection-application.js"), "utf8");

function digest(value) { return consumer.sha256(value).replace("sha256:", ""); }

function sourceReceipt() {
  return {
    contract_version: "atlas.github.event-receipt.v1", event_id: "ghr_release_1", idempotency_key: "ghk_release_1", observed_at: "2026-07-13T15:30:00Z", event_family: "release", fact_state: "observed",
    source: { provider: "github", producer: "_stack", repository_owner: "fawxzzy", repository_name: "atlas", endpoint: "repos/fawxzzy/atlas/releases/v1" },
    subject: { repository: "fawxzzy/atlas", repository_id: "123", entity_type: "release", entity_id: "v1", entity_ref: "tags/v1", title: "v1", url: "https://github.com/fawxzzy/atlas/releases/tag/v1" },
    correlation: { provider_delivery_id: "delivery-1", source_run_id: null, atlas_job_id: null, parent_event_id: null },
    evidence_refs: ["tests/source.json"], digest: { algorithm: "sha256", value: digest("source-1"), source_event_identity: "release:v1:source", fact_payload_identity: "github:release:v1" },
    normalized_facts: [
      { fact_key: "release.tag", state: "observed", value: "v1", source_path: "facts.tag", note: null },
      { fact_key: "release.name", state: "observed", value: "v1", source_path: "subject.title", note: null },
    ],
    authority: { producer: "_stack", atlas_contract_owner: "Atlas Contracts", owner_repository_truth: "preserved", read_only_first: true, external_mutation: "denied" }, summary: "Release observed.",
  };
}

function intent() {
  const source = sourceReceipt();
  return {
    contract_version: "atlas.github.projection-intent.v1", projection_id: "ghp_release_1", idempotency_key: "ghpk_release_1", created_at: "2026-07-13T15:31:00Z",
    admission_ref: { admission_id: "gha_release_1", decision: "accepted" }, source_event: { event_id: source.event_id, event_family: source.event_family, digest_algorithm: source.digest.algorithm, digest_value: source.digest.value },
    decision: "requires_review", destination: "discordos_update", operation: "publish", route: { project_id: null, card_id: null, board_id: null, channel_id: null, thread_id: null },
    normalized_fact_refs: ["release.tag", "release.name"], reason_codes: ["projection.example.reason"], authority: { intent_producer: "Atlas", external_writer: "DiscordOS" }, external_mutation: "denied", evidence_refs: ["docs/intent.md"], summary: "Release is ready for reviewed publication.",
  };
}

function approval(overrides = {}) {
  return {
    contract_version: "atlas.approval-record.v2", approval_id: "approval-1", job_id: "job-1", recorded_at: "2026-07-13T16:00:00Z", actor: "operator@example.test",
    action: { kind: "external-mutation", target: "discordos:updates", scope: "publish_projection:ghp_release_1" }, decision: "approved", expires_at: "2030-07-13T17:00:00Z", constraints: ["single-writer", "exact-readback", "no-mentions"],
    ...overrides,
  };
}

async function fixture() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-application-"));
  const intentPath = path.join(dir, "intent.json"); const sourcePath = path.join(dir, "source.json"); const approvalPath = path.join(dir, "approval.json"); const dryPath = path.join(dir, "dry.json");
  await Promise.all([
    fsp.writeFile(intentPath, JSON.stringify(intent()), "utf8"),
    fsp.writeFile(sourcePath, JSON.stringify(sourceReceipt()), "utf8"),
    fsp.writeFile(approvalPath, JSON.stringify(approval()), "utf8"),
  ]);
  const dry = await consumer.buildConsumerReceipt({ intentPath, sourceReceiptPath: sourcePath, cwd: dir });
  await fsp.writeFile(dryPath, consumer.stableStringify(dry), "utf8");
  return { dir, intentPath, sourcePath, approvalPath, dryPath };
}

function fakeWriter(status = "sent") {
  const calls = [];
  return {
    calls,
    writer: { buildDiscordUpdatePost: async (input) => {
      calls.push(input);
      return { status, sendsMessages: true, httpStatus: 200, messageId: "message-1", channelId: "channel-1", timestamp: "2026-07-13T16:00:00Z", reasonCodes: [], readback: { ok: status === "sent", status: status === "sent" ? "verified" : "mismatch", exactMatch: status === "sent", reasonCodes: status === "sent" ? [] : ["readback_embed_title_mismatch"] } };
    } },
  };
}

test("application readiness rebuilds the dry run, preserves approval correlation, and never calls the writer", async () => {
  const files = await fixture(); const fake = fakeWriter();
  const result = await _internals.buildApplicationReceipt({ intentPath: files.intentPath, sourceReceiptPath: files.sourcePath, dryRunReceiptPath: files.dryPath, approvalPath: files.approvalPath, cwd: files.dir, writer: fake.writer });
  assert.equal(result.status, "ready");
  assert.equal(result.sends_messages, false); assert.equal(result.writes_board, false); assert.equal(result.writes_storage, false);
  assert.equal(result.readback.status, "not_requested"); assert.equal(fake.calls.length, 0);
  assert.equal(result.approval.scope, "publish_projection:ghp_release_1");
});

test("application rejects non-exact approval before any writer call", async () => {
  const files = await fixture(); const fake = fakeWriter();
  await fsp.writeFile(files.approvalPath, JSON.stringify(approval({ constraints: ["single-writer"] })), "utf8");
  await assert.rejects(() => _internals.buildApplicationReceipt({ intentPath: files.intentPath, sourceReceiptPath: files.sourcePath, dryRunReceiptPath: files.dryPath, approvalPath: files.approvalPath, cwd: files.dir, apply: true, writer: fake.writer }), /approval_constraint_missing/);
  assert.equal(fake.calls.length, 0);
});

test("application rejects wrong scope, target, and expired approvals before writer invocation", async () => {
  const files = await fixture(); const fake = fakeWriter();
  for (const badApproval of [
    approval({ action: { kind: "external-mutation", target: "discordos:alerts", scope: "publish_projection:ghp_release_1" } }),
    approval({ action: { kind: "external-mutation", target: "discordos:updates", scope: "publish_projection:other" } }),
    approval({ expires_at: "2020-01-01T00:00:00Z" }),
  ]) {
    await fsp.writeFile(files.approvalPath, JSON.stringify(badApproval), "utf8");
    await assert.rejects(() => _internals.buildApplicationReceipt({ intentPath: files.intentPath, sourceReceiptPath: files.sourcePath, dryRunReceiptPath: files.dryPath, approvalPath: files.approvalPath, cwd: files.dir, apply: true, writer: fake.writer }));
  }
  assert.equal(fake.calls.length, 0);
});

test("application uses only injected existing-writer surface for fake successful apply and preserves exact readback", async () => {
  const files = await fixture(); const fake = fakeWriter();
  const result = await _internals.buildApplicationReceipt({ intentPath: files.intentPath, sourceReceiptPath: files.sourcePath, dryRunReceiptPath: files.dryPath, approvalPath: files.approvalPath, cwd: files.dir, apply: true, writer: fake.writer });
  assert.equal(result.status, "sent_verified"); assert.equal(result.sends_messages, true); assert.equal(result.readback.status, "verified");
  assert.equal(fake.calls.length, 1); assert.equal(fake.calls[0].apply, true); assert.equal(fake.calls[0].title, result.command_plan.title);
});

test("application records sent-but-unverified terminal state and blocks its automatic replay", async () => {
  const files = await fixture(); const fake = fakeWriter("sent_but_unverified");
  const first = await _internals.buildApplicationReceipt({ intentPath: files.intentPath, sourceReceiptPath: files.sourcePath, dryRunReceiptPath: files.dryPath, approvalPath: files.approvalPath, cwd: files.dir, apply: true, writer: fake.writer });
  assert.equal(first.status, "sent_but_unverified");
  const prior = path.join(files.dir, "prior.json"); await fsp.writeFile(prior, consumer.stableStringify(first), "utf8");
  const replay = await _internals.buildApplicationReceipt({ intentPath: files.intentPath, sourceReceiptPath: files.sourcePath, dryRunReceiptPath: files.dryPath, approvalPath: files.approvalPath, priorReceiptPaths: [prior], cwd: files.dir, apply: true, writer: fake.writer });
  assert.equal(replay.status, "blocked"); assert.equal(replay.replay.state, "reconciliation_required"); assert.equal(fake.calls.length, 1);
});

test("application suppresses exact successful replay and quarantines conflicting prior evidence", async () => {
  const files = await fixture(); const fake = fakeWriter();
  const first = await _internals.buildApplicationReceipt({ intentPath: files.intentPath, sourceReceiptPath: files.sourcePath, dryRunReceiptPath: files.dryPath, approvalPath: files.approvalPath, cwd: files.dir, apply: true, writer: fake.writer });
  const exactPath = path.join(files.dir, "exact.json"); await fsp.writeFile(exactPath, consumer.stableStringify(first), "utf8");
  const suppressed = await _internals.buildApplicationReceipt({ intentPath: files.intentPath, sourceReceiptPath: files.sourcePath, dryRunReceiptPath: files.dryPath, approvalPath: files.approvalPath, priorReceiptPaths: [exactPath], cwd: files.dir, apply: true, writer: fake.writer });
  assert.equal(suppressed.status, "suppressed"); assert.equal(fake.calls.length, 1);
  const conflictPath = path.join(files.dir, "conflict.json"); await fsp.writeFile(conflictPath, JSON.stringify({ ...first, plan_fingerprint: "sha256:conflict" }), "utf8");
  const quarantined = await _internals.buildApplicationReceipt({ intentPath: files.intentPath, sourceReceiptPath: files.sourcePath, dryRunReceiptPath: files.dryPath, approvalPath: files.approvalPath, priorReceiptPaths: [conflictPath], cwd: files.dir, apply: true, writer: fake.writer });
  assert.equal(quarantined.status, "blocked"); assert.equal(quarantined.replay.state, "quarantined"); assert.equal(fake.calls.length, 1);
});

test("application adapter contains no direct network, process, deployment, board, or storage writer", () => {
  assert.doesNotMatch(sourceText, /\bfetch\s*\(/); assert.doesNotMatch(sourceText, /\bhttps\.(request|get)\b/); assert.doesNotMatch(sourceText, /\bchild_process\b/);
  assert.doesNotMatch(sourceText, /\bspawn(?:Sync)?\b/); assert.doesNotMatch(sourceText, /\bvercel\b/i); assert.doesNotMatch(sourceText, /\bsupabase\b/i);
  assert.match(sourceText, /discord-update-post/);
});

test("approval mirror is byte-identical to the canonical Atlas schema and self-check preserves provenance", () => {
  const mirror = fs.readFileSync(path.join(repoRoot, "src", "contracts", "atlas.approval-record.v2.schema.json"));
  const canonical = fs.readFileSync(path.join(_internals.findAtlasRoot(repoRoot), "packages", "atlas-contracts", "schemas", "atlas.approval-record.v2.schema.json"));
  assert.deepEqual(mirror, canonical);
  const selfCheck = _internals.createSelfCheckResult({ cwd: repoRoot });
  assert.equal(selfCheck.canonical_schema_digest, "sha256:e882aae2ceb6ea65cc7a208f036e95ddc209c203f0b4b830372b8b2b35e954a2");
  assert.equal(selfCheck.atlas_owner_commit, "d718d14c5f23a08c402e9bd821db6526f541034a");
});
