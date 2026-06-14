const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-preflight");

test("music sesh preflight parses queue item inputs", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--session-id",
    "music-third-scope",
    "--action",
    "queue_item",
    "--guild-id",
    "1504668396338413670",
    "--channel-id",
    "1504671871512346695",
    "--actor-user-id",
    "1515220075366580224",
    "--item-title",
    "Track Name",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.action, "queue_item");
  assert.equal(parsed.itemTitle, "Track Name");
});

test("music sesh preflight accepts admitted local contract action", () => {
  const result = _internals.buildDiscordOSMusicSeshPreflight({
    sessionId: "music-third-scope",
    action: "queue_item",
    guildId: "1504668396338413670",
    channelId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    itemTitle: "Track Name",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.liveActionAllowed, false);
  assert.equal(result.providerCallsAllowed, false);
  assert.equal(result.playbackAllowed, false);
  assert.equal(result.persistenceAllowed, false);
  assert.equal(result.event.type, "discordos.music_sesh.preflight_ready");
});

test("music sesh preflight validates vote direction", () => {
  const result = _internals.buildDiscordOSMusicSeshPreflight({
    sessionId: "music-third-scope",
    action: "vote",
    guildId: "1504668396338413670",
    channelId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    voteDirection: "sideways",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("vote_direction_invalid"));
});

test("music sesh preflight blocks invalid snowflake shapes", () => {
  const result = _internals.buildDiscordOSMusicSeshPreflight({
    sessionId: "music-third-scope",
    action: "open_session",
    guildId: "not-a-snowflake",
    channelId: "1504671871512346695",
    actorDiscordUserId: "short",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("guild_id_invalid"));
  assert(result.reasonCodes.includes("actor_user_id_invalid"));
});

test("music sesh preflight render omits raw ids", () => {
  const result = _internals.buildDiscordOSMusicSeshPreflight({
    sessionId: "music-third-scope",
    action: "queue_item",
    guildId: "1504668396338413670",
    channelId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    itemTitle: "Track Name",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Preflight"));
  assert(!rendered.includes("1504668396338413670"));
  assert(!rendered.includes("1515220075366580224"));
});
