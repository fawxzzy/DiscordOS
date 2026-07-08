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

test("discord interactions endpoint returns the Fitness verify modal for the legacy verify button", async () => {
  const body = JSON.stringify({
    type: 3,
    data: {
      custom_id: "fitness_verify_open",
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
  assert.equal(result.payload.type, 9);
  assert.equal(result.payload.data.custom_id, "fitness_verify_modal");
});

test("discord interactions endpoint verifies legacy Fitness modal submissions through the Fitness bridge", async () => {
  const calls = [];
  const body = JSON.stringify({
    type: 5,
    guild_id: "1504668396338413670",
    member: {
      nick: "Zac",
      user: {
        id: "1515220075366580224",
        username: "zac",
      },
    },
    data: {
      custom_id: "fitness_verify_modal",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "fitness_token",
              value: "FWX-ABCD-1234",
            },
          ],
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
    env: {
      DISCORDOS_FITNESS_VERIFY_SECRET: "verification-secret",
      DISCORDOS_FITNESS_VERIFY_ENDPOINT: "https://fitness.example.com/api/discord/verify",
      DISCORDOS_SUPABASE_URL: "https://discordos.example.com",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      DISCORDOS_GUILD_ID: "1504668396338413670",
      DISCORDOS_VERIFIED_ROLE_ID: "verified-role",
      DISCORDOS_UNVERIFIED_ROLE_ID: "unverified-role",
      DISCORDOS_BOT_TOKEN: "discord-bot-token",
    },
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url) === "https://fitness.example.com/api/discord/verify") {
        return new Response(JSON.stringify({
          ok: true,
          memberId: "fitness-user-id",
          userNumber: 4,
          userKind: "human",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (
        String(url) === "https://discord.com/api/v10/guilds/1504668396338413670/members/1515220075366580224"
        && String(init.method) === "PATCH"
      ) {
        assert.equal(JSON.parse(String(init.body)).nick, "Zac \u00b7 4");
        return new Response(JSON.stringify({ nick: "Zac \u00b7 4" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (String(url) === "https://discordos.example.com/rest/v1/rpc/upsert_discord_member_link") {
        const rpcBody = JSON.parse(String(init.body));
        assert.equal(init.headers.apikey, "service-role-key");
        assert.equal(rpcBody.input_fitness_user_id, "fitness-user-id");
        assert.equal(rpcBody.input_discord_user_id, "1515220075366580224");
        assert.equal(rpcBody.input_user_number, 4);
        assert.equal(rpcBody.input_nickname_sync_status, "synced");
        return new Response(JSON.stringify({
          id: "link-id",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (
        String(url) === "https://discord.com/api/v10/guilds/1504668396338413670/members/1515220075366580224/roles/verified-role"
        && String(init.method) === "PUT"
      ) {
        return new Response(null, { status: 204 });
      }

      if (
        String(url) === "https://discord.com/api/v10/guilds/1504668396338413670/members/1515220075366580224/roles/unverified-role"
        && String(init.method) === "DELETE"
      ) {
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected fetch ${String(url)} (${String(init.method ?? "GET")})`);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.type, 4);
  assert.equal(result.payload.data.content, "Verified as Member 4. You now have access to the server.");
  assert.equal(calls.length, 5);
});

test("discord interactions endpoint fails closed when bridge endpoint env is absent", async () => {
  const body = JSON.stringify({
    type: 5,
    guild_id: "1504668396338413670",
    member: {
      user: {
        id: "1515220075366580224",
        username: "zac",
      },
    },
    data: {
      custom_id: "fitness_verify_modal",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "fitness_token",
              value: "FWX-ABCD-1234",
            },
          ],
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
    env: {
      DISCORDOS_FITNESS_VERIFY_SECRET: "verification-secret",
      DISCORDOS_GUILD_ID: "1504668396338413670",
      DISCORDOS_VERIFIED_ROLE_ID: "verified-role",
      DISCORDOS_BOT_TOKEN: "discord-bot-token",
    },
    fetchImpl: async (url) => {
      throw new Error(`Unexpected fetch ${String(url)}`);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.data.content, "Verification is temporarily unavailable. DM fawxzzy with a screenshot of Discord Connector and your one-time key.");
  assert(result.reasonCodes.includes("verification_bridge_not_configured"));
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
