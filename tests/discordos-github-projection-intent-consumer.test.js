const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-github-projection-intent-consumer");

const repoRoot = path.resolve(__dirname, "..");
const atlasRoot = _internals.findAtlasRoot(repoRoot);
const cliPath = path.join(repoRoot, "scripts", "discordos-github-projection-intent-consumer.js");
const sourceText = fs.readFileSync(cliPath, "utf8");
const projectionSchemaPath = path.join(atlasRoot, _internals.CANONICAL_SCHEMA_RELATIVE_PATH);
const sourceReceiptSchemaPath = path.join(atlasRoot, _internals.SOURCE_RECEIPT_SCHEMA_RELATIVE_PATH);

function digestHex(value) {
  return _internals.sha256(value).replace("sha256:", "");
}

function makeSourceReceipt({
  eventFamily = "release",
  eventId = "ghr_release_observed_example",
  digestSeed = "release-observed",
  repository = "fawxzzy/atlas",
  repositoryId = "123456",
  entityId = "v1.2.3",
  entityRef = "tags/v1.2.3",
  title = "v1.2.3",
  url = "https://github.com/fawxzzy/atlas/releases/tag/v1.2.3",
  factState = "observed",
  facts = [
    {
      fact_key: "release.tag",
      state: "observed",
      value: "v1.2.3",
      source_path: "facts.release_tag",
      note: null,
    },
    {
      fact_key: "release.name",
      state: "observed",
      value: "v1.2.3",
      source_path: "subject.title",
      note: null,
    },
  ],
} = {}) {
  const [repositoryOwner, repositoryName] = repository.split("/");
  const digest = digestHex(digestSeed);

  return {
    contract_version: "atlas.github.event-receipt.v1",
    event_id: eventId,
    idempotency_key: `ghk_${eventId}`,
    observed_at: "2026-07-13T15:30:00Z",
    event_family: eventFamily,
    fact_state: factState,
    source: {
      provider: "github",
      producer: "_stack",
      repository_owner: repositoryOwner,
      repository_name: repositoryName,
      endpoint: `repos/${repositoryOwner}/${repositoryName}/${eventFamily}/${entityId}`,
    },
    subject: {
      repository,
      repository_id: repositoryId,
      entity_type: eventFamily,
      entity_id: entityId,
      entity_ref: entityRef,
      title,
      url,
    },
    correlation: {
      provider_delivery_id: "delivery-123",
      source_run_id: null,
      atlas_job_id: null,
      parent_event_id: null,
    },
    evidence_refs: [
      "tests/fixtures/source-receipt.json",
    ],
    digest: {
      algorithm: "sha256",
      value: digest,
      source_event_identity: `${eventFamily}:${entityId}:${digest.slice(0, 12)}`,
      fact_payload_identity: `github:${eventFamily}:${entityId}`,
    },
    normalized_facts: facts,
    authority: {
      producer: "_stack",
      atlas_contract_owner: "Atlas Contracts",
      owner_repository_truth: "preserved",
      read_only_first: true,
      external_mutation: "denied",
    },
    summary: eventFamily === "security_alert"
      ? "Canonical security alert receipt."
      : "Canonical release receipt.",
  };
}

function makeProjectionIntent({
  projectionId = "ghp_release_projection",
  idempotencyKey = "ghpk_release_projection",
  eventId = "ghr_release_observed_example",
  eventFamily = "release",
  digestValue = digestHex("release-observed"),
  decision = "requires_review",
  destination = "discordos_update",
  operation = "publish",
  normalizedFactRefs = ["release.tag", "release.name"],
  summary = "Atlas emitted a formatting-free release publication intent.",
  route = {
    project_id: null,
    card_id: null,
    board_id: null,
    channel_id: null,
    thread_id: null,
  },
} = {}) {
  return {
    contract_version: "atlas.github.projection-intent.v1",
    projection_id: projectionId,
    idempotency_key: idempotencyKey,
    created_at: "2026-07-13T15:31:00Z",
    admission_ref: {
      admission_id: "gha_release_admission",
      decision: "accepted",
    },
    source_event: {
      event_id: eventId,
      event_family: eventFamily,
      digest_algorithm: "sha256",
      digest_value: digestValue,
    },
    decision,
    destination,
    operation,
    route,
    normalized_fact_refs: normalizedFactRefs,
    reason_codes: [
      "projection.example.reason",
    ],
    authority: {
      intent_producer: "Atlas",
      external_writer: "DiscordOS",
    },
    external_mutation: "denied",
    evidence_refs: [
      "docs/ops/GITHUB-CONTROL-PLANE-EVENT-ADMISSION-RUNTIME-2026-07-13.md",
    ],
    summary,
  };
}

async function writeJson(dirPath, fileName, payload) {
  const targetPath = path.join(dirPath, fileName);
  await fsp.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return targetPath;
}

function invokeCli(args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
  });
}

test("projection intent consumer resolves the canonical Atlas sibling schema in the normal workspace", () => {
  assert.ok(fs.existsSync(projectionSchemaPath), "canonical projection intent schema fixture must exist");
  const resolution = _internals.resolveProjectionIntentSchema({ cwd: repoRoot });

  assert.equal(resolution.source, _internals.SCHEMA_SOURCE.atlasSiblingCanonical);
  assert.equal(
    resolution.schema_reference.replaceAll("\\", "/"),
    "packages/atlas-contracts/schemas/atlas.github.projection-intent.v1.schema.json"
  );
  assert.equal(
    resolution.digest,
    `sha256:${_internals.ACCEPTED_CANONICAL_SCHEMA_SHA256}`
  );
  assert.equal(resolution.mirror_status.digest_matches_canonical, true);
  assert.equal(resolution.mirror_status.provenance_valid, true);
});

test("projection intent consumer falls back to the locked mirror in isolated CI and preserves byte identity", async () => {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-isolated-"));
  await fsp.mkdir(path.join(tempRoot, "src", "contracts"), { recursive: true });
  await fsp.copyFile(
    path.join(repoRoot, _internals.MIRROR_SCHEMA_RELATIVE_PATH),
    path.join(tempRoot, _internals.MIRROR_SCHEMA_RELATIVE_PATH)
  );
  await fsp.copyFile(
    path.join(repoRoot, _internals.MIRROR_PROVENANCE_RELATIVE_PATH),
    path.join(tempRoot, _internals.MIRROR_PROVENANCE_RELATIVE_PATH)
  );

  const resolution = _internals.resolveProjectionIntentSchema({
    repoRoot: tempRoot,
    cwd: tempRoot,
    atlasRoot: null,
  });
  const canonicalBytes = await fsp.readFile(projectionSchemaPath, "utf8");
  const mirrorBytes = await fsp.readFile(path.join(tempRoot, _internals.MIRROR_SCHEMA_RELATIVE_PATH), "utf8");

  assert.equal(resolution.source, _internals.SCHEMA_SOURCE.mirrorFallback);
  assert.equal(
    resolution.schema_reference.replaceAll("\\", "/"),
    "src/contracts/atlas.github.projection-intent.v1.schema.json"
  );
  assert.equal(canonicalBytes, mirrorBytes);
});

test("projection intent consumer fails closed on mirror provenance and digest mismatch", async () => {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-mirror-"));
  await fsp.mkdir(path.join(tempRoot, "src", "contracts"), { recursive: true });
  await fsp.copyFile(
    path.join(repoRoot, _internals.MIRROR_SCHEMA_RELATIVE_PATH),
    path.join(tempRoot, _internals.MIRROR_SCHEMA_RELATIVE_PATH)
  );
  await fsp.copyFile(
    path.join(repoRoot, _internals.MIRROR_PROVENANCE_RELATIVE_PATH),
    path.join(tempRoot, _internals.MIRROR_PROVENANCE_RELATIVE_PATH)
  );

  const badProvenancePath = path.join(tempRoot, _internals.MIRROR_PROVENANCE_RELATIVE_PATH);
  const badProvenance = JSON.parse(await fsp.readFile(badProvenancePath, "utf8"));
  badProvenance.mirror_sha256 = "0".repeat(64);
  await fsp.writeFile(badProvenancePath, `${JSON.stringify(badProvenance, null, 2)}\n`, "utf8");

  assert.throws(
    () => _internals.resolveProjectionIntentSchema({
      repoRoot: tempRoot,
      cwd: tempRoot,
      atlasRoot: null,
    }),
    /projection_intent_mirror_provenance_invalid/
  );

  await fsp.writeFile(
    badProvenancePath,
    await fsp.readFile(path.join(repoRoot, _internals.MIRROR_PROVENANCE_RELATIVE_PATH), "utf8"),
    "utf8"
  );
  await fsp.appendFile(path.join(tempRoot, _internals.MIRROR_SCHEMA_RELATIVE_PATH), "\n", "utf8");

  assert.throws(
    () => _internals.resolveProjectionIntentSchema({
      repoRoot: tempRoot,
      cwd: tempRoot,
      atlasRoot: null,
    }),
    /projection_intent_mirror_digest_mismatch/
  );
});

test("projection intent consumer builds a valid ledger-only no-action receipt", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-ledger-"));
  const intentPath = await writeJson(
    tempDir,
    "intent.json",
    makeProjectionIntent({
      projectionId: "ghp_ledger_projection",
      idempotencyKey: "ghpk_ledger_projection",
      eventFamily: "pull_request",
      destination: "atlas_ledger",
      operation: "record",
      decision: "admitted",
      normalizedFactRefs: ["pull_request.number"],
      summary: "Atlas emitted a ledger-only record intent.",
    })
  );

  const receipt = await _internals.buildConsumerReceipt({
    intentPath,
    cwd: tempDir,
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, "no_external_action");
  assert.equal(receipt.command_plan, null);
  assert.equal(receipt.sends_messages, false);
  assert.equal(receipt.writes_board, false);
  assert.equal(receipt.writes_storage, false);
  assert.equal(receipt.external_mutation, "denied");
});

test("projection intent consumer builds a release update dry-run plan routed to updates", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-release-"));
  const sourceReceipt = makeSourceReceipt();
  const intent = makeProjectionIntent();
  const intentPath = await writeJson(tempDir, "intent.json", intent);
  const sourceReceiptPath = await writeJson(tempDir, "source.json", sourceReceipt);

  const receipt = await _internals.buildConsumerReceipt({
    intentPath,
    sourceReceiptPath,
    cwd: tempDir,
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, "requires_review");
  assert.equal(receipt.route_decision.route_id, "atlas-github-release-observed-info");
  assert.deepEqual(receipt.route_decision.target_env, ["DISCORDOS_UPDATES_CHANNEL_ID"]);
  assert.equal(receipt.adapter.adapter_script, "scripts/discord-update-post.js");
  assert.equal(receipt.command_plan.title, "GitHub release observed: v1.2.3");
  assert.match(receipt.command_plan.body, /Repository: fawxzzy\/atlas/);
  assert.ok(!receipt.command_plan.body.includes("https://discord.com/api/webhooks"));
});

test("projection intent consumer builds a security-alert dry-run plan routed to alerts", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-alert-"));
  const sourceReceipt = makeSourceReceipt({
    eventFamily: "security_alert",
    eventId: "ghr_security_alert_example",
    digestSeed: "security-alert",
    entityId: "alert-1",
    entityRef: "secret_scanning:1",
    title: "Supabase Service Key",
    url: "https://github.com/fawxzzy/atlas/security/secret-scanning/1",
    facts: [
      {
        fact_key: "security_alert.id",
        state: "observed",
        value: "1",
        source_path: "subject.id",
        note: null,
      },
      {
        fact_key: "security_alert.severity",
        state: "observed",
        value: "Critical",
        source_path: "facts.alert_severity",
        note: null,
      },
    ],
  });
  const intent = makeProjectionIntent({
    projectionId: "ghp_security_alert_projection",
    idempotencyKey: "ghpk_security_alert_projection",
    eventId: "ghr_security_alert_example",
    eventFamily: "security_alert",
    digestValue: digestHex("security-alert"),
    destination: "discordos_alerts",
    operation: "alert",
    normalizedFactRefs: ["security_alert.id", "security_alert.severity"],
    summary: "Atlas emitted a formatting-free alert intent.",
  });
  const intentPath = await writeJson(tempDir, "intent.json", intent);
  const sourceReceiptPath = await writeJson(tempDir, "source.json", sourceReceipt);

  const receipt = await _internals.buildConsumerReceipt({
    intentPath,
    sourceReceiptPath,
    cwd: tempDir,
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, "requires_review");
  assert.equal(receipt.route_decision.route_id, "atlas-github-security-alert-critical");
  assert.deepEqual(receipt.route_decision.target_env, [
    "DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID",
    "DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID",
  ]);
  assert.equal(receipt.adapter.adapter_script, "scripts/runtime-health-alert-delivery.js");
  assert.equal(receipt.command_plan.alert_summary, "GitHub security alert observed: Supabase Service Key");
  assert.match(receipt.command_plan.alert_body, /Facts:/);
});

test("projection intent consumer enforces source-intent correlation before planning Discord destinations", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-correlation-"));
  const sourceReceipt = makeSourceReceipt();
  const intent = makeProjectionIntent({
    digestValue: "0".repeat(64),
  });
  const intentPath = await writeJson(tempDir, "intent.json", intent);
  const sourceReceiptPath = await writeJson(tempDir, "source.json", sourceReceipt);

  await assert.rejects(
    () => _internals.buildConsumerReceipt({
      intentPath,
      sourceReceiptPath,
      cwd: tempDir,
    }),
    /source_receipt_correlation_failed/
  );
});

test("projection intent consumer suppresses exact replays and blocks conflicting prior evidence", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-prior-"));
  const sourceReceipt = makeSourceReceipt();
  const intent = makeProjectionIntent();
  const intentPath = await writeJson(tempDir, "intent.json", intent);
  const sourceReceiptPath = await writeJson(tempDir, "source.json", sourceReceipt);

  const firstReceipt = await _internals.buildConsumerReceipt({
    intentPath,
    sourceReceiptPath,
    cwd: tempDir,
  });
  const exactPriorPath = await writeJson(tempDir, "prior-exact.json", firstReceipt);

  const suppressed = await _internals.buildConsumerReceipt({
    intentPath,
    sourceReceiptPath,
    priorReceiptPaths: [exactPriorPath],
    cwd: tempDir,
  });

  assert.equal(suppressed.ok, true);
  assert.equal(suppressed.status, "suppressed");
  assert.equal(suppressed.command_plan, null);
  assert(suppressed.reason_codes.includes("exact_prior_application_receipt_replay_suppressed"));

  const conflictingPrior = {
    ...firstReceipt,
    replay_fingerprint: "sha256:conflicting-prior-fingerprint",
  };
  const conflictingPriorPath = await writeJson(tempDir, "prior-conflict.json", conflictingPrior);
  const blocked = await _internals.buildConsumerReceipt({
    intentPath,
    sourceReceiptPath,
    priorReceiptPaths: [conflictingPriorPath],
    cwd: tempDir,
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, "blocked");
  assert(blocked.reason_codes.includes("prior_receipt_conflict_quarantined"));
});

test("projection intent consumer gives explicit behavior for every destination, operation, and preserved decision state", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-routing-"));
  const boardSource = makeSourceReceipt({
    eventFamily: "pull_request",
    eventId: "ghr_board_pull_request",
    digestSeed: "board-pull-request",
    entityId: "123",
    entityRef: "refs/pull/123/head",
    title: "Board PR",
    url: "https://github.com/fawxzzy/atlas/pull/123",
    facts: [
      {
        fact_key: "pull_request.number",
        state: "observed",
        value: "123",
        source_path: "subject.number",
        note: null,
      },
    ],
  });
  const boardIntent = makeProjectionIntent({
    projectionId: "ghp_board_projection",
    idempotencyKey: "ghpk_board_projection",
    eventId: "ghr_board_pull_request",
    eventFamily: "pull_request",
    digestValue: digestHex("board-pull-request"),
    destination: "discordos_board",
    operation: "transition",
    decision: "admitted",
    normalizedFactRefs: ["pull_request.number"],
    summary: "Atlas emitted a board transition intent.",
  });
  const boardIntentPath = await writeJson(tempDir, "board-intent.json", boardIntent);
  const boardSourcePath = await writeJson(tempDir, "board-source.json", boardSource);
  const boardReceipt = await _internals.buildConsumerReceipt({
    intentPath: boardIntentPath,
    sourceReceiptPath: boardSourcePath,
    cwd: tempDir,
  });

  assert.equal(boardReceipt.ok, false);
  assert.equal(boardReceipt.status, "blocked");
  assert(boardReceipt.reason_codes.includes("not_admitted_in_v1"));

  const unsupportedIntent = makeProjectionIntent({
    projectionId: "ghp_bad_update_projection",
    idempotencyKey: "ghpk_bad_update_projection",
    operation: "update",
  });
  const unsupportedIntentPath = await writeJson(tempDir, "unsupported-intent.json", unsupportedIntent);
  const unsupportedSourcePath = await writeJson(tempDir, "unsupported-source.json", makeSourceReceipt());
  const unsupportedReceipt = await _internals.buildConsumerReceipt({
    intentPath: unsupportedIntentPath,
    sourceReceiptPath: unsupportedSourcePath,
    cwd: tempDir,
  });

  assert.equal(unsupportedReceipt.ok, false);
  assert.equal(unsupportedReceipt.status, "blocked");
  assert(unsupportedReceipt.reason_codes.includes("unsupported_destination_operation"));

  const suppressedIntent = makeProjectionIntent({
    projectionId: "ghp_suppressed_projection",
    idempotencyKey: "ghpk_suppressed_projection",
    decision: "suppressed",
  });
  const suppressedIntentPath = await writeJson(tempDir, "suppressed-intent.json", suppressedIntent);
  const suppressedSourcePath = await writeJson(tempDir, "suppressed-source.json", makeSourceReceipt());
  const suppressedReceipt = await _internals.buildConsumerReceipt({
    intentPath: suppressedIntentPath,
    sourceReceiptPath: suppressedSourcePath,
    cwd: tempDir,
  });

  assert.equal(suppressedReceipt.ok, true);
  assert.equal(suppressedReceipt.status, "suppressed");
  assert.equal(suppressedReceipt.command_plan, null);

  const blockedIntent = makeProjectionIntent({
    projectionId: "ghp_blocked_projection",
    idempotencyKey: "ghpk_blocked_projection",
    destination: "discordos_alerts",
    operation: "alert",
    eventFamily: "security_alert",
    eventId: "ghr_blocked_security_alert",
    digestValue: digestHex("blocked-security-alert"),
    normalizedFactRefs: ["security_alert.id"],
    decision: "blocked",
  });
  const blockedSourcePath = await writeJson(
    tempDir,
    "blocked-source.json",
    makeSourceReceipt({
      eventFamily: "security_alert",
      eventId: "ghr_blocked_security_alert",
      digestSeed: "blocked-security-alert",
      entityId: "alert-9",
      entityRef: "secret_scanning:9",
      title: "Blocked Alert",
      url: "https://github.com/fawxzzy/atlas/security/secret-scanning/9",
      facts: [
        {
          fact_key: "security_alert.id",
          state: "observed",
          value: "9",
          source_path: "subject.id",
          note: null,
        },
      ],
    })
  );
  const blockedIntentPath = await writeJson(tempDir, "blocked-intent.json", blockedIntent);
  const blockedReceipt2 = await _internals.buildConsumerReceipt({
    intentPath: blockedIntentPath,
    sourceReceiptPath: blockedSourcePath,
    cwd: tempDir,
  });

  assert.equal(blockedReceipt2.ok, false);
  assert.equal(blockedReceipt2.status, "blocked");
  assert(blockedReceipt2.reason_codes.includes("atlas_projection_intent_blocked"));
});

test("projection intent consumer resolves null Atlas route ids to env names only and never secret values", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-env-only-"));
  const intentPath = await writeJson(tempDir, "intent.json", makeProjectionIntent());
  const sourcePath = await writeJson(tempDir, "source.json", makeSourceReceipt());
  const receipt = await _internals.buildConsumerReceipt({
    intentPath,
    sourceReceiptPath: sourcePath,
    cwd: tempDir,
  });

  assert.deepEqual(receipt.route_decision.target_env, ["DISCORDOS_UPDATES_CHANNEL_ID"]);
  assert.equal(receipt.command_plan.body.includes("bot-secret"), false);
  assert.equal(receipt.command_plan.body.includes("https://discord.com/api/webhooks"), false);
  assert.equal(receipt.command_plan.body.includes("1504671871512346695"), false);
});

test("projection intent consumer CLI rejects live flags, credentials, webhook ids, malformed JSON, schema-invalid input, and secret-like values without echo", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-cli-"));
  const validIntentPath = await writeJson(tempDir, "intent.json", makeProjectionIntent({
    destination: "atlas_ledger",
    operation: "record",
    decision: "admitted",
    normalizedFactRefs: ["pull_request.number"],
    eventFamily: "pull_request",
    eventId: "ghr_cli_ledger",
    digestValue: digestHex("cli-ledger"),
  }));

  const liveApply = invokeCli(["--json", "--apply", "--intent", validIntentPath], { cwd: tempDir });
  assert.equal(liveApply.status, 1);
  assert.match(liveApply.stdout, /live_apply_not_admitted/);

  const liveFlag = invokeCli(["--json", "--live", "--intent", validIntentPath], { cwd: tempDir });
  assert.equal(liveFlag.status, 1);
  assert.match(liveFlag.stdout, /live_apply_not_admitted/);

  const webhookFlag = invokeCli([
    "--json",
    "--intent",
    validIntentPath,
    "--webhook-url",
    "https://discord.com/api/webhooks/123456/secret-token",
  ], { cwd: tempDir });
  assert.equal(webhookFlag.status, 1);
  assert.match(webhookFlag.stdout, /live_apply_not_admitted/);
  assert.doesNotMatch(webhookFlag.stdout, /secret-token/);

  const channelFlag = invokeCli([
    "--json",
    "--intent",
    validIntentPath,
    "--channel-id",
    "1504671871512346695",
  ], { cwd: tempDir });
  assert.equal(channelFlag.status, 1);
  assert.match(channelFlag.stdout, /live_apply_not_admitted/);
  assert.doesNotMatch(channelFlag.stdout, /1504671871512346695/);

  const malformedIntentPath = path.join(tempDir, "malformed-intent.json");
  const malformedSecret = "https://discord.com/api/webhooks/123456/secret-like";
  await fsp.writeFile(malformedIntentPath, `{"summary":"${malformedSecret}"`, "utf8");
  const malformed = invokeCli(["--json", "--intent", malformedIntentPath], { cwd: tempDir });
  assert.equal(malformed.status, 1);
  assert.match(malformed.stdout, /intent_json_invalid/);
  assert.doesNotMatch(malformed.stdout, /secret-like/);

  const invalidIntentPath = await writeJson(tempDir, "invalid-intent.json", {
    ...makeProjectionIntent({
      destination: "atlas_ledger",
      operation: "record",
      decision: "admitted",
      normalizedFactRefs: ["pull_request.number"],
      eventFamily: "pull_request",
      eventId: "ghr_invalid_schema",
      digestValue: digestHex("invalid-schema"),
    }),
    external_mutation: "allowed",
  });
  const invalidSchema = invokeCli(["--json", "--intent", invalidIntentPath], { cwd: tempDir });
  assert.equal(invalidSchema.status, 1);
  assert.match(invalidSchema.stdout, /projection_intent_schema_invalid/);

  const secretIntentPath = await writeJson(tempDir, "secret-intent.json", {
    ...makeProjectionIntent({
      destination: "atlas_ledger",
      operation: "record",
      decision: "admitted",
      normalizedFactRefs: ["pull_request.number"],
      eventFamily: "pull_request",
      eventId: "ghr_secret_schema",
      digestValue: digestHex("secret-schema"),
    }),
    summary: malformedSecret,
  });
  const secretIntent = invokeCli(["--json", "--intent", secretIntentPath], { cwd: tempDir });
  assert.equal(secretIntent.status, 1);
  assert.match(secretIntent.stdout, /live_apply_not_admitted/);
  assert.doesNotMatch(secretIntent.stdout, /secret-like/);
});

test("projection intent consumer output is deterministic and byte-stable for identical replay", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "discordos-projection-intent-deterministic-"));
  const intentPath = await writeJson(tempDir, "intent.json", makeProjectionIntent());
  const sourcePath = await writeJson(tempDir, "source.json", makeSourceReceipt());

  const first = await _internals.buildConsumerReceipt({
    intentPath,
    sourceReceiptPath: sourcePath,
    cwd: tempDir,
  });
  const second = await _internals.buildConsumerReceipt({
    intentPath,
    sourceReceiptPath: sourcePath,
    cwd: tempDir,
  });

  assert.equal(_internals.stableStringify(first), _internals.stableStringify(second));
});

test("projection intent consumer self-check reports schema provenance and route mappings", () => {
  const selfCheck = _internals.createSelfCheckResult({ cwd: repoRoot });
  const cliSelfCheck = invokeCli(["--json", "--self-check"], { cwd: repoRoot });

  assert.equal(cliSelfCheck.status, 0);
  assert.deepEqual(JSON.parse(cliSelfCheck.stdout), selfCheck);
  assert.equal(selfCheck.contract_version, "discordos.github.projection-intent-consumer.self-check.v1");
  assert.equal(
    selfCheck.canonical_schema_digest,
    `sha256:${_internals.ACCEPTED_CANONICAL_SCHEMA_SHA256}`
  );
  assert.equal(selfCheck.schema_resolution.selected_source, _internals.SCHEMA_SOURCE.atlasSiblingCanonical);
  assert.equal(
    selfCheck.schema_resolution.selected_schema_reference,
    "packages/atlas-contracts/schemas/atlas.github.projection-intent.v1.schema.json"
  );
  assert.equal(selfCheck.route_mappings.release_updates_route.type, "atlas.github.release.observed");
  assert.equal(selfCheck.route_mappings.security_alerts_route.type, "atlas.github.security_alert.observed");
});

test("projection intent consumer implementation remains local-only and contains no network, child process, git mutation, or external writer execution", () => {
  assert.ok(fs.existsSync(sourceReceiptSchemaPath), "canonical source receipt schema fixture must exist");
  assert.doesNotMatch(sourceText, /\bfetch\s*\(/);
  assert.doesNotMatch(sourceText, /\bhttps\.(request|get)\b/);
  assert.doesNotMatch(sourceText, /\bchild_process\b/);
  assert.doesNotMatch(sourceText, /\bspawnSync\b/);
  assert.doesNotMatch(sourceText, /\bexecSync\b/);
  assert.doesNotMatch(sourceText, /\bgit\s+(push|commit|reset|checkout|switch|rebase|merge)\b/i);
  assert.doesNotMatch(sourceText, /\bvercel\b/i);
  assert.doesNotMatch(sourceText, /\bsupabase\b/i);
});
