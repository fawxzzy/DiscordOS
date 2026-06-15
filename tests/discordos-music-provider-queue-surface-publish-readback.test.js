const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-queue-surface-publish-readback");

test("provider queue surface publish readback defaults to no-send preview", async () => {
  const result = await _internals.buildMusicProviderQueueSurfacePublishReadback();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.plan.allowedMentionsDisabled, true);
  assert.equal(result.plan.buttonCount, 1);
});

test("provider queue surface publish readback supports guarded live mode", async () => {
  const result = await _internals.buildMusicProviderQueueSurfacePublishReadback({ live: true });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, true);
  assert.equal(result.callsDiscordApi, true);
  assert.equal(result.plan.mode, "guarded_live_publish_readback");
  assert.equal(result.controlsPlayback, false);
});
