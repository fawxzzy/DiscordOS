const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/activation");

test("activation guard fails closed with no cutover env", () => {
  const status = _internals.getActivationGuardStatus({});

  assert.equal(status.writerMode, "disabled");
  assert.equal(status.trafficTransferMode, "none");
  assert.equal(status.rollbackMode, "fitness-primary");
  assert.equal(status.shadowWorkflowParityProved, false);
  assert.equal(status.liveWorkflowParityProved, false);
  assert.equal(status.liveParityProofIdPresent, false);
  assert.equal(status.liveTrafficProofIdPresent, false);
  assert.equal(status.rollbackExecutionProofIdPresent, false);
  assert.equal(status.writerActivationAllowed, false);
  assert.equal(status.liveCutover, false);
  assert.equal(status.fitnessTrafficMoved, false);
  assert.deepEqual(status.blockedReasons, [
    "writer_mode_not_active",
    "traffic_transfer_not_active",
    "rollback_mode_not_cutover_ready",
    "missing_live_workflow_parity_proof",
    "missing_live_traffic_transfer_proof",
    "missing_rollback_execution_proof",
  ]);
});

test("activation guard keeps shadow mode below live cutover", () => {
  const status = _internals.getActivationGuardStatus({
    DISCORDOS_WRITER_MODE: "shadow",
    DISCORDOS_TRAFFIC_TRANSFER_MODE: "shadow",
    DISCORDOS_ROLLBACK_MODE: "fitness-primary",
    DISCORDOS_SHADOW_PARITY_PROOF_ID: "receipt-shadow-proof",
  });

  assert.equal(status.writerMode, "shadow");
  assert.equal(status.trafficTransferMode, "shadow");
  assert.equal(status.rollbackMode, "fitness-primary");
  assert.equal(status.shadowWorkflowParityProved, true);
  assert.equal(status.liveWorkflowParityProved, false);
  assert.equal(status.liveParityProofIdPresent, false);
  assert.equal(status.liveTrafficProofIdPresent, false);
  assert.equal(status.rollbackExecutionProofIdPresent, false);
  assert.equal(status.writerActivationAllowed, false);
  assert.equal(status.liveCutover, false);
  assert.equal(status.fitnessTrafficMoved, false);
  assert.deepEqual(status.blockedReasons, [
    "writer_mode_not_active",
    "traffic_transfer_not_active",
    "rollback_mode_not_cutover_ready",
    "missing_live_workflow_parity_proof",
    "missing_live_traffic_transfer_proof",
    "missing_rollback_execution_proof",
  ]);
});

test("activation guard rejects invalid mode values", () => {
  const status = _internals.getActivationGuardStatus({
    DISCORDOS_WRITER_MODE: "enabled",
    DISCORDOS_TRAFFIC_TRANSFER_MODE: "yes",
    DISCORDOS_ROLLBACK_MODE: "none",
    DISCORDOS_LIVE_PARITY_PROOF_ID: "receipt-invalid-proof",
  });

  assert.equal(status.writerMode, "disabled");
  assert.equal(status.trafficTransferMode, "none");
  assert.equal(status.rollbackMode, "fitness-primary");
  assert.equal(status.shadowWorkflowParityProved, false);
  assert.equal(status.liveWorkflowParityProved, false);
  assert.equal(status.writerActivationAllowed, false);
  assert.equal(status.liveCutover, false);
  assert.equal(status.fitnessTrafficMoved, false);
  assert.deepEqual(status.blockedReasons, [
    "invalid_writer_mode",
    "invalid_traffic_transfer_mode",
    "invalid_rollback_mode",
    "writer_mode_not_active",
    "traffic_transfer_not_active",
    "rollback_mode_not_cutover_ready",
    "missing_live_traffic_transfer_proof",
    "missing_rollback_execution_proof",
  ]);
});

test("activation guard allows cutover only with active writer, active traffic, rollback, and parity proof", () => {
  const status = _internals.getActivationGuardStatus({
    DISCORDOS_WRITER_MODE: "active",
    DISCORDOS_TRAFFIC_TRANSFER_MODE: "active",
    DISCORDOS_ROLLBACK_MODE: "discordos-primary-with-fitness-rollback",
    DISCORDOS_LIVE_PARITY_PROOF_ID: "receipt-live-parity-proof",
    DISCORDOS_LIVE_TRAFFIC_PROOF_ID: "receipt-live-traffic-proof",
    DISCORDOS_ROLLBACK_EXECUTION_PROOF_ID: "receipt-rollback-execution-proof",
  });

  assert.equal(status.writerMode, "active");
  assert.equal(status.trafficTransferMode, "active");
  assert.equal(status.rollbackMode, "discordos-primary-with-fitness-rollback");
  assert.equal(status.shadowWorkflowParityProved, false);
  assert.equal(status.liveWorkflowParityProved, true);
  assert.equal(status.liveParityProofIdPresent, true);
  assert.equal(status.liveTrafficProofIdPresent, true);
  assert.equal(status.rollbackExecutionProofIdPresent, true);
  assert.equal(status.writerActivationAllowed, true);
  assert.equal(status.liveCutover, true);
  assert.equal(status.fitnessTrafficMoved, true);
  assert.deepEqual(status.blockedReasons, []);
});

test("activation guard blocks active posture without live traffic and rollback receipts", () => {
  const status = _internals.getActivationGuardStatus({
    DISCORDOS_WRITER_MODE: "active",
    DISCORDOS_TRAFFIC_TRANSFER_MODE: "active",
    DISCORDOS_ROLLBACK_MODE: "discordos-primary-with-fitness-rollback",
    DISCORDOS_LIVE_PARITY_PROOF_ID: "receipt-live-parity-proof",
  });

  assert.equal(status.writerMode, "active");
  assert.equal(status.trafficTransferMode, "active");
  assert.equal(status.rollbackMode, "discordos-primary-with-fitness-rollback");
  assert.equal(status.liveWorkflowParityProved, false);
  assert.equal(status.liveParityProofIdPresent, true);
  assert.equal(status.liveTrafficProofIdPresent, false);
  assert.equal(status.rollbackExecutionProofIdPresent, false);
  assert.equal(status.writerActivationAllowed, false);
  assert.equal(status.liveCutover, false);
  assert.equal(status.fitnessTrafficMoved, false);
  assert.deepEqual(status.blockedReasons, [
    "missing_live_traffic_transfer_proof",
    "missing_rollback_execution_proof",
  ]);
});
