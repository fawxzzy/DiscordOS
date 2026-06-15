const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-control-post");

test("music sesh control post parses channel and session", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--channel-name", "music-sesh",
    "--session-id", "session-1",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.channelName, "music-sesh");
  assert.equal(parsed.sessionId, "session-1");
});

test("music sesh control post builds button payload without sending", () => {
  const result = _internals.buildMusicSeshControlPost();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.buttonCount, 4);
  assert(result.interactionTypes.includes("MESSAGE_COMPONENT"));
  assert(result.payloadPreview.components[0].components.some((button) => button.custom_id === "music_sesh:queue"));
});

test("music sesh control post renders bounded markdown", () => {
  const result = _internals.buildMusicSeshControlPost();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Control Post"));
  assert(rendered.includes("slash commands admitted: `false`"));
  assert(rendered.includes("button music_sesh_queue"));
});
