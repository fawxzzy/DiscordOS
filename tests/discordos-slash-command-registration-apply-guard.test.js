const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-slash-command-registration-apply-guard");

test("slash command registration apply guard parses double guard", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--surface",
    "music",
    "--application-id",
    "1504668396338413670",
    "--allow-registration",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.surface, "music");
  assert.equal(parsed.allowRegistration, true);
  assert.equal(parsed.apply, true);
});

test("slash command registration apply guard defaults to no-api dry readiness", async () => {
  const result = await _internals.buildSlashCommandRegistrationApplyGuard({
    surface: "all",
    applicationId: "1504668396338413670",
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.registersCommands, false);
  assert.equal(result.commandCount, 3);
  assert.equal(result.registrationAdmission.status, "no_registration_guard_active");
  assert.equal(result.payloadPreview.some((command) => command.name === "music"), true);
});

test("slash command registration apply guard blocks partial registration admission", async () => {
  const result = await _internals.buildSlashCommandRegistrationApplyGuard({
    surface: "music",
    applicationId: "1504668396338413670",
    allowRegistration: true,
    env: {},
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("registration_double_guard_missing"));
});

test("slash command registration apply guard calls Discord only when applied and configured", async () => {
  const calls = [];
  const result = await _internals.buildSlashCommandRegistrationApplyGuard({
    surface: "music",
    applicationId: "1504668396338413670",
    guildId: "1504671871512346695",
    allowRegistration: true,
    apply: true,
    env: {
      DISCORDOS_SLASH_COMMAND_REGISTRATION: "enabled",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.callsDiscordApi, true);
  assert.equal(result.registersCommands, true);
  assert.equal(calls[0].url, "https://discord.com/api/v10/applications/1504668396338413670/guilds/1504671871512346695/commands");
  assert.equal(JSON.parse(calls[0].init.body)[0].name, "music");
});

test("slash command registration apply guard renders bounded markdown", async () => {
  const result = await _internals.buildSlashCommandRegistrationApplyGuard({ surface: "music" });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Slash Command Registration Apply Guard"));
  assert(rendered.includes("calls Discord API: `false`"));
  assert(!rendered.includes("bot-secret"));
});
