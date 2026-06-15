const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const { _internals } = require("../api/discord-interactions");

function signedRequest(body, nowSeconds = 100) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const discordPublicKey = publicKeyDer.subarray(publicKeyDer.length - 32).toString("hex");
  const timestamp = String(nowSeconds);
  const signature = crypto.sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString("hex");
  return {
    publicKey: discordPublicKey,
    headers: {
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
  };
}

test("discord interactions endpoint admits signed ping", async () => {
  const body = JSON.stringify({ type: 1 });
  const signed = signedRequest(body);
  const result = await _internals.buildDiscordInteractionResponse({
    method: "POST",
    rawBody: body,
    headers: signed.headers,
    publicKey: signed.publicKey,
    nowSeconds: 100,
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.type, 1);
  assert.equal(result.signaturePreflight.signatureVerified, true);
  assert.equal(result.admission.route.kind, "pong");
});

test("discord interactions endpoint admits signed music button route without executing", async () => {
  const body = JSON.stringify({
    type: 3,
    data: {
      custom_id: "music_sesh:queue",
      component_type: 2,
    },
  });
  const signed = signedRequest(body);
  const result = await _internals.buildDiscordInteractionResponse({
    method: "POST",
    rawBody: body,
    headers: signed.headers,
    publicKey: signed.publicKey,
    nowSeconds: 100,
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.type, 4);
  assert.equal(result.admission.executesRoute, false);
  assert.equal(result.admission.route.kind, "message_component");
});

test("discord interactions endpoint rejects application command routes", async () => {
  const body = JSON.stringify({
    type: 2,
    data: {
      name: "music",
    },
  });
  const signed = signedRequest(body);
  const result = await _internals.buildDiscordInteractionResponse({
    method: "POST",
    rawBody: body,
    headers: signed.headers,
    publicKey: signed.publicKey,
    nowSeconds: 100,
  });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
  assert(result.reasonCodes.includes("slash_commands_disabled"));
});

test("discord interactions endpoint rejects invalid signature", async () => {
  const body = JSON.stringify({ type: 1 });
  const signed = signedRequest(body);
  const result = await _internals.buildDiscordInteractionResponse({
    method: "POST",
    rawBody: body,
    headers: {
      ...signed.headers,
      "x-signature-ed25519": "a".repeat(128),
    },
    publicKey: signed.publicKey,
    nowSeconds: 100,
  });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 401);
  assert(result.reasonCodes.includes("signature_verification_failed"));
});
