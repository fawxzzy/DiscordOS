const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-selection-user-button-surface");

test("provider queue selection user button surface builds no-slash button payload", async () => {
  const result = await _internals.buildMusicProviderQueueSelectionUserButtonSurface();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.surface.buttonCount, 1);
  assert.equal(result.surface.payloadPreview.allowed_mentions.parse.length, 0);
  assert.match(result.surface.buttons[0].customId, /^music_sesh:provider_select:/);
});

test("provider queue selection user button surface rejects unsafe mentions", () => {
  const reasonCodes = _internals.validateUserButtonSurface({
    canary: {
      reasonCodes: [],
      sendsMessages: false,
      callsMusicProviders: false,
      controlsPlayback: false,
      slashCommandsAdmitted: false,
    },
    surface: {
      buttons: [
        {
          providerTrackId: "track-1",
          customId: "music_sesh:provider_select:track-1",
          controlsPlayback: false,
          slashCommandsAdmitted: false,
        },
      ],
      payloadPreview: {
        allowed_mentions: { parse: ["users"] },
      },
    },
  });

  assert(reasonCodes.includes("provider_queue_user_button_surface_mentions_not_disabled"));
});
