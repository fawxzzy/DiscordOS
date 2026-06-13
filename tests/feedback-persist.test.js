const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/feedback-persist");

test("persisted writer config fails closed by default", () => {
  const config = _internals.getPersistedWriterConfig({});

  assert.equal(config.persistedWriterEnabled, false);
  assert.equal(config.writerMode, "disabled");
  assert.equal(config.canAttemptPersistence, false);
  assert.deepEqual(config.blockedReasons, [
    "persisted_writer_not_enabled",
    "writer_mode_not_shadow_or_active",
    "missing_supabase_url",
    "missing_service_role_key",
    "missing_edge_persist_config",
  ]);
});

test("persisted writer config requires service role even in shadow mode", () => {
  const config = _internals.getPersistedWriterConfig({
    DISCORDOS_PERSISTED_WRITER_ENABLED: "true",
    DISCORDOS_WRITER_MODE: "shadow",
    DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
  });

  assert.equal(config.persistedWriterEnabled, true);
  assert.equal(config.writerMode, "shadow");
  assert.equal(config.writerModeAllowsPersistence, true);
  assert.equal(config.supabaseUrlConfigured, true);
  assert.equal(config.anonKeyConfigured, false);
  assert.equal(config.serviceRoleConfigured, false);
  assert.equal(config.edgePersistAvailable, false);
  assert.deepEqual(config.blockedReasons, ["missing_service_role_key", "missing_edge_persist_config"]);
});

test("persisted writer config allows edge persistence without direct service role", () => {
  const config = _internals.getPersistedWriterConfig({
    DISCORDOS_PERSISTED_WRITER_ENABLED: "true",
    DISCORDOS_WRITER_MODE: "shadow",
    DISCORDOS_SUPABASE_URL: "https://nwexsktuuenfdegzrbut.supabase.co",
    DISCORDOS_SUPABASE_ANON_KEY: "anon-test-key",
  });

  assert.equal(config.canAttemptPersistence, true);
  assert.equal(config.serviceRoleConfigured, false);
  assert.equal(config.edgePersistAvailable, true);
});

test("transfer secret status requires configured matching header", () => {
  assert.deepEqual(_internals.getTransferSecretStatus({}, {}), {
    configured: false,
    present: false,
    matches: false,
  });

  assert.deepEqual(
    _internals.getTransferSecretStatus(
      { "x-discordos-feedback-transfer-secret": "shared-secret" },
      { DISCORDOS_FEEDBACK_TRANSFER_SECRET: "shared-secret" },
    ),
    {
      configured: true,
      present: true,
      matches: true,
    },
  );

  assert.equal(
    _internals.getTransferSecretStatus(
      { "x-discordos-feedback-transfer-secret": "wrong-secret" },
      { DISCORDOS_FEEDBACK_TRANSFER_SECRET: "shared-secret" },
    ).matches,
    false,
  );
});

test("live transfer proof rows require active writer, active traffic, and rollback-ready mode", () => {
  assert.equal(_internals.isLiveTransferProofRow(
    { report_id: "fitness-live-transfer-interaction-1" },
    {
      writerMode: "active",
      trafficTransferMode: "active",
      rollbackMode: "discordos-primary-with-fitness-rollback",
    },
  ), true);

  assert.equal(_internals.isLiveTransferProofRow(
    { report_id: "fitness-live-transfer-interaction-1" },
    {
      writerMode: "shadow",
      trafficTransferMode: "active",
      rollbackMode: "discordos-primary-with-fitness-rollback",
    },
  ), false);

  assert.equal(_internals.isLiveTransferProofRow(
    { report_id: "shadow-transfer-proof-1" },
    {
      writerMode: "active",
      trafficTransferMode: "active",
      rollbackMode: "discordos-primary-with-fitness-rollback",
    },
  ), false);
});

test("persisted writer inserts through service-role proof RPC", async () => {
  const calls = [];
  const result = await _internals.insertFeedbackReport(
    {
      report_id: "edge-persist-proof-123",
      report_type: "bug",
      status: "new",
      completion_review_status: "not_required",
    },
    {
      supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co/",
      serviceRoleKey: "service-role-test-key",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 201,
          async json() {
            return [{ report_id: "edge-persist-proof-123", report_type: "bug" }];
          },
        };
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.deepEqual(result.row, { report_id: "edge-persist-proof-123", report_type: "bug" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://nwexsktuuenfdegzrbut.supabase.co/rest/v1/rpc/discordos_insert_feedback_proof");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, "service-role-test-key");
  assert.equal(calls[0].init.headers.Authorization, "Bearer service-role-test-key");
  assert.equal(calls[0].init.headers.Prefer, "return=representation");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    payload: {
      report_id: "edge-persist-proof-123",
      report_type: "bug",
      status: "new",
      completion_review_status: "not_required",
    },
  });
});

test("persisted writer invokes edge writer with anon authorization", async () => {
  const calls = [];
  const result = await _internals.invokeEdgePersistWriter(
    {
      report_id: "edge-persist-proof-123",
      report_type: "bug",
    },
    {
      supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co/",
      anonKey: "anon-test-key",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 201,
          async json() {
            return {
              ok: true,
              persisted: true,
              row: { report_id: "edge-persist-proof-123" },
            };
          },
        };
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.deepEqual(result.payload.row, { report_id: "edge-persist-proof-123" });
  assert.equal(calls[0].url, "https://nwexsktuuenfdegzrbut.supabase.co/functions/v1/discordos-feedback-persist");
  assert.equal(calls[0].init.headers.apikey, "anon-test-key");
  assert.equal(calls[0].init.headers.Authorization, "Bearer anon-test-key");
});

test("persisted writer forwards transfer secret to edge writer when supplied", async () => {
  const calls = [];
  const result = await _internals.invokeEdgePersistWriter(
    {
      report_id: "fitness-live-transfer-interaction-123",
      report_type: "bug",
    },
    {
      supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co/",
      anonKey: "anon-test-key",
      transferSecret: "shared-transfer-secret",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 201,
          async json() {
            return {
              ok: true,
              persisted: true,
              row: {
                report_id: "fitness-live-transfer-interaction-123",
                runtime_warnings: ["discordos_fitness_live_transfer"],
              },
            };
          },
        };
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(calls[0].init.headers["X-DiscordOS-Feedback-Transfer-Secret"], "shared-transfer-secret");
});

test("persisted writer preserves Fitness provenance fields for edge writer", () => {
  assert.deepEqual(
    _internals.buildEdgePersistPayload(
      {
        report_id: "fitness-live-transfer-interaction-123",
        report_type: "bug",
        reporter_user_kind: "human",
      },
      {
        reportId: "fitness-live-transfer-interaction-123",
        reportType: "bug",
        reporterUserKind: "human",
        transferSource: "fitness-discord-interaction",
        sourceProof: "discord-signature-verified-by-fitness",
      },
      true,
    ),
    {
      report_id: "fitness-live-transfer-interaction-123",
      report_type: "bug",
      reporter_user_kind: "human",
      transfer_source: "fitness-discord-interaction",
      source_proof: "discord-signature-verified-by-fitness",
    },
  );
});

test("persisted writer reports database failure without returning secret values", async () => {
  const result = await _internals.insertFeedbackReport(
    { report_id: "feedback-123", report_type: "bug" },
    {
      supabaseUrl: "https://nwexsktuuenfdegzrbut.supabase.co",
      serviceRoleKey: "service-role-test-key",
      fetchImpl: async () => ({
        ok: false,
        status: 404,
        async json() {
          return { code: "PGRST106", message: "schema not exposed" };
        },
      }),
    }
  );

  assert.deepEqual(result, {
    ok: false,
    status: 404,
    code: "PGRST106",
  });
});
