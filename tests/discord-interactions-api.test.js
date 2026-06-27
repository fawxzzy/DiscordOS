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
  assert.equal(result.execution, null);
});

test("discord interactions endpoint executes signed music button route when guarded", async () => {
  const calls = [];
  const body = JSON.stringify({
    type: 3,
    guild_id: "1504668396338413670",
    channel_id: "1504671871512346695",
    member: {
      user: {
        id: "1515220075366580224",
      },
    },
    message: {
      id: "1516000000000000000",
      channel_id: "1504671871512346695",
    },
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
    env: {
      DISCORDOS_BUTTON_INTERACTION_EXECUTION: "enabled",
      DISCORDOS_MUSIC_SESH_WRITE_ADAPTER: "enabled",
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.data.content, "DiscordOS button route executed.");
  assert.equal(result.execution.executesStorageWrite, true);
  assert.equal(JSON.parse(calls[0].init.body).payload.action, "queue_item");
});

test("discord interactions endpoint admits computa application command routes", async () => {
  const body = JSON.stringify({
    type: 2,
    data: {
      name: "computa",
      options: [
        {
          type: 1,
          name: "menu",
        },
      ],
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
  assert.match(result.payload.data.embeds[0].title, /Computa/);
});

test("discord interactions endpoint still rejects unrelated application command routes", async () => {
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
