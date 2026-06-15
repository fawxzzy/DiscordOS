const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-slash-command-registration-preflight");

test("slash command registration preflight parses surface and ids", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--surface",
    "music",
    "--application-id",
    "1504668396338413670",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.surface, "music");
  assert.equal(parsed.applicationId, "1504668396338413670");
});

test("slash command registration preflight builds no-api command plan", () => {
  const result = _internals.buildSlashCommandRegistrationPreflight({
    surface: "all",
    applicationId: "1504668396338413670",
    guildId: "1504671871512346695",
  });

  assert.equal(result.ok, true);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.registersCommands, false);
  assert.equal(result.commandCount, 3);
  assert(result.commands.some((command) => command.name === "music"));
});

test("slash command registration preflight blocks invalid surface", () => {
  const result = _internals.buildSlashCommandRegistrationPreflight({ surface: "billing" });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("surface_not_admitted"));
});

test("slash command registration preflight renders bounded markdown", () => {
  const result = _internals.buildSlashCommandRegistrationPreflight({ surface: "music" });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Slash Command Registration Preflight"));
  assert(rendered.includes("registers commands: `false`"));
  assert(rendered.includes("/music"));
});
