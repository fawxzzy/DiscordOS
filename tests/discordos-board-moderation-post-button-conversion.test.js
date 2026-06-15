const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-moderation-post-button-conversion");

test("board moderation post button conversion parses json flag", () => {
  assert.deepEqual(_internals.parseArgs(["--json"]), { json: true });
});

test("board moderation post button conversion exposes no-slash buttons", () => {
  const result = _internals.buildBoardModerationPostButtonConversion();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.surfaceCount, 2);
  assert.equal(result.buttonCount, 6);
  assert(result.surfaces.some((surface) => surface.id === "board"));
  assert(result.surfaces.some((surface) => surface.id === "moderation"));
});

test("board moderation post button conversion detects slash surfaces", () => {
  const surface = _internals.classifyConvertedSurface({
    id: "board",
    buttons: [{ customId: "board:open", action: "opened" }],
    nextCommand: "npm run ops:discordos:board-lifecycle-sync",
    slashCommandSurface: "npm run ops:discordos:slash-command-adapter",
  });

  assert.equal(surface.ok, false);
  assert(surface.reasonCodes.includes("slash_command_surface_present"));
});

test("board moderation post button conversion renders bounded markdown", () => {
  const rendered = _internals.renderMarkdown(_internals.buildBoardModerationPostButtonConversion());

  assert(rendered.includes("# DiscordOS Board Moderation Post Button Conversion"));
  assert(rendered.includes("slash commands admitted: `false`"));
  assert(rendered.includes("surface moderation"));
});
