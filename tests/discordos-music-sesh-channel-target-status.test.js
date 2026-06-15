const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-channel-target-status");

test("music sesh channel target parses config path", () => {
  const parsed = _internals.parseArgs(["--json", "--config", "config/custom.json", "--require-env"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.requireEnv, true);
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
  assert.equal(result.envContract.operatorProvidedIdsRequired, false);
  assert.equal(result.envContract.runtimeResolutionSource, "committed_config");
});

test("music sesh channel target validates matching env contract", async () => {
  const result = await _internals.buildMusicSeshChannelTargetStatus({
    requireEnv: true,
    env: {
      DISCORDOS_MUSIC_SESH_GUILD_ID: "1504668396338413670",
      DISCORDOS_MUSIC_SESH_CATEGORY_ID: "1516089949286568007",
      DISCORDOS_MUSIC_SESH_CHANNEL_ID: "1516089950787862689",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.envContract.requireEnv, true);
  assert(result.envContract.variables.every((entry) => entry.matches));
});

test("music sesh channel target reports env mismatches", () => {
  const contract = _internals.buildEnvContract(
    {
      guildId: "1504668396338413670",
      categoryId: "1516089949286568007",
      channelId: "1516089950787862689",
    },
    {
      requireEnv: true,
      env: {
        DISCORDOS_MUSIC_SESH_GUILD_ID: "wrong",
      },
    }
  );

  assert.equal(contract.ok, false);
  assert(contract.reasonCodes.includes("discordos_music_sesh_guild_id_mismatch"));
  assert(contract.reasonCodes.includes("discordos_music_sesh_category_id_missing"));
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
  assert(rendered.includes("operator-provided ids required: `false`"));
});
