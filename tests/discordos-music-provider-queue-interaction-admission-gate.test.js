const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-admission-gate");

test("provider queue interaction admission gate admits metadata-only signed canary", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionAdmissionGate();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.gate.admitted, true);
  assert.equal(result.gate.liveExecutionAttempted, false);
});

test("provider queue interaction admission gate blocks provider side effects", () => {
  const reasonCodes = _internals.validateInteractionAdmissionGate({
    canary: { reasonCodes: [], slashCommandsAdmitted: false },
    gate: {
      admitted: true,
      liveExecutionAttempted: false,
      callsMusicProviders: true,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_admission_side_effect_boundary_failed"));
});
