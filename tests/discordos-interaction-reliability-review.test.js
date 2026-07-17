const assert = require("node:assert/strict");
const test = require("node:test");

const handler = require("../api/runtime-health");
const {
  _internals,
} = require("../scripts/discordos-interaction-reliability-review");

const REVISION = "a".repeat(40);

function buildReview() {
  return _internals.buildInteractionReliabilityReview({
    sourceRevision: REVISION,
    deploymentId: "dpl_test_owned",
    runtimeUrl: "https://preview.example.test",
    environment: "preview",
    generatedAt: "2026-07-17T00:00:00.000Z",
  });
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return value;
    },
  };
}

test("review proves exactly the five frozen scenarios with complete correlation", () => {
  const review = buildReview();

  assert.equal(review.ok, true);
  assert.deepEqual(review.scenarioOrder, _internals.SCENARIO_ORDER);
  assert.deepEqual(review.scenarios.map((scenario) => scenario.id), _internals.SCENARIO_ORDER);
  assert.equal(review.scenarios.length, 5);
  for (const scenario of review.scenarios) {
    assert.equal(scenario.validation.ok, true);
    assert.equal(scenario.objects.readback.exact, true);
    assert.equal(
      scenario.fixtureTrace.filter((entry) => entry.operation === "read").length,
      scenario.accounting.fixtureReads,
    );
    assert.equal(
      scenario.fixtureTrace.filter((entry) => entry.operation === "write").length,
      scenario.accounting.fixtureWrites,
    );
    assert.match(scenario.correlation.requestId, /^dirq_[0-9a-f]{24}$/);
    assert.match(scenario.correlation.interactionEventId, /^dievt_[0-9a-f]{24}$/);
    assert.match(scenario.correlation.taskId, /^ditask_[0-9a-f]{24}$/);
    assert.match(scenario.correlation.jobId, /^dijob_[0-9a-f]{24}$/);
    assert.match(scenario.correlation.executionReceiptId, /^direceipt_[0-9a-f]{24}$/);
    assert.match(scenario.correlation.responseId, /^diresponse_[0-9a-f]{24}$/);
    assert.match(scenario.correlation.publicationAttemptId, /^dipubattempt_[0-9a-f]{24}$/);
    assert.match(scenario.correlation.readbackId, /^diread_[0-9a-f]{24}$/);
  }
});

test("identical builds are deterministic apart from generated time", () => {
  const first = buildReview();
  const second = _internals.buildInteractionReliabilityReview({
    sourceRevision: REVISION,
    deploymentId: "dpl_test_owned",
    runtimeUrl: "https://preview.example.test",
    environment: "preview",
    generatedAt: "2026-07-17T01:00:00.000Z",
  });

  assert.equal(first.reviewId, second.reviewId);
  assert.equal(first.reviewDigest, second.reviewDigest);
  assert.deepEqual(first.scenarios, second.scenarios);
});

test("validation recomputes object digests and publication readback", () => {
  const scenario = structuredClone(buildReview().scenarios[0]);
  scenario.objects.publication.status = "tampered";

  const validation = _internals.validateScenario(scenario);
  assert.equal(validation.ok, false);
  assert.equal(validation.invalidDigestCount, 1);
  assert.equal(validation.publicationExpected, true);

  scenario.objects.readback.observedPublication.digest = "sha256:" + "0".repeat(64);
  assert.equal(_internals.validateScenario(scenario).publicationExpected, false);

  scenario.fixtureTrace.pop();
  assert.equal(_internals.validateScenario(scenario).traceAccountingExact, false);
});

test("duplicate replay reuses terminal identities with zero writes", () => {
  const review = buildReview();
  const successful = review.scenarios.find((scenario) => scenario.id === "successful");
  const duplicate = review.scenarios.find((scenario) => scenario.id === "duplicate");

  assert.notEqual(duplicate.correlation.requestId, successful.correlation.requestId);
  assert.equal(duplicate.correlation.duplicateOfRequestId, successful.correlation.requestId);
  assert.equal(duplicate.correlation.interactionEventId, successful.correlation.interactionEventId);
  assert.equal(duplicate.correlation.executionReceiptId, successful.correlation.executionReceiptId);
  assert.equal(duplicate.objects.duplicateRequest.status, "duplicate");
  assert.deepEqual(duplicate.objects.task, successful.objects.task);
  assert.deepEqual(duplicate.objects.receipt, successful.objects.receipt);
  assert.deepEqual(duplicate.objects.response, successful.objects.response);
  assert.deepEqual(duplicate.objects.publication, successful.objects.publication);
  assert.deepEqual(duplicate.objects.readback, successful.objects.readback);
  assert.equal(duplicate.accounting.fixtureWrites, 0);
});

test("interrupted task recovers once under the same job", () => {
  const scenario = buildReview().scenarios.find((row) => row.id === "interrupted-restarted");

  assert.equal(scenario.objects.interruptedReceipt.status, "interrupted");
  assert.equal(scenario.objects.recovery.status, "recovered");
  assert.equal(scenario.objects.recovery.sameJob, true);
  assert.equal(scenario.objects.recovery.publicationCount, 1);
  assert.equal(scenario.objects.task.leaseId, scenario.correlation.restartLeaseId);
  assert.equal(scenario.objects.receipt.leaseId, scenario.correlation.restartLeaseId);
  assert.equal(scenario.objects.recovery.recoveredReceiptLeaseId, scenario.correlation.restartLeaseId);
  assert.equal(scenario.objects.readback.exact, true);
});

test("stale receipt is rejected before writes and preserves current receipt", () => {
  const scenario = buildReview().scenarios.find((row) => row.id === "stale-receipt");

  assert.equal(scenario.objects.staleSubmission.disposition, "rejected_before_write");
  assert.equal(scenario.objects.readback.currentReceiptUnchanged, true);
  assert.equal(scenario.objects.readback.expectedCurrentReceipt.id, scenario.correlation.executionReceiptId);
  assert.equal(scenario.objects.readback.observedCurrentReceipt.id, scenario.correlation.executionReceiptId);
  assert.equal(scenario.objects.readback.expectedCurrentReceipt.digest, scenario.objects.receipt.digest);
  assert.equal(scenario.objects.readback.observedCurrentReceipt.digest, scenario.objects.receipt.digest);
  assert.equal(scenario.accounting.fixtureWrites, 0);
  assert.equal(scenario.objects.publication, null);
});

test("status boundaries and prohibited-action proof remain explicit", () => {
  const review = buildReview();

  assert.deepEqual(review.statusBoundaries.failed, ["failed"]);
  assert.deepEqual(review.statusBoundaries.duplicate, ["duplicate"]);
  assert.deepEqual(review.statusBoundaries.stale, ["stale-receipt"]);
  assert(review.statusBoundaries.unknown.includes("real_user_interactions_outside_the_fixed_canary"));
  assert(review.proofScope.unknown.includes("production_message_command_path_adoption"));
  assert.match(review.proofScope.admissionRationale, /does not claim production-path adoption/);
  assert.equal(review.accounting.fixtureRequests, 31);
  assert.equal(review.accounting.fixtureReads, 12);
  assert.equal(review.accounting.fixtureWrites, 19);
  assert.equal(review.accounting.externalWrites, 0);
  assert(Object.values(review.prohibitedActionsObserved).every((value) => value === false));
  assert.equal(review.retainedQueueEventsRetried, false);
  assert.equal(review.nextPacket.id, "owner-export-integration");
});

test("hosted canary endpoint is GET-only and side-effect free", async () => {
  const previous = {
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
  };
  process.env.VERCEL_GIT_COMMIT_SHA = REVISION;
  process.env.VERCEL_DEPLOYMENT_ID = "dpl_test_owned";
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_URL = "preview.example.test";

  const response = responseRecorder();
  try {
    await handler({ method: "GET", query: { surface: "interaction-reliability-review" } }, response);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-discordos-canary"], "interaction-reliability-review-v1");
  assert.equal(response.headers["x-discordos-review-id"], response.body.reviewId);
  assert.equal(response.headers["x-discordos-review-digest"], response.body.reviewDigest);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.accounting.externalWrites, 0);

  const rejected = responseRecorder();
  await handler({ method: "POST", query: { surface: "interaction-reliability-review" } }, rejected);
  assert.equal(rejected.statusCode, 405);
  assert.equal(rejected.body.error, "METHOD_NOT_ALLOWED");
});

test("hosted proof fails closed without an exact deployed source revision", () => {
  const review = _internals.buildInteractionReliabilityReview({
    sourceRevision: "UNKNOWN",
    deploymentId: "dpl_unknown_source",
    runtimeUrl: "https://preview.example.test",
    environment: "preview",
    generatedAt: "2026-07-17T00:00:00.000Z",
  });

  assert.equal(review.ok, false);
  assert.equal(review.runtime.identityProof.sourceRevisionExact, false);
  assert(review.runtime.identityProof.blockedReasons.includes("source_revision_not_exact_git_sha"));
  assert(!review.proofScope.proven.includes("exact_candidate_head_executes_the_fixed_hosted_canary"));
  assert(review.proofScope.unknown.includes("exact_candidate_head_execution"));
});

test("hosted endpoint returns a failed receipt when deployed source identity is absent", async () => {
  const previous = {
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  process.env.VERCEL_DEPLOYMENT_ID = "dpl_unknown_source";
  process.env.VERCEL_ENV = "preview";
  const response = responseRecorder();

  try {
    await handler({ method: "GET", query: { surface: "interaction-reliability-review" } }, response);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.runtime.identityProof.exact, false);
  assert(response.body.runtime.identityProof.blockedReasons.includes("source_revision_not_exact_git_sha"));
});

test("hosted canary dispatch requires the exact frozen runtime-health selector", () => {
  assert.equal(handler._internals.isInteractionReliabilityReviewRequest({
    query: { surface: "interaction-reliability-review" },
  }), true);
  assert.equal(handler._internals.isInteractionReliabilityReviewRequest({
    query: { surface: "interaction-reliability-review-extra" },
  }), false);
  assert.equal(handler._internals.isInteractionReliabilityReviewRequest({ query: {} }), false);
});

test("CLI arguments reject unsupported or malformed values", () => {
  assert.throws(() => _internals.parseArgs(["--unknown"]), /unsupported_argument/);
  assert.throws(() => _internals.parseArgs(["--generated-at", "not-a-date"]), /invalid_generated_at/);
  const parsed = _internals.parseArgs(["--json", "--source-revision", REVISION]);
  assert.equal(parsed.json, true);
  assert.equal(parsed.sourceRevision, REVISION);
});
