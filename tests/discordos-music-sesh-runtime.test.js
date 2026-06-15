const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-runtime");

test("music sesh runtime parses queue workflow inputs", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--session-id",
    "music-1",
    "--action",
    "queue_item",
    "--guild-id",
    "1504668396338413670",
    "--channel-id",
    "1504671871512346695",
    "--actor-user-id",
    "1515220075366580224",
    "--item-title",
    "TrackName",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.action, "queue_item");
  assert.equal(parsed.itemTitle, "TrackName");
});

test("music sesh runtime builds no-provider queue workflow", () => {
  const result = _internals.buildMusicSeshRuntime({
    sessionId: "music-1",
    action: "queue_item",
    guildId: "1504668396338413670",
    channelId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    itemTitle: "TrackName",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.workflow.queueItemCountDelta, 1);
});

test("music sesh runtime blocks invalid vote direction", () => {
  const result = _internals.buildMusicSeshRuntime({
    sessionId: "music-1",
    action: "vote",
    guildId: "1504668396338413670",
    channelId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    voteDirection: "sideways",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("vote_direction_invalid"));
});

test("music sesh runtime renders bounded markdown", () => {
  const result = _internals.buildMusicSeshRuntime({
    sessionId: "music-1",
    action: "open_session",
    guildId: "1504668396338413670",
    channelId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Runtime"));
  assert(rendered.includes("sends messages: `false`"));
});
