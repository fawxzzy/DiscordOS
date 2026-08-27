const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/readiness");
const readinessHandler = require("../api/readiness");

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

test("modern secret requires a live project-bound probe instead of JWT decoding", () => {
  const status = _internals.getServiceRoleStatus(`sb_secret_${"a".repeat(32)}`);
  assert.equal(status.present, true);
  assert.equal(status.configured, false);
  assert.equal(status.roleMatches, true);
  assert.equal(status.projectRefMatches, false);
  assert.equal(status.reason, "modern_secret_requires_live_probe");
});

test("direct modern secret probe uses apikey only and accepts exact project binding", async () => {
  const secret = `sb_secret_${"a".repeat(32)}`;
  let observed;
  const status = await _internals.getDirectServiceRoleStatus({
    supabaseUrl: "https://bxtcuhkotumitoqtrcej.supabase.co",
    projectRef: "bxtcuhkotumitoqtrcej",
    serviceRoleKey: secret,
    fetchImpl: async (url, init) => {
      observed = { url, init };
      return { ok: true, status: 200 };
    },
  });
  assert.equal(status.configured, true);
  assert.equal(status.probeOk, true);
  assert.equal(observed.url, "https://bxtcuhkotumitoqtrcej.supabase.co/rest/v1/");
  assert.equal(observed.init.headers.apikey, secret);
  assert.equal("Authorization" in observed.init.headers, false);
});

test("direct modern secret probe rejects URL and project-ref mismatch before fetch", async () => {
  const status = await _internals.getDirectServiceRoleStatus({
    supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co",
    projectRef: "bxtcuhkotumitoqtrcej",
    serviceRoleKey: `sb_secret_${"a".repeat(32)}`,
    fetchImpl: async () => { throw new Error("must not fetch"); },
  });
  assert.equal(status.configured, false);
  assert.equal(status.reachable, false);
  assert.equal(status.reason, "direct_probe_project_binding_mismatch");
});

test("direct legacy rollback probe accepts only the DiscordOS service-role JWT", async () => {
  const key = jwtWithPayload({ role: _internals.SERVICE_ROLE, ref: _internals.EXPECTED_SUPABASE_REF });
  let observed;
  const status = await _internals.getDirectServiceRoleStatus({
    supabaseUrl: `https://${_internals.EXPECTED_SUPABASE_REF}.supabase.co`,
    projectRef: _internals.EXPECTED_SUPABASE_REF,
    serviceRoleKey: key,
    fetchImpl: async (url, init) => {
      observed = { url, init };
      return { ok: true, status: 200 };
    },
  });
  assert.equal(status.configured, true);
  assert.equal(observed.init.headers.apikey, key);
  assert.equal(observed.init.headers.Authorization, `Bearer ${key}`);
});

test("direct probe rejects low-privilege malformed wrong-ref and unrelated project credentials before fetch", async () => {
  const cases = [
    { projectRef: _internals.MASTER_SUPABASE_REF, key: `sb_publishable_${"a".repeat(32)}` },
    { projectRef: _internals.EXPECTED_SUPABASE_REF, key: jwtWithPayload({ role: "anon", ref: _internals.EXPECTED_SUPABASE_REF }) },
    { projectRef: _internals.EXPECTED_SUPABASE_REF, key: "arbitrary-non-jwt" },
    { projectRef: _internals.EXPECTED_SUPABASE_REF, key: jwtWithPayload({ role: _internals.SERVICE_ROLE, ref: "lpswxoyfniocuhljgzbc" }) },
    { projectRef: "lpswxoyfniocuhljgzbc", key: `sb_secret_${"a".repeat(32)}` },
  ];
  for (const fixture of cases) {
    const status = await _internals.getDirectServiceRoleStatus({
      supabaseUrl: `https://${fixture.projectRef}.supabase.co`,
      projectRef: fixture.projectRef,
      serviceRoleKey: fixture.key,
      fetchImpl: async () => { throw new Error("must not fetch"); },
    });
    assert.equal(status.configured, false);
    assert.equal(status.reachable, false);
    assert.equal(status.reason, "direct_probe_credential_binding_mismatch");
  }
});

test("readiness handler reports the exact master project and modern direct key as configured", async () => {
  const keys = ["DISCORDOS_SUPABASE_PROJECT_REF", "DISCORDOS_SUPABASE_URL", "DISCORDOS_SUPABASE_SERVICE_ROLE_KEY", "DISCORDOS_SUPABASE_ANON_KEY", "DISCORDOS_BOT_TOKEN"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  let payload;
  try {
    process.env.DISCORDOS_SUPABASE_PROJECT_REF = _internals.MASTER_SUPABASE_REF;
    process.env.DISCORDOS_SUPABASE_URL = `https://${_internals.MASTER_SUPABASE_REF}.supabase.co`;
    process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY = `sb_secret_${"a".repeat(32)}`;
    process.env.DISCORDOS_SUPABASE_ANON_KEY = `sb_publishable_${"p".repeat(32)}`;
    process.env.DISCORDOS_BOT_TOKEN = "bot-fixture";
    global.fetch = async (url) => {
      if (url.endsWith("/rest/v1/")) return { ok: true, status: 200 };
      if (url.includes("/functions/v1/")) return { ok: false, status: 401, json: async () => null };
      if (url.includes("discord.com/api/")) return { ok: true, status: 200, json: async () => ({ bot: true }) };
      throw new Error(`unexpected_url:${url}`);
    };
    const res = { setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { payload = value; return value; } };
    await readinessHandler({ method: "GET" }, res);
    assert.equal(payload.supabaseProjectRefConfigured, true);
    assert.equal(payload.directServiceRoleConfigured, true);
    assert.equal(payload.serviceRoleConfigured, true);
    assert.equal(payload.serviceRoleRuntime, "vercel-env");
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) before[key] === undefined ? delete process.env[key] : process.env[key] = before[key];
  }
});

test("edge service-role status fails closed without probe config", async () => {
  const status = await _internals.getEdgeServiceRoleStatus({
    supabaseUrl: "",
    projectRef: "",
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
    projectRef: _internals.EXPECTED_SUPABASE_REF,
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

test("edge service-role status accepts exact master probe using publishable apikey only", async () => {
  const publishable = `sb_publishable_${"b".repeat(32)}`;
  let observed;
  const status = await _internals.getEdgeServiceRoleStatus({
    supabaseUrl: `https://${_internals.MASTER_SUPABASE_REF}.supabase.co`,
    projectRef: _internals.MASTER_SUPABASE_REF,
    anonKey: publishable,
    fetchImpl: async (url, init) => {
      observed = { url, init };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            supabaseProjectRef: _internals.MASTER_SUPABASE_REF,
            serviceRoleKeyPresent: true,
            serviceRoleProbeOk: true,
          };
        },
      };
    },
  });

  assert.equal(status.configured, true);
  assert.equal(status.projectRefMatches, true);
  assert.equal(observed.init.headers.apikey, publishable);
  assert.equal("Authorization" in observed.init.headers, false);
});

test("edge service-role status rejects unrelated self-consistent project before fetch", async () => {
  let fetchCount = 0;
  const status = await _internals.getEdgeServiceRoleStatus({
    supabaseUrl: "https://lpswxoyfniocuhljgzbc.supabase.co",
    projectRef: "lpswxoyfniocuhljgzbc",
    anonKey: `sb_publishable_${"b".repeat(32)}`,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("must not fetch");
    },
  });

  assert.equal(status.configured, false);
  assert.equal(status.reachable, false);
  assert.equal(status.reason, "edge_probe_project_binding_mismatch");
  assert.equal(fetchCount, 0);
});

test("edge service-role status rejects cross-mode public credentials before fetch", async () => {
  const cases = [
    {
      projectRef: _internals.MASTER_SUPABASE_REF,
      key: jwtWithPayload({ role: "anon", ref: _internals.EXPECTED_SUPABASE_REF }),
    },
    {
      projectRef: _internals.EXPECTED_SUPABASE_REF,
      key: `sb_publishable_${"b".repeat(32)}`,
    },
    {
      projectRef: _internals.MASTER_SUPABASE_REF,
      key: `sb_secret_${"a".repeat(32)}`,
    },
    {
      projectRef: _internals.EXPECTED_SUPABASE_REF,
      key: jwtWithPayload({ role: _internals.SERVICE_ROLE, ref: _internals.EXPECTED_SUPABASE_REF }),
    },
  ];
  for (const fixture of cases) {
    let fetchCount = 0;
    const status = await _internals.getEdgeServiceRoleStatus({
      supabaseUrl: `https://${fixture.projectRef}.supabase.co`,
      projectRef: fixture.projectRef,
      anonKey: fixture.key,
      fetchImpl: async () => {
        fetchCount += 1;
        throw new Error("must not fetch");
      },
    });
    assert.equal(status.configured, false);
    assert.equal(status.reachable, false);
    assert.equal(status.reason, "edge_probe_credential_binding_mismatch");
    assert.equal(fetchCount, 0);
  }
});

test("edge service-role status rejects wrong-project edge probe", async () => {
  const status = await _internals.getEdgeServiceRoleStatus({
    supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co",
    projectRef: _internals.EXPECTED_SUPABASE_REF,
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
