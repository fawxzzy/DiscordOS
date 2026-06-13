const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discord-update-target-admission");

test("updates target admission args default to local validation only", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    probeLive: false,
    expectedName: _internals.DEFAULT_EXPECTED_CHANNEL_NAME,
  });
  assert.deepEqual(_internals.parseArgs(["--json", "--probe-live", "--expected-name", "Updates"]), {
    json: true,
    probeLive: true,
    expectedName: "updates",
  });
});

test("updates target admission validates bot channel shape and token presence", () => {
  assert.deepEqual(_internals.classifyBotChannel({ channelId: "", token: "" }), {
    channelPresent: false,
    tokenPresent: false,
    channelShapeValid: false,
    shapeValid: false,
    reasonCodes: ["updates_channel_id_missing", "bot_token_missing"],
  });
  assert.deepEqual(_internals.classifyBotChannel({ channelId: "123", token: "bot-secret" }), {
    channelPresent: true,
    tokenPresent: true,
    channelShapeValid: false,
    shapeValid: false,
    reasonCodes: ["updates_channel_id_shape_invalid"],
  });
  assert.deepEqual(_internals.classifyBotChannel({
    channelId: "123456789012345678",
    token: "bot-secret",
  }), {
    channelPresent: true,
    tokenPresent: true,
    channelShapeValid: true,
    shapeValid: true,
    reasonCodes: [],
  });
});

test("updates target admission classifies configured target without values", () => {
  assert.deepEqual(_internals.getConfiguredTarget({}), {
    configured: false,
    type: "none",
    shapeValid: false,
    reasonCodes: ["updates_target_missing"],
  });
  assert.deepEqual(_internals.getConfiguredTarget({
    DISCORDOS_UPDATES_CHANNEL_ID: "123456789012345678",
    DISCORDOS_BOT_TOKEN: "bot-secret",
  }), {
    configured: true,
    type: "discord_bot_channel",
    shapeValid: true,
    reasonCodes: [],
  });
});

test("updates target admission classifies channel probe body", () => {
  assert.deepEqual(_internals.classifyChannelProbeBody({ name: "updates", type: 5, guild_id: "guild" }), {
    name: "updates",
    type: 5,
    guildId: "guild",
    nameMatches: true,
    reasonCodes: [],
  });
  assert.deepEqual(_internals.classifyChannelProbeBody({ name: "alerts", type: 5 }), {
    name: "alerts",
    type: 5,
    guildId: null,
    nameMatches: false,
    reasonCodes: ["updates_channel_points_to_alerts"],
  });
  assert.deepEqual(_internals.classifyChannelProbeBody({ name: "general", type: 0 }), {
    name: "general",
    type: 0,
    guildId: null,
    nameMatches: false,
    reasonCodes: ["updates_channel_name_mismatch"],
  });
});

test("updates target admission skips live probe by default", async () => {
  const result = await _internals.buildDiscordUpdateTargetAdmission({
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "123456789012345678",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.liveProbe.status, "skipped");
  assert.equal(result.event.type, "discordos.updates.target_admission_ready");
});

test("updates target admission can live-probe updates channel with read-only GET", async () => {
  const result = await _internals.buildDiscordUpdateTargetAdmission({
    probeLive: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: " 123456789012345678\n",
      DISCORDOS_BOT_TOKEN: " bot-secret\n",
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, `${_internals.DISCORD_API_BASE}/channels/123456789012345678`);
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Authorization, "Bot bot-secret");
      assert.equal(init.body, undefined);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: "updates",
          type: 5,
          guild_id: "guild",
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.liveProbe.attempted, true);
  assert.equal(result.liveProbe.httpStatus, 200);
  assert.equal(result.liveProbe.channel.name, "updates");
});

test("updates target admission rejects live-probed alerts channel", async () => {
  const result = await _internals.buildDiscordUpdateTargetAdmission({
    probeLive: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "123456789012345678",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        name: "alerts",
        type: 5,
      }),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.liveProbe.status, "blocked");
  assert.deepEqual(result.reasonCodes, ["updates_channel_points_to_alerts"]);
});

test("updates target admission reports probe failures", async () => {
  const result = await _internals.buildDiscordUpdateTargetAdmission({
    probeLive: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "123456789012345678",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        message: "Missing Access",
      }),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.liveProbe.httpStatus, 403);
  assert.deepEqual(result.reasonCodes, ["updates_channel_probe_failed"]);
});

test("updates target admission renders markdown without token values", async () => {
  const result = await _internals.buildDiscordUpdateTargetAdmission({
    probeLive: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "123456789012345678",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        name: "updates",
        type: 5,
      }),
    }),
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Updates Target Admission"));
  assert(rendered.includes("channel name: `updates`"));
  assert(!rendered.includes("bot-secret"));
  assert(!rendered.includes("123456789012345678"));
});
