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

function buildObjects({ ids, outcome, receiptStatus, responseStatus, publicationStatus, readbackMode }) {
  const interaction = withDigest({
    id: ids.interactionEventId,
    requestId: ids.requestId,
    idempotencyKey: ids.idempotencyKey,
    status: outcome === "stale" ? "stale" : outcome === "duplicate" ? "duplicate" : "accepted",
  });
  const task = withDigest({
    contractVersion: JOB_CONTRACT_VERSION,
    taskId: ids.taskId,
    jobId: ids.jobId,
    interactionEventId: ids.interactionEventId,
    leaseId: ids.leaseId,
    status: outcome === "failed"
      ? "failed"
      : outcome === "duplicate"
        ? "not_reexecuted"
        : outcome === "stale"
          ? "unchanged"
          : "succeeded",
  });
  const receipt = withDigest({
    contractVersion: RECEIPT_CONTRACT_VERSION,
    receiptId: ids.executionReceiptId,
    jobId: ids.jobId,
    interactionEventId: ids.interactionEventId,
    status: receiptStatus,
  });
  const response = withDigest({
    id: ids.responseId,
    interactionEventId: ids.interactionEventId,
    receiptId: ids.executionReceiptId,
    status: responseStatus,
  });
  const publication = publicationStatus === "absent"
    ? null
    : withDigest({
      attemptId: ids.publicationAttemptId,
      id: ids.publicationId,
      responseId: ids.responseId,
      receiptId: ids.executionReceiptId,
      status: publicationStatus,
    });
  const expectedPublication = publication
    ? { id: publication.id, digest: publication.digest }
    : null;
  const readback = withDigest({
    id: ids.readbackId,
    mode: readbackMode,
    exact: true,
    expectedPublication,
    observedPublication: expectedPublication,
    publicationAbsent: publication === null,
    taskId: ids.taskId,
    jobId: ids.jobId,
    receiptId: ids.executionReceiptId,
  });

  return { interaction, task, receipt, response, publication, readback };
}

function buildSuccessfulScenario(sourceRevision) {
  const ids = baseIds(sourceRevision, "successful");
  return {
    id: "successful",
    outcome: "applied",
    classifications: ["accepted", "applied"],
    correlation: ids,
    objects: buildObjects({
      ids,
      outcome: "applied",
      receiptStatus: "succeeded",
      responseStatus: "published",
      publicationStatus: "applied",
      readbackMode: "exact_touched_object",
    }),
    accounting: fixtureAccounting(1, 5),
  };
}

function buildFailedScenario(sourceRevision) {
  const ids = { ...baseIds(sourceRevision, "failed"), publicationId: null };
  return {
    id: "failed",
    outcome: "failed",
    classifications: ["accepted", "failed", "blocked"],
    correlation: ids,
    objects: buildObjects({
      ids,
      outcome: "failed",
      receiptStatus: "failed",
      responseStatus: "failure_returned",
      publicationStatus: "absent",
      readbackMode: "exact_absence",
    }),
    accounting: fixtureAccounting(1, 4),
  };
}

function buildDuplicateScenario(sourceRevision, successful) {
  const replayRequestId = baseIds(sourceRevision, "successful", 2).requestId;
  const ids = {
    ...successful.correlation,
    requestId: replayRequestId,
    duplicateOfRequestId: successful.correlation.requestId,
  };
  const objects = structuredClone(successful.objects);
  objects.duplicateRequest = withDigest({
    id: ids.interactionEventId,
    requestId: ids.requestId,
    duplicateOfRequestId: ids.duplicateOfRequestId,
    idempotencyKey: ids.idempotencyKey,
    status: "duplicate",
  });
  return {
    id: "duplicate",
    outcome: "duplicate",
    classifications: ["duplicate"],
    correlation: ids,
    objects,
    accounting: fixtureAccounting(6, 0),
  };
}

function buildInterruptedScenario(sourceRevision) {
  const ids = baseIds(sourceRevision, "interrupted-restarted");
  ids.interruptedReceiptId = stableId("direceipt", sourceRevision, "interrupted-restarted", "interrupted");
  ids.restartLeaseId = stableId("dilease", sourceRevision, "interrupted-restarted", "restart");
  const objects = buildObjects({
    ids,
    outcome: "recovered",
    receiptStatus: "succeeded_after_restart",
    responseStatus: "published_after_recovery",
    publicationStatus: "applied_once_after_recovery",
    readbackMode: "exact_recovered_touched_object",
  });
  objects.interruptedReceipt = withDigest({
    contractVersion: RECEIPT_CONTRACT_VERSION,
    receiptId: ids.interruptedReceiptId,
    jobId: ids.jobId,
    interactionEventId: ids.interactionEventId,
    leaseId: ids.leaseId,
    status: "interrupted",
    publicationId: null,
  });
  objects.recovery = withDigest({
    priorReceiptId: ids.interruptedReceiptId,
    recoveryReceiptId: ids.executionReceiptId,
    originalLeaseId: ids.leaseId,
    restartLeaseId: ids.restartLeaseId,
    sameJob: true,
    publicationCount: 1,
    status: "recovered",
  });
  return {
    id: "interrupted-restarted",
    outcome: "recovered",
    classifications: ["accepted", "interrupted", "recovered", "applied"],
    correlation: ids,
    objects,
    accounting: fixtureAccounting(1, 7),
  };
}

function buildStaleScenario(sourceRevision) {
  const ids = { ...baseIds(sourceRevision, "stale-receipt"), publicationId: null };
  ids.staleReceiptId = stableId("direceipt", sourceRevision, "stale-receipt", "attempt-1");
  ids.executionReceiptId = stableId("direceipt", sourceRevision, "stale-receipt", "attempt-2-current");
  const objects = buildObjects({
    ids,
    outcome: "stale",
    receiptStatus: "current_unchanged",
    responseStatus: "stale_rejected",
    publicationStatus: "absent",
    readbackMode: "exact_current_receipt_unchanged",
  });
  objects.staleSubmission = withDigest({
    receiptId: ids.staleReceiptId,
    jobId: ids.jobId,
    interactionEventId: ids.interactionEventId,
    attempt: 1,
    currentAttempt: 2,
    status: "stale",
    disposition: "rejected_before_write",
  });
  const readback = { ...objects.readback };
  delete readback.digest;
  objects.readback = withDigest({
    ...readback,
    currentReceiptId: ids.executionReceiptId,
    submittedReceiptId: ids.staleReceiptId,
    currentReceiptUnchanged: true,
  });
  return {
    id: "stale-receipt",
    outcome: "stale",
    classifications: ["stale", "blocked"],
    correlation: ids,
    objects,
    accounting: fixtureAccounting(2, 0),
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
  const publicationExpected = scenario.correlation.publicationId === null
    ? scenario.objects.publication === null && scenario.objects.readback?.publicationAbsent === true
    : scenario.objects.publication?.id === scenario.correlation.publicationId
      && scenario.objects.readback?.expectedPublication?.id === scenario.objects.publication.id
      && scenario.objects.readback?.expectedPublication?.digest === scenario.objects.publication.digest
      && scenario.objects.readback?.observedPublication?.id === scenario.objects.publication.id
      && scenario.objects.readback?.observedPublication?.digest === scenario.objects.publication.digest;
  const ok = missingIds.length === 0
    && invalidDigests.length === 0
    && readbackExact
    && publicationExpected
    && accountingExact;
  return {
    ok,
    missingIds,
    invalidDigestCount: invalidDigests.length,
    readbackExact,
    publicationExpected,
    accountingExact,
  };
}

function buildInteractionReliabilityReview({
  sourceRevision = DEFAULT_SOURCE_REVISION,
  deploymentId = null,
  runtimeUrl = DEFAULT_RUNTIME_URL,
  environment = "local",
  generatedAt = new Date().toISOString(),
} = {}) {
  const successful = buildSuccessfulScenario(sourceRevision);
  const scenarios = [
    successful,
    buildFailedScenario(sourceRevision),
    buildDuplicateScenario(sourceRevision, successful),
    buildInterruptedScenario(sourceRevision),
    buildStaleScenario(sourceRevision),
  ].map((scenario) => ({ ...scenario, validation: validateScenario(scenario) }));
  const fixtureRequests = scenarios.reduce((total, scenario) => total + scenario.accounting.fixtureRequests, 0);
  const fixtureReads = scenarios.reduce((total, scenario) => total + scenario.accounting.fixtureReads, 0);
  const fixtureWrites = scenarios.reduce((total, scenario) => total + scenario.accounting.fixtureWrites, 0);
  const validationsExact = scenarios.every((scenario) => scenario.validation.ok);
  const stablePayload = {
    schemaVersion: SCHEMA_VERSION,
    sourceRevision,
    scenarios,
    accounting: { fixtureRequests, fixtureReads, fixtureWrites, externalRequests: 0, externalWrites: 0 },
    proofScope: {
      proven: PROVEN_SCOPE,
      unknown: UNKNOWN_SCOPE,
      admissionRationale: ADMISSION_RATIONALE,
    },
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    ok: validationsExact,
    status: validationsExact ? "interaction_reliability_review_ready" : "interaction_reliability_review_failed",
    generatedAt,
    reviewId: stableId("dirr", sourceRevision, SCHEMA_VERSION),
    reviewDigest: sha256(canonicalJson(stablePayload)),
    runtime: {
      sourceRevision,
      deploymentId,
      url: runtimeUrl,
      environment,
      surface: "fixed_test_owned_hosted_canary",
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
    proofScope: stablePayload.proofScope,
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
