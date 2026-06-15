const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-button-chat-live-canary");

const VALID_INPUT = {
  sessionId: "music-canary-1",
  guildId: "1504668396338413670",
  channelId: "1504671871512346695",
  actorDiscordUserId: "1515220075366580224",
};

test("button chat canary parses live input", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--live",
    "--session-id",
    "music-canary-1",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
  assert.equal(parsed.sessionId, "music-canary-1");
});

test("button chat canary dry run proves button and chat paths without writes", async () => {
  const result = await _internals.buildButtonChatLiveCanary({
    ...VALID_INPUT,
    live: false,
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.stepResults.length, 3);
  assert.equal(result.routeSummary.stepCount, 3);
  assert.equal(result.routeSummary.buttonStepCount, 2);
  assert.equal(result.routeSummary.chatStepCount, 1);
  assert.deepEqual(result.routeSummary.interactionTypes, ["MESSAGE_COMPONENT", "MESSAGE_CREATE"]);
});

test("button chat canary live mode executes guarded queue vote and close writes", async () => {
  const calls = [];
  const result = await _internals.buildButtonChatLiveCanary({
    ...VALID_INPUT,
    live: true,
    env: {
      DISCORDOS_MUSIC_SESH_WRITE_ADAPTER: "enabled",
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/discordos_get_music_sesh_readback")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sessionCount: 1,
            queueItemCount: 1,
            voteCount: 1,
            latestSession: { id: "music-canary-1" },
            latestQueueItem: { id: "queue-1" },
            generatedAt: "2026-06-15T05:00:00.000Z",
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.executesStorageWrite, true);
  assert.equal(result.readback.liveAttempted, true);
  assert.equal(result.routeSummary.slashCommandsAdmitted, false);
  assert.equal(calls.length, 4);
  assert.deepEqual(
    calls.slice(0, 3).map((call) => JSON.parse(call.init.body).payload.action),
    ["queue_item", "vote", "close_session"]
  );
});
