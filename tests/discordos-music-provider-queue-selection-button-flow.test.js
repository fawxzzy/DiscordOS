const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-selection-button-flow");

test("provider queue selection button flow creates no-slash buttons", async () => {
  const result = await _internals.buildMusicProviderQueueSelectionButtonFlow();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.selectionButtonCount, 1);
  assert(result.buttons[0].customId.startsWith("music_sesh:provider_select:"));
  assert.equal(result.queueSelectionPlans[0].selectionQueuesMetadata, true);
});

test("provider queue selection button validation blocks unsafe buttons", () => {
  const reasonCodes = _internals.validateSelectionButtons([
    {
      customId: "bad",
      controlsPlayback: true,
      slashCommandsAdmitted: true,
    },
  ]);

  assert(reasonCodes.includes("selection_button_provider_track_id_missing:0"));
  assert(reasonCodes.includes("selection_button_custom_id_invalid:0"));
  assert(reasonCodes.includes("selection_button_controls_playback:0"));
  assert(reasonCodes.includes("selection_button_slash_command_admitted:0"));
});
