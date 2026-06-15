const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-control-post-publish");

test("music sesh control post publish parses double guard flags", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--session-id",
    "session-1",
    "--allow-publish",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.sessionId, "session-1");
  assert.equal(parsed.allowPublish, true);
  assert.equal(parsed.apply, true);
});

test("music sesh control post publish dry run builds button payload without sending", async () => {
  const result = await _internals.buildMusicSeshControlPostPublish({
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.status, "dry_run");
  assert.equal(result.payloadPreview.components[0].components.length, 4);
});

test("music sesh control post publish blocks partial guard", async () => {
  const result = await _internals.buildMusicSeshControlPostPublish({
    allowPublish: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "bot-token",
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("control_post_double_guard_missing"));
});

test("music sesh control post publish sends only after duplicate check passes", async () => {
  const calls = [];
  const result = await _internals.buildMusicSeshControlPostPublish({
    allowPublish: true,
    apply: true,
    env: {
      DISCORDOS_MUSIC_SESH_CONTROL_POST: "enabled",
      DISCORDOS_BOT_TOKEN: "bot-token",
      DISCORDOS_MUSIC_SESH_CHANNEL_ID: "1504671871512346695",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (init.method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "1516000000000000000",
          channel_id: "1504671871512346695",
          timestamp: "2026-06-15T05:00:00.000000+00:00",
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, true);
  assert.equal(result.sendResult.messageId, "1516000000000000000");
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].init.body).components[0].components[0].custom_id, "music_sesh:queue");
});

test("music sesh control post publish blocks duplicate title", async () => {
  const result = await _internals.buildMusicSeshControlPostPublish({
    allowPublish: true,
    apply: true,
    env: {
      DISCORDOS_MUSIC_SESH_CONTROL_POST: "enabled",
      DISCORDOS_BOT_TOKEN: "bot-token",
      DISCORDOS_MUSIC_SESH_CHANNEL_ID: "1504671871512346695",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "1516000000000000000",
          channel_id: "1504671871512346695",
          embeds: [{ title: "Music Sesh Control Post" }],
        },
      ],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.duplicateCheck.status, "duplicate_found");
  assert(result.reasonCodes.includes("control_post_duplicate_title_found"));
});
