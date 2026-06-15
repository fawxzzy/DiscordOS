const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-interaction-doctrine-status");

test("interaction doctrine status parses json flag", () => {
  assert.deepEqual(_internals.parseArgs(["--json"]), { json: true });
});

test("interaction doctrine status enforces button and chat surfaces", () => {
  const result = _internals.buildInteractionDoctrineStatus();

  assert.equal(result.ok, true);
  assert.equal(result.slashCommandProductSurfaceCount, 0);
  assert.equal(result.slashCommandRegistrationCommandCount, 0);
  assert.equal(result.applicationCommandsAdmitted, false);
  assert.equal(result.buttonInteractionsAdmitted, true);
  assert.equal(result.controlPostReady, true);
  assert.equal(result.chatCommandIntakeReady, true);
});

test("interaction doctrine status detects slash tile text", () => {
  assert.equal(_internals.includesSlashSurface({
    id: "slash_command_adapter",
    label: "Slash command adapter",
    command: "npm run ops:discordos:slash-command-adapter",
  }), true);
});

test("interaction doctrine status renders bounded markdown", () => {
  const result = _internals.buildInteractionDoctrineStatus();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Interaction Doctrine Status"));
  assert(rendered.includes("slash command product surfaces: `0`"));
  assert(rendered.includes("allowed systems: `channel_or_forum_posts_with_buttons,chat_message_commands`"));
});
