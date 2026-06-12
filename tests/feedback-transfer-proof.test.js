const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/feedback-transfer-proof");

test("transfer proof config fails closed outside shadow traffic mode", () => {
  const config = _internals.getTransferProofConfig({
    DISCORDOS_PERSISTED_WRITER_ENABLED: "true",
    DISCORDOS_WRITER_MODE: "shadow",
    DISCORDOS_TRAFFIC_TRANSFER_MODE: "none",
    DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
    DISCORDOS_SUPABASE_ANON_KEY: "anon-test-key",
  });

  assert.equal(config.canAttemptShadowTransferProof, false);
  assert.deepEqual(config.blockedReasons, ["traffic_transfer_mode_not_shadow"]);
});

test("transfer proof config allows proof-only shadow traffic with edge persistence", () => {
  const config = _internals.getTransferProofConfig({
    DISCORDOS_PERSISTED_WRITER_ENABLED: "true",
    DISCORDOS_WRITER_MODE: "shadow",
    DISCORDOS_TRAFFIC_TRANSFER_MODE: "shadow",
    DISCORDOS_SHADOW_PARITY_PROOF_ID: "discordos-shadow-proof",
    DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
    DISCORDOS_SUPABASE_ANON_KEY: "anon-test-key",
  });

  assert.equal(config.canAttemptShadowTransferProof, true);
  assert.equal(config.activationStatus.shadowWorkflowParityProved, true);
  assert.equal(config.activationStatus.liveWorkflowParityProved, false);
});

test("transfer proof parity checks require shadow proof row contract", () => {
  const result = _internals.parityChecksForRow({
    report_id: "shadow-transfer-proof-123",
    status: "new",
    completion_review_status: "not_required",
    reporter_user_kind: "automation",
    runtime_warnings: ["discordos_shadow_transfer_proof_only"],
  });

  assert.deepEqual(result, {
    reportIdentity: true,
    lifecycleState: true,
    reporterReference: true,
    runtimeState: true,
  });
});

test("transfer proof parity checks reject non-proof rows", () => {
  const result = _internals.parityChecksForRow({
    report_id: "feedback-123",
    status: "closed",
    completion_review_status: "approved",
    reporter_user_kind: "unknown",
    runtime_warnings: [],
  });

  assert.equal(result.reportIdentity, false);
  assert.equal(result.lifecycleState, false);
  assert.equal(result.runtimeState, false);
});
