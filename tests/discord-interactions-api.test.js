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

test("discord interactions endpoint admits DiscordOS feedback launcher buttons", async () => {
  const body = JSON.stringify({
    type: 3,
    guild_id: "1504668396338413670",
    data: {
      custom_id: "discordos_feedback_submit_open",
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
      DISCORDOS_GUILD_ID: "1504668396338413670",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.type, 4);
  assert.equal(result.payload.data.components[0].components[0].custom_id, "discordos_feedback_submit_pick_type");
});

test("discord interactions endpoint creates DiscordOS feedback reports from modal submit", async () => {
  const calls = [];
  const body = JSON.stringify({
    id: "interaction-1",
    type: 5,
    guild_id: "1504668396338413670",
    member: {
      user: {
        id: "1515220075366580224",
        username: "fawx",
      },
      permissions: "8",
    },
    data: {
      custom_id: "discordos_feedback_report_modal:bug",
      components: [
        {
          type: 1,
          components: [{ type: 4, custom_id: "bug_summary", value: "Goodmorning command stopped responding" }],
        },
        {
          type: 1,
          components: [{ type: 4, custom_id: "bug_area", value: "DiscordOS feedback" }],
        },
        {
          type: 1,
          components: [{ type: 4, custom_id: "bug_details", value: "The hosted bot ignored the greeting until the worker was repaired." }],
        },
        {
          type: 1,
          components: [{ type: 4, custom_id: "feedback_section_overrides", value: "" }],
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
      DISCORDOS_GUILD_ID: "1504668396338413670",
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
      DISCORDOS_BOT_TOKEN: "bot-token",
      DISCORDOS_FEEDBACK_FORUM_CHANNEL_ID: "forum-1",
    },
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      const bodyValue = init.body ? JSON.parse(init.body) : null;
      if (String(url).includes("/rest/v1/discord_feedback_reports?select=") && (!init.method || init.method === "GET")) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      }
      if (String(url).includes("/rest/v1/discord_feedback_reports?select=") && init.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => [{
            ...bodyValue,
            updated_at: bodyValue.first_seen_at,
            created_at: bodyValue.first_seen_at,
            status: "new",
            completion_review_status: "not_required",
            forum_channel_id: null,
            forum_thread_id: null,
            forum_message_id: null,
            forum_title: null,
            forum_applied_tag_ids: [],
          }],
        };
      }
      if (String(url).includes("/rest/v1/discord_feedback_reports?report_id=eq.") && init.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            report_id: "11111111-1111-4111-8111-111111111111",
            report_type: "bug",
            summary: "Goodmorning command stopped responding",
            area: "DiscordOS feedback",
            details: "The hosted bot ignored the greeting until the worker was repaired.",
            steps_to_reproduce: null,
            reporter_discord_user_id: "1515220075366580224",
            reporter_discord_username: "fawx",
            status: "new",
            severity: "medium",
            effort_points: 5,
            duplicate_count: 1,
            forum_channel_id: "forum-1",
            forum_thread_id: "thread-1",
            forum_message_id: "message-1",
            forum_title: "Bug: Discordos Feedback - Goodmorning command stopped responding",
            forum_applied_tag_ids: ["tag-bug", "tag-new", "tag-medium"],
            created_at: "2026-06-27T00:00:00.000Z",
            updated_at: "2026-06-27T00:00:00.000Z",
            first_seen_at: "2026-06-27T00:00:00.000Z",
            last_seen_at: "2026-06-27T00:00:00.000Z",
          }],
        };
      }
      if (String(url) === "https://discord.com/api/v10/channels/forum-1") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "forum-1",
            available_tags: [
              { id: "tag-bug", name: "Bug" },
              { id: "tag-new", name: "New" },
              { id: "tag-medium", name: "Medium" },
            ],
          }),
        };
      }
      if (String(url) === "https://discord.com/api/v10/channels/forum-1/threads" && init.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "thread-1",
            message: { id: "message-1" },
          }),
        };
      }
      if (String(url).includes("/rest/v1/discord_feedback_audit_events") && init.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ([]),
        };
      }
      throw new Error(`Unexpected fetch: ${init.method || "GET"} ${url}`);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.type, 4);
  assert.match(result.payload.data.content, /Feedback received/);
  assert(calls.some((call) => call.url === "https://discord.com/api/v10/channels/forum-1/threads"));
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
