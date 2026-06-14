const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discord-publication-status");
const {
  _internals: updateTargetInternals,
} = require("../scripts/discord-update-target-admission");

const UPDATES_CHANNEL_ID = "1504671871512346695";
const ALERTS_CHANNEL_ID = "1504671871512346696";

test("discord publication status args default to local read-only status", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    probeLive: false,
  });
  assert.deepEqual(_internals.parseArgs(["--json", "--probe-live"]), {
    json: true,
    probeLive: true,
  });
});

test("discord publication status classifies command toolchain", () => {
  const toolchain = _internals.classifyToolchain();

  assert.equal(toolchain.ok, true);
  assert.equal(toolchain.applyGuard, "enforced");
  assert(toolchain.commands.includes("ops:discord:update-release-check"));
  assert(toolchain.commands.includes("ops:discord:update-post"));
  assert.equal(toolchain.forumCardPreflight, "available");
  assert(toolchain.commands.includes("ops:discord:forum-card-preflight"));
  assert.equal(toolchain.forumCardLifecycle, "available");
  assert(toolchain.commands.includes("ops:discord:forum-card-lifecycle"));
  assert.equal(toolchain.forumCardReleaseCheck, "available");
  assert(toolchain.commands.includes("ops:discord:forum-card-release-check"));
});

test("discord publication status classifies updates and alerts separation", () => {
  assert.deepEqual(_internals.classifyChannelSeparation({
    DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
    DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: ALERTS_CHANNEL_ID,
  }), {
    ok: true,
    status: "separated",
    updatesTargetPresent: true,
    alertBotChannelPresent: true,
    alertWebhookPresent: false,
    alertTargetMode: "discord_bot_channel",
    reasonCodes: [],
  });

  assert.deepEqual(_internals.classifyChannelSeparation({
    DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
    DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: UPDATES_CHANNEL_ID,
  }), {
    ok: false,
    status: "blocked",
    updatesTargetPresent: true,
    alertBotChannelPresent: true,
    alertWebhookPresent: false,
    alertTargetMode: "discord_bot_channel",
    reasonCodes: ["updates_alerts_channel_collision"],
  });
});

test("discord publication status passes locally without live target env", async () => {
  const result = await _internals.buildDiscordPublicationStatus({
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.toolchain.status, "ready");
  assert.equal(result.updatesTarget.ok, false);
  assert.equal(result.alertsTarget.ok, false);
  assert.equal(result.channelSeparation.status, "separated");
});

test("discord publication status blocks local updates and alerts channel collision", async () => {
  const result = await _internals.buildDiscordPublicationStatus({
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.reasonCodes, ["updates_alerts_channel_collision"]);
});

test("discord publication status live-probes updates and alerts targets", async () => {
  const urls = [];
  const result = await _internals.buildDiscordPublicationStatus({
    probeLive: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: ALERTS_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url, init) => {
      urls.push(url);
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Authorization, "Bot bot-secret");
      if (url === `${updateTargetInternals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}`) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: "updates",
            type: 5,
          }),
        };
      }
      assert.equal(url, `${updateTargetInternals.DISCORD_API_BASE}/channels/${ALERTS_CHANNEL_ID}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: "alerts",
          type: 5,
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.probeLive, true);
  assert.equal(result.updatesTarget.liveProbe.status, "reachable");
  assert.equal(result.alertsTarget.liveProbe.status, "reachable");
  assert.equal(result.channelSeparation.status, "separated");
  assert.deepEqual(urls, [
    `${updateTargetInternals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}`,
    `${updateTargetInternals.DISCORD_API_BASE}/channels/${ALERTS_CHANNEL_ID}`,
  ]);
});

test("discord publication status live probe blocks updates target drift", async () => {
  const result = await _internals.buildDiscordPublicationStatus({
    probeLive: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: ALERTS_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url) => {
      if (url === `${updateTargetInternals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}`) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: "alerts",
            type: 5,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: "alerts",
          type: 5,
        }),
      };
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("updates_channel_points_to_alerts"));
});

test("discord publication status renders markdown without target values", async () => {
  const result = await _internals.buildDiscordPublicationStatus({
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID: ALERTS_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Publication Status"));
  assert(rendered.includes("apply guard: `enforced`"));
  assert(rendered.includes("channel separation: `separated`"));
  assert(!rendered.includes("bot-secret"));
  assert(!rendered.includes(UPDATES_CHANNEL_ID));
  assert(!rendered.includes(ALERTS_CHANNEL_ID));
});
