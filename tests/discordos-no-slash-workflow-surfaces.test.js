const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-no-slash-workflow-surfaces");

test("no-slash workflow surfaces parse config path", () => {
  const parsed = _internals.parseArgs(["--json", "--surfaces", "config/discordos-no-slash-workflow-surfaces.json"]);

  assert.equal(parsed.json, true);
  assert(parsed.surfacesPath.endsWith("discordos-no-slash-workflow-surfaces.json"));
});

test("no-slash workflow surfaces admit music board and moderation without slash", () => {
  const result = _internals.buildNoSlashWorkflowSurfaceModel({
    version: 1,
    slashCommandsAllowed: false,
    allowedInteractionTypes: ["MESSAGE_COMPONENT", "MESSAGE_CREATE"],
    surfaces: [
      {
        id: "music_sesh",
        label: "Music Sesh",
        postButtonSurface: "npm run ops:discordos:music-sesh-control-post-publish",
        chatMessageSurface: "npm run ops:discordos:chat-message-listener",
        slashCommandSurface: null,
      },
      {
        id: "board",
        label: "Board",
        postButtonSurface: "npm run ops:discordos:board-lifecycle-sync",
        chatMessageSurface: "npm run ops:discordos:board-lifecycle-event-ingest",
        slashCommandSurface: null,
      },
      {
        id: "moderation",
        label: "Moderation",
        postButtonSurface: "npm run ops:discordos:moderation-audit-dashboard",
        chatMessageSurface: "npm run ops:discordos:moderation-audit-review-search",
        slashCommandSurface: null,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.slashCommandsAllowed, false);
  assert.equal(result.surfaceCount, 3);
  assert.equal(result.noSlashSurfaceCount, 3);
});

test("no-slash workflow surfaces reject slash command surfaces", () => {
  const result = _internals.buildNoSlashWorkflowSurfaceModel({
    version: 1,
    slashCommandsAllowed: false,
    allowedInteractionTypes: ["MESSAGE_COMPONENT", "MESSAGE_CREATE"],
    surfaces: [
      {
        id: "music_sesh",
        postButtonSurface: "npm run ops:discordos:music-sesh-control-post-publish",
        chatMessageSurface: "npm run ops:discordos:chat-message-listener",
        slashCommandSurface: "npm run ops:discordos:slash-command-adapter",
      },
    ],
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("slash_command_surface_present"));
});

test("no-slash workflow surfaces renders bounded markdown", () => {
  const result = _internals.buildNoSlashWorkflowSurfaceModel({
    version: 1,
    slashCommandsAllowed: false,
    allowedInteractionTypes: ["MESSAGE_COMPONENT", "MESSAGE_CREATE"],
    surfaces: [
      {
        id: "music_sesh",
        label: "Music Sesh",
        postButtonSurface: "npm run ops:discordos:music-sesh-control-post-publish",
        chatMessageSurface: "npm run ops:discordos:chat-message-listener",
        slashCommandSurface: null,
      },
      {
        id: "board",
        label: "Board",
        postButtonSurface: "npm run ops:discordos:board-lifecycle-sync",
        chatMessageSurface: "npm run ops:discordos:board-lifecycle-event-ingest",
        slashCommandSurface: null,
      },
      {
        id: "moderation",
        label: "Moderation",
        postButtonSurface: "npm run ops:discordos:moderation-audit-dashboard",
        chatMessageSurface: "npm run ops:discordos:moderation-audit-review-search",
        slashCommandSurface: null,
      },
    ],
  });
  const rendered = _internals.renderMarkdown({
    ...result,
    status: "no_slash_surfaces_ready",
  });

  assert(rendered.includes("# DiscordOS No-Slash Workflow Surfaces"));
  assert(rendered.includes("slash commands allowed: `false`"));
  assert(rendered.includes("surface moderation"));
});
