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
  assert.equal(config.serviceRoleConfigured, false);
  assert.deepEqual(config.blockedReasons, ["missing_service_role_key"]);
});

test("persisted writer inserts through DiscordOS schema with service role headers", async () => {
  const calls = [];
  const result = await _internals.insertFeedbackReport(
    {
      report_id: "feedback-123",
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
            return [{ report_id: "feedback-123", report_type: "bug" }];
          },
        };
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.deepEqual(result.row, { report_id: "feedback-123", report_type: "bug" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://nwexsktuuenfdegzrbut.supabase.co/rest/v1/discord_feedback_reports");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, "service-role-test-key");
  assert.equal(calls[0].init.headers.Authorization, "Bearer service-role-test-key");
  assert.equal(calls[0].init.headers["Accept-Profile"], "discordos");
  assert.equal(calls[0].init.headers["Content-Profile"], "discordos");
  assert.equal(calls[0].init.headers.Prefer, "return=representation");
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
