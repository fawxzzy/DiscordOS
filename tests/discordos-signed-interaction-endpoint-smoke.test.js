const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-signed-interaction-endpoint-smoke");

test("signed interaction endpoint smoke parses type", () => {
  const parsed = _internals.parseArgs(["--json", "--type", "MESSAGE_COMPONENT"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.type, "MESSAGE_COMPONENT");
});

test("signed interaction endpoint smoke proves signed ping", async () => {
  const result = await _internals.buildSignedInteractionEndpointSmoke({ type: "PING" });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesCommand, false);
  assert.equal(result.responseType, 1);
  assert.equal(result.signatureVerified, true);
});

test("signed interaction endpoint smoke proves signed button route", async () => {
  const result = await _internals.buildSignedInteractionEndpointSmoke({ type: "MESSAGE_COMPONENT" });

  assert.equal(result.ok, true);
  assert.equal(result.responseType, 4);
  assert.equal(result.signatureVerified, true);
  assert.equal(result.admissionStatus, "handler_admission_ready");
});

test("signed interaction endpoint smoke renders bounded markdown", async () => {
  const result = await _internals.buildSignedInteractionEndpointSmoke({ type: "PING" });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Signed Interaction Endpoint Smoke"));
  assert(rendered.includes("signature verified: `true`"));
});
