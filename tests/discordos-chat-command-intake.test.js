const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-chat-command-intake");

test("chat command intake parses content", () => {
  const parsed = _internals.parseArgs(["--json", "--content", "computa music queue Track"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.content, "computa music queue Track");
});

test("chat command intake admits computa music queue without executing", () => {
  const result = _internals.buildChatCommandIntake({
    content: "computa music queue Track Name",
  });

  assert.equal(result.ok, true);
  assert.equal(result.executesAction, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.action, "queue_item");
  assert.equal(result.itemTitle, "Track Name");
});

test("chat command intake ignores missing wake word", () => {
  const result = _internals.buildChatCommandIntake({
    content: "music queue Track Name",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("wake_word_not_matched"));
});

test("chat command intake renders bounded markdown", () => {
  const result = _internals.buildChatCommandIntake({
    content: "computa music status",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Chat Command Intake"));
  assert(rendered.includes("slash commands admitted: `false`"));
  assert(!rendered.includes("bot-secret"));
});
