const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-storage-contract");

test("music sesh storage contract parses runtime identity", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--session-id",
    "music-storage-1",
    "--guild-id",
    "1504668396338413670",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.sessionId, "music-storage-1");
  assert.equal(parsed.guildId, "1504668396338413670");
});

test("music sesh storage contract builds guarded readback plan", () => {
  const result = _internals.buildMusicSeshStorageContract({
    sessionId: "music-storage-1",
    action: "queue_item",
    guildId: "1504668396338413670",
    channelId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    itemTitle: "Track",
  });

  assert.equal(result.ok, true);
  assert.equal(result.writesStorage, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.status, "storage_contract_ready");
  assert.equal(result.tables.length, 3);
  assert.equal(result.readbackPlan.rpc, "discordos_read_music_sesh_state");
});

test("music sesh storage contract renders bounded markdown", () => {
  const result = _internals.buildMusicSeshStorageContract({
    sessionId: "music-storage-1",
    action: "queue_item",
    guildId: "1504668396338413670",
    channelId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    itemTitle: "Track",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Storage Contract"));
  assert(rendered.includes("writes storage: `false`"));
  assert(rendered.includes("discordos.discordos_music_sesh_sessions"));
});
