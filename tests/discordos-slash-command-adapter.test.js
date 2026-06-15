const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-slash-command-adapter");

test("slash command adapter parses board command", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--surface",
    "board",
    "--command",
    "/board",
    "--card-id",
    "board-1",
    "--state",
    "completed",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.surface, "board");
  assert.equal(parsed.cardId, "board-1");
});

test("slash command adapter maps board moderation and music surfaces", () => {
  const board = _internals.buildSlashCommandAdapter({
    surface: "board",
    command: "/board",
    cardId: "board-1",
    state: "completed",
  });
  const moderation = _internals.buildSlashCommandAdapter({
    surface: "moderation",
    command: "/mod-review",
    caseId: "mod-1",
  });
  const music = _internals.buildSlashCommandAdapter({
    surface: "music",
    command: "/music",
    sessionId: "music-1",
    action: "queue_item",
    itemTitle: "TrackName",
  });

  assert.equal(board.commandPlan.adapter, "board_lifecycle_sync");
  assert.equal(moderation.commandPlan.adapter, "moderation_audit_review_search");
  assert.equal(music.commandPlan.adapter, "music_sesh_runtime");
  assert.equal(board.registersCommands, false);
  assert.equal(board.callsDiscordApi, false);
});

test("slash command adapter blocks missing required filters", () => {
  const result = _internals.buildSlashCommandAdapter({
    surface: "moderation",
    command: "/mod-review",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("moderation_filter_missing"));
});

test("slash command adapter renders bounded markdown", () => {
  const result = _internals.buildSlashCommandAdapter({
    surface: "music",
    command: "/music",
    sessionId: "music-1",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Slash Command Adapter"));
  assert(rendered.includes("registers commands: `false`"));
});
