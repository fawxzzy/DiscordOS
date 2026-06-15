const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-interaction-handler-admission");

test("interaction handler admission parses application command route", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--type",
    "APPLICATION_COMMAND",
    "--surface",
    "music",
    "--command",
    "music",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.type, "APPLICATION_COMMAND");
  assert.equal(parsed.surface, "music");
});

test("interaction handler admission admits ping response", () => {
  const result = _internals.buildInteractionHandlerAdmission({ type: "PING" });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.admitsInteraction, true);
  assert.equal(result.executesRoute, false);
  assert.equal(result.route.kind, "pong");
  assert.equal(result.route.responseType, 1);
});

test("interaction handler admission routes music command through slash adapter", () => {
  const result = _internals.buildInteractionHandlerAdmission({
    type: "APPLICATION_COMMAND",
    surface: "music",
    command: "music",
    sessionId: "music-1",
    action: "queue_item",
    itemTitle: "TrackName",
  });

  assert.equal(result.ok, true);
  assert.equal(result.route.kind, "slash_command_adapter");
  assert.equal(result.route.command, "npm run ops:discordos:music-sesh-runtime");
});

test("interaction handler admission blocks unsupported interaction type", () => {
  const result = _internals.buildInteractionHandlerAdmission({ type: "MODAL_SUBMIT" });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("interaction_type_not_admitted"));
});

test("interaction handler admission renders bounded markdown", () => {
  const result = _internals.buildInteractionHandlerAdmission({ type: "PING" });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Interaction Handler Admission"));
  assert(rendered.includes("sends messages: `false`"));
});
