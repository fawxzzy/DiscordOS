const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-provider-selection-to-queue-live-canary");

test("provider selection to queue live canary queues metadata without playback", async () => {
  const result = await _internals.buildMusicProviderSelectionToQueueLiveCanary();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.selection.queuesMetadata, true);
  assert.equal(result.writeAdapter.storageWriteStatus, "not_requested");
});

test("provider selection to queue builds queue write input", () => {
  const input = _internals.buildWriteInputFromSelection({
    selection: {
      title: "Selected Track",
    },
    input: {
      sessionId: "session-1",
      guildId: "guild-1",
      channelId: "channel-1",
      actorDiscordUserId: "actor-1",
      allowStorageWrite: true,
      apply: true,
    },
  });

  assert.equal(input.action, "queue_item");
  assert.equal(input.itemTitle, "Selected Track");
  assert.equal(input.allowStorageWrite, true);
  assert.equal(input.apply, true);
});
