const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-slash-command-deactivation-apply-guard");

test("slash command deactivation apply guard parses double guard", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--application-id", "1504668396338413670",
    "--guild-id", "1504671871512346695",
    "--allow-deactivation",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.applicationId, "1504668396338413670");
  assert.equal(parsed.guildId, "1504671871512346695");
  assert.equal(parsed.allowDeactivation, true);
  assert.equal(parsed.apply, true);
});

test("slash command deactivation apply guard defaults to no-api readiness", async () => {
  const result = await _internals.buildSlashCommandDeactivationApplyGuard({
    applicationId: "1504668396338413670",
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.registersCommands, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.deactivationAdmission.status, "no_deactivation_guard_active");
});

test("slash command deactivation apply guard blocks partial admission", async () => {
  const result = await _internals.buildSlashCommandDeactivationApplyGuard({
    applicationId: "1504668396338413670",
    allowDeactivation: true,
    env: {},
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("deactivation_double_guard_missing"));
});

test("slash command deactivation apply guard clears commands only when double guarded", async () => {
  const calls = [];
  const result = await _internals.buildSlashCommandDeactivationApplyGuard({
    applicationId: "1504668396338413670",
    guildId: "1504671871512346695",
    allowDeactivation: true,
    apply: true,
    env: {
      DISCORDOS_SLASH_COMMAND_DEACTIVATION: "enabled",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.callsDiscordApi, true);
  assert.equal(result.removesCommands, true);
  assert.equal(result.applyResult.commandsRemaining, 0);
  assert.equal(calls[0].url, "https://discord.com/api/v10/applications/1504668396338413670/guilds/1504671871512346695/commands");
  assert.equal(calls[0].init.body, "[]");
});

test("slash command deactivation apply guard renders bounded markdown", async () => {
  const result = await _internals.buildSlashCommandDeactivationApplyGuard({});
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Slash Command Deactivation Apply Guard"));
  assert(rendered.includes("registers commands: `false`"));
  assert(rendered.includes("slash commands admitted: `false`"));
  assert(!rendered.includes("bot-secret"));
});
