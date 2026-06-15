const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-channel-target-status");

test("music sesh channel target parses config path", () => {
  const parsed = _internals.parseArgs(["--json", "--config", "config/custom.json"]);

  assert.equal(parsed.json, true);
  assert(parsed.configPath.endsWith("config\\custom.json") || parsed.configPath.endsWith("config/custom.json"));
});

test("music sesh channel target validates committed target", async () => {
  const result = await _internals.buildMusicSeshChannelTargetStatus();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.status, "channel_target_ready");
  assert.equal(result.channelId, "1516089950787862689");
  assert.equal(result.slashCommandsAdmitted, false);
});

test("music sesh channel target rejects slash admission", () => {
  const status = _internals.buildTargetStatus({
    version: 1,
    target: {
      id: "target",
      guildId: "1504668396338413670",
      categoryId: "1516089949286568007",
      categoryName: "Music Sesh",
      channelId: "1516089950787862689",
      channelName: "music-sesh",
      slashCommandsAdmitted: true,
    },
  });

  assert.equal(status.ok, false);
  assert(status.reasonCodes.includes("slash_commands_must_remain_disabled"));
});

test("music sesh channel target renders bounded markdown", async () => {
  const result = await _internals.buildMusicSeshChannelTargetStatus();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Channel Target"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("slash commands admitted: `false`"));
});
