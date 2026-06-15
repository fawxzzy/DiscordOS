const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-interaction-handler-admission");

test("interaction handler admission parses component route", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--type", "MESSAGE_COMPONENT",
    "--custom-id", "music_sesh:queue",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.type, "MESSAGE_COMPONENT");
  assert.equal(parsed.customId, "music_sesh:queue");
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

test("interaction handler admission routes music buttons without executing", () => {
  const result = _internals.buildInteractionHandlerAdmission({
    type: "MESSAGE_COMPONENT",
    customId: "music_sesh:queue",
  });

  assert.equal(result.ok, true);
  assert.equal(result.route.kind, "message_component");
  assert.equal(result.route.customId, "music_sesh:queue");
  assert.equal(result.executesRoute, false);
});

test("interaction handler admission blocks application commands", () => {
  const result = _internals.buildInteractionHandlerAdmission({ type: "APPLICATION_COMMAND" });

  assert.equal(result.ok, false);
  assert.equal(result.admitsInteraction, false);
  assert(result.reasonCodes.includes("slash_commands_disabled"));
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
