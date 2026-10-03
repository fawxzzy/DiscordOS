const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-moderation-supabase-rpc");
const { _internals: serviceRpcInternals } = require("../scripts/discordos-supabase-service-rpc");

test("master direct readbacks select only the narrow DiscordOS API schema", async () => {
  const masterUrl = "https://bxtcuhkotumitoqtrcej.supabase.co";
  const cases = [
    [masterUrl, "discordos_get_music_sesh_readback", "discordos_api"],
    [masterUrl, "discordos_get_product_workflow_readback", "discordos_api"],
    [masterUrl, "discordos_get_runtime_health_cron_run_status", "discordos_api"],
    [masterUrl, "discordos_insert_feedback_proof", "discordos_api"],
    [masterUrl, "discordos_insert_runtime_health_cron_run", "discordos_api"],
    [masterUrl, "discordos_upsert_board_card", "discordos_api"],
    [masterUrl, "discordos_upsert_music_sesh_event", "discordos_api"],
    [masterUrl, "discordos_insert_moderation_audit", "discordos_api"],
    [masterUrl, "discordos_search_moderation_audit", "discordos_api"],
    [masterUrl, "discordos_insert_button_route_audit", undefined],
    ["https://nwexsktuuenfdegzrbut.supabase.co", "discordos_get_product_workflow_readback", undefined],
    ["https://nwexsktuuenfdegzrbut.supabase.co", "discordos_upsert_board_card", undefined],
  ];
  for (const [supabaseUrl, functionName, expectedProfile] of cases) {
    const calls = [];
    const result = await serviceRpcInternals.callServiceRoleRpc({
      supabaseUrl,
      serviceRoleKey: "synthetic-service-key",
      functionName,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers["Content-Profile"], expectedProfile);
  }
});

test("board and moderation RPC config names the direct master runtime", () => {
  const config = _internals.getBoardModerationRpcConfig({
    DISCORDOS_SUPABASE_PROJECT_REF: "bxtcuhkotumitoqtrcej",
    DISCORDOS_SUPABASE_URL: "https://bxtcuhkotumitoqtrcej.supabase.co/",
    DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"s".repeat(32)}`,
    DISCORDOS_SUPABASE_ANON_KEY: `sb_publishable_${"p".repeat(32)}`,
    DISCORDOS_SUPABASE_WORKFLOW_RPC_EDGE: "enabled",
  });

  assert.equal(config.ok, true);
  assert.equal(config.masterBound, true);
  assert.equal(config.transport, "service_role_rest");
  assert.equal(config.runtimeTarget, "master_direct");
});

test("board and moderation RPC config rejects Edge-only master transport", () => {
  const config = _internals.getBoardModerationRpcConfig({
    DISCORDOS_SUPABASE_PROJECT_REF: "bxtcuhkotumitoqtrcej",
    DISCORDOS_SUPABASE_URL: "https://bxtcuhkotumitoqtrcej.supabase.co",
    DISCORDOS_SUPABASE_ANON_KEY: `sb_publishable_${"p".repeat(32)}`,
    DISCORDOS_SUPABASE_WORKFLOW_RPC_EDGE: "enabled",
  });

  assert.equal(config.ok, false);
  assert.equal(config.transport, "none");
  assert(config.reasonCodes.includes("master_direct_service_role_required"));
});

test("board and moderation RPC config rejects a mismatched master URL", () => {
  const config = _internals.getBoardModerationRpcConfig({
    DISCORDOS_SUPABASE_PROJECT_REF: "bxtcuhkotumitoqtrcej",
    DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
    DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"s".repeat(32)}`,
  });

  assert.equal(config.ok, false);
  assert(config.reasonCodes.includes("supabase_project_binding_mismatch"));
});

test("board and moderation RPC config admits the exact legacy project pair", () => {
  const config = _internals.getBoardModerationRpcConfig({
    DISCORDOS_SUPABASE_PROJECT_REF: "nwexsktuuenfdegzrbut",
    DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co/",
    DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"s".repeat(32)}`,
  });

  assert.equal(config.ok, true);
  assert.equal(config.legacyBound, true);
  assert.equal(config.runtimeTarget, "legacy_direct");
});

test("board and moderation RPC config rejects missing, unrelated, and crossed project bindings", () => {
  const hostileBindings = [
    {
      DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
      expectedReason: "missing_supabase_project_ref",
    },
    {
      DISCORDOS_SUPABASE_PROJECT_REF: "lpswxoyfniocuhljgzbc",
      DISCORDOS_SUPABASE_URL: "https://lpswxoyfniocuhljgzbc.supabase.co",
      expectedReason: "unsupported_supabase_project_ref",
    },
    {
      DISCORDOS_SUPABASE_PROJECT_REF: "lpswxoyfniocuhljgzbc",
      DISCORDOS_SUPABASE_URL: "https://bxtcuhkotumitoqtrcej.supabase.co",
      expectedReason: "unsupported_supabase_project_ref",
    },
    {
      DISCORDOS_SUPABASE_PROJECT_REF: "bxtcuhkotumitoqtrcej",
      DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
      expectedReason: "supabase_project_binding_mismatch",
    },
    {
      DISCORDOS_SUPABASE_PROJECT_REF: "nwexsktuuenfdegzrbut",
      DISCORDOS_SUPABASE_URL: "https://bxtcuhkotumitoqtrcej.supabase.co",
      expectedReason: "supabase_project_binding_mismatch",
    },
  ];

  for (const hostile of hostileBindings) {
    const config = _internals.getBoardModerationRpcConfig({
      ...hostile,
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"s".repeat(32)}`,
    });

    assert.equal(config.ok, false);
    assert.equal(config.runtimeTarget, "none");
    assert(config.reasonCodes.includes(hostile.expectedReason));
  }
});

test("board and moderation RPC does not attempt a call for an unrecognized project", async () => {
  let called = false;
  const result = await _internals.callBoardModerationRpc({
    env: {
      DISCORDOS_SUPABASE_PROJECT_REF: "lpswxoyfniocuhljgzbc",
      DISCORDOS_SUPABASE_URL: "https://lpswxoyfniocuhljgzbc.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"s".repeat(32)}`,
    },
    functionName: "discordos_get_product_workflow_readback",
    fetchImpl: async () => {
      called = true;
      throw new Error("unexpected call");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.attempted, false);
  assert.equal(called, false);
  assert(result.reasonCodes.includes("unsupported_supabase_project_ref"));
});

test("board and moderation master calls the named RPC directly without Edge multiplexing", async () => {
  const secret = `sb_secret_${"s".repeat(32)}`;
  const calls = [];
  const result = await _internals.callBoardModerationRpc({
    env: {
      DISCORDOS_SUPABASE_PROJECT_REF: "bxtcuhkotumitoqtrcej",
      DISCORDOS_SUPABASE_URL: "https://bxtcuhkotumitoqtrcej.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: secret,
    },
    functionName: "discordos_get_product_workflow_readback",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, async json() { return { boardCardCount: 1 }; } };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.transport, "service_role_rest");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://bxtcuhkotumitoqtrcej.supabase.co/rest/v1/rpc/discordos_get_product_workflow_readback");
  assert.equal(calls[0].init.headers.apikey, secret);
  assert.equal("Authorization" in calls[0].init.headers, false);
  assert.equal(String(calls[0].url).includes("discordos-product-workflow-rpc"), false);
});

test("board and moderation RPC ignores caller overrides of validated transport binding", async () => {
  const secret = `sb_secret_${"s".repeat(32)}`;
  const calls = [];
  const result = await _internals.callBoardModerationRpc({
    env: {
      DISCORDOS_SUPABASE_PROJECT_REF: "bxtcuhkotumitoqtrcej",
      DISCORDOS_SUPABASE_URL: "https://bxtcuhkotumitoqtrcej.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: secret,
    },
    functionName: "discordos_get_product_workflow_readback",
    supabaseUrl: "https://lpswxoyfniocuhljgzbc.supabase.co",
    serviceRoleKey: "synthetic-attacker-key",
    edgeProxyEnabled: true,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, async json() { return { boardCardCount: 1 }; } };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.runtimeTarget, "master_direct");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://bxtcuhkotumitoqtrcej.supabase.co/rest/v1/rpc/discordos_get_product_workflow_readback");
  assert.equal(calls[0].init.headers.apikey, secret);
});
