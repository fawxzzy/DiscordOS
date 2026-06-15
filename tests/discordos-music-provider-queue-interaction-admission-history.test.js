const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-interaction-admission-history");

test("provider queue interaction admission history tracks metadata-only records", async () => {
  const result = await _internals.buildMusicProviderQueueInteractionAdmissionHistory();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.history.historyStatus, "bounded_ready");
  assert.equal(result.history.recordCount, 1);
  assert.equal(result.history.records[0].queuesMetadataOnly, true);
  assert.equal(result.history.records[0].liveExecutionAttempted, false);
});

test("provider queue interaction admission history rejects provider boundary drift", () => {
  const reasonCodes = _internals.validateProviderQueueAdmissionHistory({
    dashboardResult: {
      reasonCodes: [],
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
    history: {
      historyStatus: "bounded_ready",
      recordCount: 1,
      maxRecords: 10,
      records: [
        {
          customIdVisible: true,
          providerTrackMetadataVisible: true,
          signatureProofVisible: true,
          queuesMetadataOnly: true,
          liveExecutionAttempted: true,
          noProviderBoundaryConfirmed: true,
          noPlaybackBoundaryConfirmed: true,
        },
      ],
      repeatsTracked: true,
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("provider_queue_interaction_admission_history_record_invalid"));
});
