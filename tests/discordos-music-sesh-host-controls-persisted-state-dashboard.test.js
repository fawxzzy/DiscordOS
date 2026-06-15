const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-host-controls-persisted-state-dashboard");

test("host controls persisted state dashboard builds from canary preview", async () => {
  const result = await _internals.buildMusicSeshHostControlsPersistedStateDashboard();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.dashboard.modeledSessionState, "closed");
  assert.equal(result.dashboard.modeledQueueItemCount, 1);
  assert.equal(result.dashboard.modeledVoteCount, 1);
  assert.equal(result.dashboard.payloadsParameterized, true);
});

test("host controls persisted state dashboard renders bounded markdown", async () => {
  const result = await _internals.buildMusicSeshHostControlsPersistedStateDashboard();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Host Controls Persisted State Dashboard"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("modeled state: `closed`"));
});
