const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/feedback-shadow");

test("feedback shadow payload rejects non-object input", () => {
  const result = _internals.normalizeShadowFeedbackPayload(null);

  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_INPUT");
  assert.deepEqual(result.errors, ["payload_must_be_object"]);
});

test("feedback shadow payload requires report identity and type", () => {
  const result = _internals.normalizeShadowFeedbackPayload({});

  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_INPUT");
  assert.deepEqual(result.errors, ["report_id_required", "report_type_required"]);
});

test("feedback shadow payload rejects unsupported enum and field types", () => {
  const result = _internals.normalizeShadowFeedbackPayload({
    reportId: "feedback-1",
    reportType: "other",
    status: "done",
    completionReviewStatus: "complete",
    reporterUserKind: "bot",
    reporterMemberNumber: "17",
    shortDisplayId: 123,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_INPUT");
  assert.deepEqual(result.errors, [
    "report_type_invalid",
    "report_type_required",
    "status_invalid",
    "completion_review_status_invalid",
    "reporter_user_kind_invalid",
    "short_display_id_must_be_string",
    "reporter_member_number_must_be_integer",
  ]);
});

test("feedback shadow payload creates deterministic no-persistence row preview", () => {
  const result = _internals.normalizeShadowFeedbackPayload(
    {
      reportId: "feedback-123",
      reportType: "bug",
      shortDisplayId: "BUG-123",
      reporterDiscordUserId: "111222333444555666",
      reporterFitnessUserId: "fitness-user-1",
      reporterMemberNumber: 42,
      reporterUserKind: "human",
      forumChannelId: "777",
      forumThreadId: "888",
      forumMessageId: "999",
      forumTitle: "Bug: shadow proof",
      statusNote: "Validated only",
    },
    { now: "2026-06-12T15:30:00.000Z" }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    report_id: "feedback-123",
    report_type: "bug",
    short_display_id: "BUG-123",
    created_at: "2026-06-12T15:30:00.000Z",
    updated_at: "2026-06-12T15:30:00.000Z",
    reporter_discord_user_id: "111222333444555666",
    reporter_fitness_user_id: "fitness-user-1",
    reporter_member_number: 42,
    reporter_user_kind: "human",
    forum_channel_id: "777",
    forum_thread_id: "888",
    forum_message_id: "999",
    status: "new",
    completion_review_status: "not_required",
    status_updated_at: null,
    status_updated_by_discord_user_id: null,
    status_note: "Validated only",
    completion_reviewed_at: null,
    completion_reviewed_by_discord_user_id: null,
    completion_review_note: null,
    forum_title: "Bug: shadow proof",
    forum_applied_tag_ids: [],
    reporter_mentioned_at: null,
    runtime_warnings: ["shadow_writer_no_persistence"],
    last_forum_sync_at: null,
  });
});
