const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-discord-interaction-signature-preflight");

test("interaction signature preflight parses signature inputs", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--public-key",
    "a".repeat(64),
    "--timestamp",
    "100",
    "--signature",
    "b".repeat(128),
    "--body",
    "{}",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.publicKey, "a".repeat(64));
  assert.equal(parsed.body, "{}");
});

test("interaction signature preflight validates shape without admitting interactions", () => {
  const result = _internals.buildDiscordInteractionSignaturePreflight({
    publicKey: "a".repeat(64),
    timestamp: "100",
    signature: "b".repeat(128),
    body: "{}",
  }, 100);

  assert.equal(result.ok, true);
  assert.equal(result.admitsInteraction, false);
  assert.equal(result.verifyAttempted, false);
  assert.equal(result.signatureVerified, null);
});

test("interaction signature preflight verifies ed25519 signature when requested", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const discordPublicKey = publicKeyDer.subarray(publicKeyDer.length - 32).toString("hex");
  const timestamp = "100";
  const body = "{\"type\":1}";
  const signature = crypto.sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString("hex");
  const result = _internals.buildDiscordInteractionSignaturePreflight({
    publicKey: discordPublicKey,
    timestamp,
    signature,
    body,
    verify: true,
  }, 100);

  assert.equal(result.ok, true);
  assert.equal(result.signatureVerified, true);
});

test("interaction signature preflight renders bounded markdown", () => {
  const result = _internals.buildDiscordInteractionSignaturePreflight({
    publicKey: "a".repeat(64),
    timestamp: "100",
    signature: "b".repeat(128),
    body: "{}",
  }, 100);
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Discord Interaction Signature Preflight"));
  assert(rendered.includes("admits interaction: `false`"));
});
