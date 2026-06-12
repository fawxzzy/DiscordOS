const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/readiness");

function jwtWithPayload(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

test("service-role status fails closed when missing", () => {
  assert.deepEqual(_internals.getServiceRoleStatus(undefined), {
    present: false,
    configured: false,
    roleMatches: false,
    projectRefMatches: false,
    reason: "missing",
  });
});

test("service-role status rejects malformed tokens", () => {
  const status = _internals.getServiceRoleStatus("not-a-jwt");

  assert.equal(status.present, true);
  assert.equal(status.configured, false);
  assert.equal(status.reason, "malformed");
});

test("service-role status rejects publishable or anon role JWTs", () => {
  const status = _internals.getServiceRoleStatus(
    jwtWithPayload({ role: "anon", ref: _internals.EXPECTED_SUPABASE_REF })
  );

  assert.equal(status.present, true);
  assert.equal(status.configured, false);
  assert.equal(status.roleMatches, false);
  assert.equal(status.projectRefMatches, true);
  assert.equal(status.reason, "metadata_mismatch");
});

test("service-role status rejects service-role JWTs for the wrong project ref", () => {
  const status = _internals.getServiceRoleStatus(
    jwtWithPayload({ role: _internals.SERVICE_ROLE, ref: "lpswxoyfniocuhljgzbc" })
  );

  assert.equal(status.present, true);
  assert.equal(status.configured, false);
  assert.equal(status.roleMatches, true);
  assert.equal(status.projectRefMatches, false);
  assert.equal(status.reason, "metadata_mismatch");
});

test("service-role status accepts service-role JWTs for the DiscordOS project ref", () => {
  const status = _internals.getServiceRoleStatus(
    jwtWithPayload({
      role: _internals.SERVICE_ROLE,
      ref: _internals.EXPECTED_SUPABASE_REF,
    })
  );

  assert.equal(status.present, true);
  assert.equal(status.configured, true);
  assert.equal(status.roleMatches, true);
  assert.equal(status.projectRefMatches, true);
  assert.equal(status.reason, "valid");
});

test("edge service-role status fails closed without probe config", async () => {
  const status = await _internals.getEdgeServiceRoleStatus({
    supabaseUrl: "",
    anonKey: "",
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });

  assert.equal(status.configured, false);
  assert.equal(status.reachable, false);
  assert.equal(status.reason, "missing_edge_probe_config");
});

test("edge service-role status accepts DiscordOS edge probe success", async () => {
  const status = await _internals.getEdgeServiceRoleStatus({
    supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co",
    anonKey: jwtWithPayload({ role: "anon", ref: _internals.EXPECTED_SUPABASE_REF }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          supabaseProjectRef: _internals.EXPECTED_SUPABASE_REF,
          serviceRoleKeyPresent: true,
          serviceRoleProbeOk: true,
          serviceRoleProbeReason: "service_role_private_schema_read_ok",
        };
      },
    }),
  });

  assert.equal(status.configured, true);
  assert.equal(status.reachable, true);
  assert.equal(status.keyPresent, true);
  assert.equal(status.probeOk, true);
  assert.equal(status.projectRefMatches, true);
});

test("edge service-role status rejects wrong-project edge probe", async () => {
  const status = await _internals.getEdgeServiceRoleStatus({
    supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co",
    anonKey: jwtWithPayload({ role: "anon", ref: _internals.EXPECTED_SUPABASE_REF }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          supabaseProjectRef: "lpswxoyfniocuhljgzbc",
          serviceRoleKeyPresent: true,
          serviceRoleProbeOk: true,
        };
      },
    }),
  });

  assert.equal(status.configured, false);
  assert.equal(status.reachable, true);
  assert.equal(status.probeOk, true);
  assert.equal(status.projectRefMatches, false);
});

test("Discord bot status fails closed when token is missing", async () => {
  const status = await _internals.getDiscordBotStatus({
    token: "",
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });

  assert.equal(status.configured, false);
  assert.equal(status.reachable, false);
  assert.equal(status.tokenPresent, false);
  assert.equal(status.botUserOk, false);
  assert.equal(status.reason, "missing_bot_token");
});

test("Discord bot status rejects invalid bot token responses", async () => {
  const status = await _internals.getDiscordBotStatus({
    token: "test-token",
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      async json() {
        return { message: "401: Unauthorized" };
      },
    }),
  });

  assert.equal(status.configured, false);
  assert.equal(status.reachable, false);
  assert.equal(status.tokenPresent, true);
  assert.equal(status.botUserOk, false);
  assert.equal(status.status, 401);
  assert.equal(status.reason, "discord_bot_token_invalid");
});

test("Discord bot status rejects non-bot user responses", async () => {
  const status = await _internals.getDiscordBotStatus({
    token: "test-token",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { bot: false };
      },
    }),
  });

  assert.equal(status.configured, false);
  assert.equal(status.reachable, true);
  assert.equal(status.tokenPresent, true);
  assert.equal(status.botUserOk, false);
  assert.equal(status.reason, "discord_bot_token_invalid");
});

test("Discord bot status accepts Discord bot user responses", async () => {
  const status = await _internals.getDiscordBotStatus({
    token: "test-token",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { bot: true };
      },
    }),
  });

  assert.equal(status.configured, true);
  assert.equal(status.reachable, true);
  assert.equal(status.tokenPresent, true);
  assert.equal(status.botUserOk, true);
  assert.equal(status.status, 200);
  assert.equal(status.reason, "discord_bot_user_ok");
});
