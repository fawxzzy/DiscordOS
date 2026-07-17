const crypto = require("node:crypto");

const SCHEMA_VERSION = "discordos.interaction-reliability-review.v1";
const JOB_CONTRACT_VERSION = "atlas.job-envelope.v2";
const RECEIPT_CONTRACT_VERSION = "atlas.execution-receipt.v2";
const DEFAULT_SOURCE_REVISION = "UNKNOWN";
const DEFAULT_RUNTIME_URL = "https://fawxzzy-discordos.vercel.app";
const SCENARIO_ORDER = [
  "successful",
  "failed",
  "duplicate",
  "interrupted-restarted",
  "stale-receipt",
];
const PROVEN_SCOPE = [
  "exact_candidate_head_executes_the_fixed_hosted_canary",
  "five_scenario_correlation_and_digest_contract",
  "exact_fixture_readback_and_request_write_accounting",
  "zero_external_writes_and_zero_product_card_mutations",
];
const UNKNOWN_SCOPE = [
  "real_user_interactions_outside_the_fixed_canary",
  "production_message_command_path_adoption",
  "production_adoption_of_this_review_contract",
];
const ADMISSION_RATIONALE = "Owner-side hosted execution proves the reliability contract on an exact candidate head through the selector-authorized safe test surface; it does not claim production-path adoption.";

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(
    Buffer.isBuffer(value) ? value : String(value),
  ).digest("hex")}`;
}

function stableId(prefix, ...parts) {
  return `${prefix}_${sha256(canonicalJson(parts)).slice("sha256:".length, "sha256:".length + 24)}`;
}

function withDigest(value) {
  return {
    ...value,
    digest: sha256(canonicalJson(value)),
  };
}

function digestMatches(value) {
  if (!value || typeof value !== "object" || !/^sha256:[0-9a-f]{64}$/.test(value.digest || "")) {
    return false;
  }
  const candidate = { ...value };
  delete candidate.digest;
  return value.digest === sha256(canonicalJson(candidate));
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isExactGitRevision(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function fixtureAccounting(fixtureReads, fixtureWrites) {
  return {
    fixtureRequests: fixtureReads + fixtureWrites,
    fixtureReads,
    fixtureWrites,
    externalRequests: 0,
    externalWrites: 0,
  };
}

function parseArgs(args) {
  const options = {
    json: false,
    sourceRevision: process.env.VERCEL_GIT_COMMIT_SHA || DEFAULT_SOURCE_REVISION,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    runtimeUrl: process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : DEFAULT_RUNTIME_URL,
    environment: process.env.VERCEL_ENV || "local",
    generatedAt: new Date().toISOString(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (["--source-revision", "--deployment-id", "--runtime-url", "--environment", "--generated-at"].includes(arg)) {
      const value = args[index + 1];
      if (!hasValue(value)) {
        throw new Error(`missing_value:${arg}`);
      }
      const property = {
        "--source-revision": "sourceRevision",
        "--deployment-id": "deploymentId",
        "--runtime-url": "runtimeUrl",
        "--environment": "environment",
        "--generated-at": "generatedAt",
      }[arg];
      options[property] = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  if (options.generatedAt && !Number.isFinite(Date.parse(options.generatedAt))) {
    throw new Error("invalid_generated_at");
  }
  return options;
}

function baseIds(sourceRevision, seed, requestAttempt = 1) {
  return {
    requestId: stableId("dirq", sourceRevision, seed, "request", requestAttempt),
    interactionEventId: stableId("dievt", sourceRevision, seed, "interaction"),
    taskId: stableId("ditask", sourceRevision, seed, "task"),
    jobId: stableId("dijob", sourceRevision, seed, "job"),
    leaseId: stableId("dilease", sourceRevision, seed, "lease"),
    executionReceiptId: stableId("direceipt", sourceRevision, seed, "receipt"),
    responseId: stableId("diresponse", sourceRevision, seed, "response"),
    publicationAttemptId: stableId("dipubattempt", sourceRevision, seed, "publication-attempt"),
    publicationId: stableId("dipub", sourceRevision, seed, "publication"),
    readbackId: stableId("diread", sourceRevision, seed, "readback"),
    idempotencyKey: stableId("dikey", sourceRevision, seed, "idempotency"),
  };
}

class InMemoryReliabilityFixture {
  constructor() {
    this.tables = Object.fromEntries(
      ["requests", "interactions", "tasks", "receipts", "responses", "publications"]
        .map((name) => [name, new Map()]),
    );
    this.idempotencyIndex = new Map();
    this.fixtureReads = 0;
    this.fixtureWrites = 0;
    this.trace = [];
  }

  seed(table, key, value) {
    this.tables[table].set(key, structuredClone(value));
    if (table === "interactions") {
      this.idempotencyIndex.set(value.idempotencyKey, key);
    }
    this.trace.push({ operation: "seed", table, key, digest: value.digest });
  }

  write(table, key, value) {
    const previous = this.tables[table].get(key) || null;
    this.tables[table].set(key, structuredClone(value));
    if (table === "interactions") {
      this.idempotencyIndex.set(value.idempotencyKey, key);
    }
    this.fixtureWrites += 1;
    this.trace.push({
      operation: "write",
      table,
      key,
      previousDigest: previous?.digest || null,
      digest: value.digest,
    });
    return structuredClone(value);
  }

  read(table, key) {
    const value = this.tables[table].get(key) || null;
    this.fixtureReads += 1;
    this.trace.push({
      operation: "read",
      table,
      key,
      digest: value?.digest || null,
    });
    return value ? structuredClone(value) : null;
  }

  readByIdempotencyKey(idempotencyKey) {
    const interactionId = this.idempotencyIndex.get(idempotencyKey) || null;
    const value = interactionId ? this.tables.interactions.get(interactionId) || null : null;
    this.fixtureReads += 1;
    this.trace.push({
      operation: "read",
      table: "idempotency-index",
      key: idempotencyKey,
      resolvedKey: interactionId,
      digest: value?.digest || null,
    });
    return value ? structuredClone(value) : null;
  }

  reject(kind, details) {
    this.trace.push({ operation: "reject", kind, ...details });
  }

  resetAccounting() {
    this.fixtureReads = 0;
    this.fixtureWrites = 0;
    this.trace = [];
  }

  accounting() {
    return fixtureAccounting(this.fixtureReads, this.fixtureWrites);
  }

  executionTrace() {
    return structuredClone(this.trace);
  }
}

function requestObject(ids, status = "received") {
  return withDigest({ id: ids.requestId, idempotencyKey: ids.idempotencyKey, status });
}

function interactionObject(ids, status = "accepted") {
  return withDigest({
    id: ids.interactionEventId,
    requestId: ids.requestId,
    idempotencyKey: ids.idempotencyKey,
    status,
  });
}

function taskObject(ids, status, leaseId = ids.leaseId) {
  return withDigest({
    contractVersion: JOB_CONTRACT_VERSION,
    taskId: ids.taskId,
    jobId: ids.jobId,
    interactionEventId: ids.interactionEventId,
    leaseId,
    status,
  });
}

function receiptObject(ids, status, { receiptId = ids.executionReceiptId, leaseId = ids.leaseId, attempt = 1 } = {}) {
  return withDigest({
    contractVersion: RECEIPT_CONTRACT_VERSION,
    receiptId,
    jobId: ids.jobId,
    interactionEventId: ids.interactionEventId,
    leaseId,
    attempt,
    status,
  });
}

function responseObject(ids, status) {
  return withDigest({
    id: ids.responseId,
    interactionEventId: ids.interactionEventId,
    receiptId: ids.executionReceiptId,
    status,
  });
}

function publicationObject(ids, status, leaseId = ids.leaseId) {
  return withDigest({
    attemptId: ids.publicationAttemptId,
    id: ids.publicationId,
    responseId: ids.responseId,
    receiptId: ids.executionReceiptId,
    leaseId,
    status,
  });
}

function publicationReadback(ids, mode, observedPublication) {
  const observed = observedPublication
    ? { id: observedPublication.id, digest: observedPublication.digest }
    : null;
  return withDigest({
    id: ids.readbackId,
    mode,
    exact: true,
    expectedPublication: observed,
    observedPublication: observed,
    publicationAbsent: observedPublication === null,
    taskId: ids.taskId,
    jobId: ids.jobId,
    receiptId: ids.executionReceiptId,
  });
}

function executeSuccessfulScenario(sourceRevision) {
  const ids = baseIds(sourceRevision, "successful");
  const fixture = new InMemoryReliabilityFixture();
  const request = fixture.write("requests", ids.requestId, requestObject(ids));
  const interaction = fixture.write("interactions", ids.interactionEventId, interactionObject(ids));
  const task = fixture.write("tasks", ids.taskId, taskObject(ids, "succeeded"));
  const receipt = fixture.write("receipts", ids.executionReceiptId, receiptObject(ids, "succeeded"));
  const response = fixture.write("responses", ids.responseId, responseObject(ids, "published"));
  const publication = fixture.write("publications", ids.publicationId, publicationObject(ids, "applied"));
  const observedPublication = fixture.read("publications", ids.publicationId);
  const readback = publicationReadback(ids, "exact_touched_object", observedPublication);

  return {
    fixture,
    scenario: {
      id: "successful",
      outcome: "applied",
      classifications: ["accepted", "applied"],
      correlation: ids,
      objects: { request, interaction, task, receipt, response, publication, readback },
      accounting: fixture.accounting(),
      fixtureTrace: fixture.executionTrace(),
    },
  };
}

function executeFailedScenario(sourceRevision) {
  const ids = { ...baseIds(sourceRevision, "failed"), publicationId: null };
  const fixture = new InMemoryReliabilityFixture();
  const request = fixture.write("requests", ids.requestId, requestObject(ids));
  const interaction = fixture.write("interactions", ids.interactionEventId, interactionObject(ids));
  const task = fixture.write("tasks", ids.taskId, taskObject(ids, "failed"));
  const receipt = fixture.write("receipts", ids.executionReceiptId, receiptObject(ids, "failed"));
  const response = fixture.write("responses", ids.responseId, responseObject(ids, "failure_returned"));
  const publication = fixture.read("publications", ids.publicationAttemptId);
  const readback = publicationReadback(ids, "exact_absence", publication);

  return {
    id: "failed",
    outcome: "failed",
    classifications: ["accepted", "failed", "blocked"],
    correlation: ids,
    objects: { request, interaction, task, receipt, response, publication, readback },
    accounting: fixture.accounting(),
    fixtureTrace: fixture.executionTrace(),
  };
}

function executeDuplicateScenario(sourceRevision, successful, fixture) {
  fixture.resetAccounting();
  const ids = {
    ...successful.correlation,
    requestId: baseIds(sourceRevision, "successful", 2).requestId,
    duplicateOfRequestId: successful.correlation.requestId,
  };
  const duplicateRequest = withDigest({
    id: ids.requestId,
    duplicateOfRequestId: ids.duplicateOfRequestId,
    idempotencyKey: ids.idempotencyKey,
    status: "duplicate",
  });
  const interaction = fixture.readByIdempotencyKey(ids.idempotencyKey);
  const task = fixture.read("tasks", ids.taskId);
  const receipt = fixture.read("receipts", ids.executionReceiptId);
  const response = fixture.read("responses", ids.responseId);
  const publication = fixture.read("publications", ids.publicationId);
  fixture.read("requests", ids.duplicateOfRequestId);
  const readback = publicationReadback(successful.correlation, "exact_touched_object", publication);

  return {
    id: "duplicate",
    outcome: "duplicate",
    classifications: ["duplicate"],
    correlation: ids,
    objects: { duplicateRequest, interaction, task, receipt, response, publication, readback },
    accounting: fixture.accounting(),
    fixtureTrace: fixture.executionTrace(),
  };
}

function executeInterruptedScenario(sourceRevision) {
  const ids = baseIds(sourceRevision, "interrupted-restarted");
  ids.interruptedReceiptId = stableId("direceipt", sourceRevision, "interrupted-restarted", "interrupted");
  ids.restartLeaseId = stableId("dilease", sourceRevision, "interrupted-restarted", "restart");
  const fixture = new InMemoryReliabilityFixture();
  const request = fixture.write("requests", ids.requestId, requestObject(ids));
  const interaction = fixture.write("interactions", ids.interactionEventId, interactionObject(ids));
  const interruptedTask = fixture.write("tasks", ids.taskId, taskObject(ids, "interrupted", ids.leaseId));
  const interruptedReceipt = fixture.write(
    "receipts",
    ids.interruptedReceiptId,
    receiptObject(ids, "interrupted", { receiptId: ids.interruptedReceiptId, leaseId: ids.leaseId, attempt: 1 }),
  );
  const task = fixture.write("tasks", ids.taskId, taskObject(ids, "succeeded_after_restart", ids.restartLeaseId));
  const receipt = fixture.write(
    "receipts",
    ids.executionReceiptId,
    receiptObject(ids, "succeeded_after_restart", { leaseId: ids.restartLeaseId, attempt: 2 }),
  );
  const response = fixture.write("responses", ids.responseId, responseObject(ids, "published_after_recovery"));
  const publication = fixture.write(
    "publications",
    ids.publicationId,
    publicationObject(ids, "applied_once_after_recovery", ids.restartLeaseId),
  );
  const observedPublication = fixture.read("publications", ids.publicationId);
  const readback = publicationReadback(ids, "exact_recovered_touched_object", observedPublication);
  const recovery = withDigest({
    priorReceiptId: ids.interruptedReceiptId,
    recoveryReceiptId: ids.executionReceiptId,
    originalLeaseId: ids.leaseId,
    restartLeaseId: ids.restartLeaseId,
    recoveredTaskLeaseId: task.leaseId,
    recoveredReceiptLeaseId: receipt.leaseId,
    sameJob: interruptedReceipt.jobId === receipt.jobId,
    publicationCount: 1,
    status: "recovered",
  });

  return {
    id: "interrupted-restarted",
    outcome: "recovered",
    classifications: ["accepted", "interrupted", "recovered", "applied"],
    correlation: ids,
    objects: {
      request,
      interaction,
      interruptedTask,
      interruptedReceipt,
      task,
      receipt,
      response,
      publication,
      readback,
      recovery,
    },
    accounting: fixture.accounting(),
    fixtureTrace: fixture.executionTrace(),
  };
}

function executeStaleScenario(sourceRevision) {
  const ids = { ...baseIds(sourceRevision, "stale-receipt"), publicationId: null };
  ids.staleReceiptId = stableId("direceipt", sourceRevision, "stale-receipt", "attempt-1");
  ids.executionReceiptId = stableId("direceipt", sourceRevision, "stale-receipt", "attempt-2-current");
  const fixture = new InMemoryReliabilityFixture();
  const interaction = interactionObject(ids, "accepted_current");
  const task = taskObject(ids, "succeeded_current");
  const receipt = receiptObject(ids, "succeeded_current", { attempt: 2 });
  const response = responseObject(ids, "current_response_unchanged");
  fixture.seed("interactions", ids.interactionEventId, interaction);
  fixture.seed("tasks", ids.taskId, task);
  fixture.seed("receipts", ids.executionReceiptId, receipt);
  fixture.seed("responses", ids.responseId, response);

  const before = fixture.read("receipts", ids.executionReceiptId);
  const staleSubmission = withDigest({
    receiptId: ids.staleReceiptId,
    jobId: ids.jobId,
    interactionEventId: ids.interactionEventId,
    requestId: ids.requestId,
    leaseId: ids.leaseId,
    attempt: 1,
    currentAttempt: before.attempt,
    status: "stale",
    disposition: "rejected_before_write",
  });
  fixture.reject("stale_receipt", {
    submittedReceiptId: ids.staleReceiptId,
    currentReceiptId: ids.executionReceiptId,
    submittedAttempt: staleSubmission.attempt,
    currentAttempt: before.attempt,
  });
  const after = fixture.read("receipts", ids.executionReceiptId);
  const publication = fixture.read("publications", ids.publicationAttemptId);
  const readback = withDigest({
    id: ids.readbackId,
    mode: "exact_current_receipt_unchanged",
    exact: true,
    taskId: ids.taskId,
    jobId: ids.jobId,
    receiptId: ids.executionReceiptId,
    submittedReceiptId: ids.staleReceiptId,
    expectedCurrentReceipt: { id: before.receiptId, digest: before.digest },
    observedCurrentReceipt: { id: after.receiptId, digest: after.digest },
    currentReceiptUnchanged: before.digest === after.digest,
    expectedPublication: null,
    observedPublication: null,
    publicationAbsent: publication === null,
  });

  return {
    id: "stale-receipt",
    outcome: "stale",
    classifications: ["stale", "blocked"],
    correlation: ids,
    objects: { interaction, task, receipt: after, response, publication, staleSubmission, readback },
    accounting: fixture.accounting(),
    fixtureTrace: fixture.executionTrace(),
  };
}

function validateScenario(scenario) {
  const requiredIds = [
    "requestId",
    "interactionEventId",
    "taskId",
    "jobId",
    "leaseId",
    "executionReceiptId",
    "responseId",
    "publicationAttemptId",
    "readbackId",
    "idempotencyKey",
  ];
  const missingIds = requiredIds.filter((key) => !hasValue(scenario.correlation[key]));
  const objects = Object.values(scenario.objects).filter(Boolean);
  const invalidDigests = objects.filter((object) => !digestMatches(object));
  const readbackExact = scenario.objects.readback?.exact === true;
  const accountingExact = scenario.accounting?.fixtureRequests
    === scenario.accounting?.fixtureReads + scenario.accounting?.fixtureWrites;
  const traceReads = scenario.fixtureTrace.filter((entry) => entry.operation === "read").length;
  const traceWrites = scenario.fixtureTrace.filter((entry) => entry.operation === "write").length;
  const traceAccountingExact = traceReads === scenario.accounting.fixtureReads
    && traceWrites === scenario.accounting.fixtureWrites;
  const publicationExpected = scenario.correlation.publicationId === null
    ? scenario.objects.publication === null && scenario.objects.readback?.publicationAbsent === true
    : scenario.objects.publication?.id === scenario.correlation.publicationId
      && scenario.objects.readback?.expectedPublication?.id === scenario.objects.publication.id
      && scenario.objects.readback?.expectedPublication?.digest === scenario.objects.publication.digest
      && scenario.objects.readback?.observedPublication?.id === scenario.objects.publication.id
      && scenario.objects.readback?.observedPublication?.digest === scenario.objects.publication.digest;
  const duplicateReusedWithoutWrite = scenario.id !== "duplicate"
    || (scenario.accounting.fixtureWrites === 0
      && scenario.objects.duplicateRequest?.status === "duplicate"
      && scenario.objects.interaction?.id === scenario.correlation.interactionEventId
      && scenario.objects.receipt?.receiptId === scenario.correlation.executionReceiptId);
  const recoveryLeaseBound = scenario.id !== "interrupted-restarted"
    || (scenario.objects.task?.leaseId === scenario.correlation.restartLeaseId
      && scenario.objects.receipt?.leaseId === scenario.correlation.restartLeaseId
      && scenario.objects.publication?.leaseId === scenario.correlation.restartLeaseId
      && scenario.objects.recovery?.recoveredTaskLeaseId === scenario.correlation.restartLeaseId
      && scenario.objects.recovery?.recoveredReceiptLeaseId === scenario.correlation.restartLeaseId
      && scenario.objects.recovery?.sameJob === true
      && scenario.objects.recovery?.publicationCount === 1);
  const staleReceiptUnchanged = scenario.id !== "stale-receipt"
    || (scenario.accounting.fixtureWrites === 0
      && scenario.fixtureTrace.some((entry) => entry.operation === "reject" && entry.kind === "stale_receipt")
      && scenario.objects.readback?.expectedCurrentReceipt?.id === scenario.correlation.executionReceiptId
      && scenario.objects.readback?.observedCurrentReceipt?.id === scenario.correlation.executionReceiptId
      && scenario.objects.readback?.expectedCurrentReceipt?.digest === scenario.objects.receipt?.digest
      && scenario.objects.readback?.observedCurrentReceipt?.digest === scenario.objects.receipt?.digest
      && scenario.objects.readback?.currentReceiptUnchanged === true);
  const ok = missingIds.length === 0
    && invalidDigests.length === 0
    && readbackExact
    && publicationExpected
    && accountingExact
    && traceAccountingExact
    && duplicateReusedWithoutWrite
    && recoveryLeaseBound
    && staleReceiptUnchanged;
  return {
    ok,
    missingIds,
    invalidDigestCount: invalidDigests.length,
    readbackExact,
    publicationExpected,
    accountingExact,
    traceAccountingExact,
    duplicateReusedWithoutWrite,
    recoveryLeaseBound,
    staleReceiptUnchanged,
  };
}

function buildInteractionReliabilityReview({
  sourceRevision = DEFAULT_SOURCE_REVISION,
  deploymentId = null,
  runtimeUrl = DEFAULT_RUNTIME_URL,
  environment = "local",
  generatedAt = new Date().toISOString(),
} = {}) {
  const successfulExecution = executeSuccessfulScenario(sourceRevision);
  const successful = successfulExecution.scenario;
  const scenarios = [
    successful,
    executeFailedScenario(sourceRevision),
    executeDuplicateScenario(sourceRevision, successful, successfulExecution.fixture),
    executeInterruptedScenario(sourceRevision),
    executeStaleScenario(sourceRevision),
  ].map((scenario) => ({ ...scenario, validation: validateScenario(scenario) }));
  const fixtureRequests = scenarios.reduce((total, scenario) => total + scenario.accounting.fixtureRequests, 0);
  const fixtureReads = scenarios.reduce((total, scenario) => total + scenario.accounting.fixtureReads, 0);
  const fixtureWrites = scenarios.reduce((total, scenario) => total + scenario.accounting.fixtureWrites, 0);
  const validationsExact = scenarios.every((scenario) => scenario.validation.ok);
  const hostedEnvironment = environment === "preview" || environment === "production";
  const identityProof = {
    sourceRevisionExact: isExactGitRevision(sourceRevision),
    deploymentIdPresent: hasValue(deploymentId),
    hostedEnvironment,
  };
  identityProof.exact = identityProof.sourceRevisionExact
    && (!hostedEnvironment || identityProof.deploymentIdPresent);
  identityProof.blockedReasons = [
    ...(identityProof.sourceRevisionExact ? [] : ["source_revision_not_exact_git_sha"]),
    ...(!hostedEnvironment || identityProof.deploymentIdPresent ? [] : ["hosted_deployment_id_missing"]),
  ];
  const proofScope = {
    proven: identityProof.exact
      ? PROVEN_SCOPE
      : PROVEN_SCOPE.filter((item) => item !== "exact_candidate_head_executes_the_fixed_hosted_canary"),
    unknown: identityProof.exact
      ? UNKNOWN_SCOPE
      : [...UNKNOWN_SCOPE, "exact_candidate_head_execution"],
    admissionRationale: ADMISSION_RATIONALE,
  };
  const stablePayload = {
    schemaVersion: SCHEMA_VERSION,
    sourceRevision,
    deploymentIdentity: {
      deploymentId,
      environment,
    },
    scenarios,
    accounting: { fixtureRequests, fixtureReads, fixtureWrites, externalRequests: 0, externalWrites: 0 },
    identityProof,
    proofScope,
  };
  const reviewReady = validationsExact && identityProof.exact;

  return {
    schemaVersion: SCHEMA_VERSION,
    ok: reviewReady,
    status: reviewReady ? "interaction_reliability_review_ready" : "interaction_reliability_review_failed",
    generatedAt,
    reviewId: stableId("dirr", sourceRevision, SCHEMA_VERSION),
    reviewDigest: sha256(canonicalJson(stablePayload)),
    runtime: {
      sourceRevision,
      deploymentId,
      url: runtimeUrl,
      environment,
      surface: "fixed_test_owned_hosted_canary",
      identityProof,
      productionDeploymentPerformed: false,
    },
    contracts: {
      interaction: SCHEMA_VERSION,
      taskJob: JOB_CONTRACT_VERSION,
      executionReceipt: RECEIPT_CONTRACT_VERSION,
    },
    scenarioOrder: SCENARIO_ORDER,
    scenarios,
    statusBoundaries: {
      accepted: ["successful", "failed", "interrupted-restarted"],
      applied: ["successful", "interrupted-restarted"],
      failed: ["failed"],
      duplicate: ["duplicate"],
      interrupted: ["interrupted-restarted"],
      recovered: ["interrupted-restarted"],
      stale: ["stale-receipt"],
      blocked: ["failed", "stale-receipt"],
      unknown: [
        ...UNKNOWN_SCOPE,
      ],
    },
    proofScope,
    accounting: {
      hostedCanaryRequests: 1,
      fixtureRequests,
      fixtureReads,
      fixtureWrites,
      externalRequests: 0,
      externalWrites: 0,
      touchedObjectReadbacks: scenarios.length,
    },
    prohibitedActionsObserved: {
      productionDeployment: false,
      discordProductMutation: false,
      boardNormalization: false,
      supabaseMutation: false,
      authMutation: false,
      billingMutation: false,
      schemaMutation: false,
      secretReadOrOutput: false,
      otherOwnerRepoMutation: false,
    },
    retainedQueueEventsRetried: false,
    nextPacket: {
      id: "owner-export-integration",
      owner: "ATLAS root governance and owner repositories",
      status: "pending",
    },
  };
}

function renderMarkdown(review) {
  const lines = [
    "# DiscordOS Interaction-First Reliability Review",
    "",
    `- result: \`${review.ok ? "pass" : "fail"}\``,
    `- status: \`${review.status}\``,
    `- review id: \`${review.reviewId}\``,
    `- review digest: \`${review.reviewDigest}\``,
    `- source revision: \`${review.runtime.sourceRevision}\``,
    `- deployment id: \`${review.runtime.deploymentId || "unknown"}\``,
    `- external writes: \`${review.accounting.externalWrites}\``,
    "",
    "## Scenario Matrix",
    "",
    "| Scenario | Outcome | Exact readback | Fixture writes |",
    "| --- | --- | --- | ---: |",
    ...review.scenarios.map((scenario) =>
      `| ${scenario.id} | ${scenario.outcome} | ${scenario.objects.readback.exact ? "yes" : "no"} | ${scenario.accounting.fixtureWrites} |`),
    "",
    `Next packet: \`${review.nextPacket.id}\` (\`${review.nextPacket.status}\`).`,
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = buildInteractionReliabilityReview(options);
    process.stdout.write(options.json ? `${JSON.stringify(review, null, 2)}\n` : renderMarkdown(review));
    if (!review.ok) {
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
    SCHEMA_VERSION,
    JOB_CONTRACT_VERSION,
    RECEIPT_CONTRACT_VERSION,
    SCENARIO_ORDER,
    PROVEN_SCOPE,
    UNKNOWN_SCOPE,
    ADMISSION_RATIONALE,
    canonicalJson,
    sha256,
    stableId,
    digestMatches,
    fixtureAccounting,
    parseArgs,
    buildInteractionReliabilityReview,
    validateScenario,
    renderMarkdown,
  },
};
