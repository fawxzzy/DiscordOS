const REPORT_TYPES = new Set(["bug", "feature", "fix"]);
const FEEDBACK_STATUSES = new Set([
  "new",
  "needs_info",
  "confirmed",
  "fawxzzy_review",
  "in_progress",
  "fixed",
  "closed",
  "duplicate",
  "spam",
  "withdrawn",
]);
const COMPLETION_REVIEW_STATUSES = new Set(["not_required", "pending", "approved", "needs_followup"]);
const USER_KINDS = new Set(["human", "automation", "unknown"]);
const MAX_BODY_BYTES = 16 * 1024;

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value, fieldName, errors) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${fieldName}_must_be_string`);
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalInteger(value, fieldName, errors) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value)) {
    errors.push(`${fieldName}_must_be_integer`);
    return null;
  }
  return value;
}

function enumValue(value, fieldName, allowed, fallback, errors) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "string" || !allowed.has(value)) {
    errors.push(`${fieldName}_invalid`);
    return fallback;
  }
  return value;
}

function normalizeShadowFeedbackPayload(
  payload,
  { now = new Date().toISOString(), runtimeWarnings = ["shadow_writer_no_persistence"] } = {}
) {
  const errors = [];
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      errors: ["payload_must_be_object"],
    };
  }

  const reportId = optionalString(payload.reportId, "report_id", errors);
  if (reportId === null) {
    errors.push("report_id_required");
  }

  const reportType = enumValue(payload.reportType, "report_type", REPORT_TYPES, null, errors);
  if (reportType === null) {
    errors.push("report_type_required");
  }

  const status = enumValue(payload.status, "status", FEEDBACK_STATUSES, "new", errors);
  const completionReviewStatus = enumValue(
    payload.completionReviewStatus,
    "completion_review_status",
    COMPLETION_REVIEW_STATUSES,
    "not_required",
    errors
  );
  const reporterUserKind = enumValue(payload.reporterUserKind, "reporter_user_kind", USER_KINDS, null, errors);
  const shortDisplayId = optionalString(payload.shortDisplayId, "short_display_id", errors);
  const createdAt = optionalString(payload.createdAt, "created_at", errors);
  const reporterDiscordUserId = optionalString(payload.reporterDiscordUserId, "reporter_discord_user_id", errors);
  const reporterFitnessUserId = optionalString(payload.reporterFitnessUserId, "reporter_fitness_user_id", errors);
  const reporterMemberNumber = optionalInteger(payload.reporterMemberNumber, "reporter_member_number", errors);
  const forumChannelId = optionalString(payload.forumChannelId, "forum_channel_id", errors);
  const forumThreadId = optionalString(payload.forumThreadId, "forum_thread_id", errors);
  const forumMessageId = optionalString(payload.forumMessageId, "forum_message_id", errors);
  const statusNote = optionalString(payload.statusNote, "status_note", errors);
  const forumTitle = optionalString(payload.forumTitle, "forum_title", errors);

  if (errors.length > 0) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      errors: [...new Set(errors)],
    };
  }

  return {
    ok: true,
    value: {
      report_id: reportId,
      report_type: reportType,
      short_display_id: shortDisplayId,
      created_at: createdAt || now,
      updated_at: now,
      reporter_discord_user_id: reporterDiscordUserId,
      reporter_fitness_user_id: reporterFitnessUserId,
      reporter_member_number: reporterMemberNumber,
      reporter_user_kind: reporterUserKind,
      forum_channel_id: forumChannelId,
      forum_thread_id: forumThreadId,
      forum_message_id: forumMessageId,
      status,
      completion_review_status: completionReviewStatus,
      status_updated_at: null,
      status_updated_by_discord_user_id: null,
      status_note: statusNote,
      completion_reviewed_at: null,
      completion_reviewed_by_discord_user_id: null,
      completion_review_note: null,
      forum_title: forumTitle,
      forum_applied_tag_ids: [],
      reporter_mentioned_at: null,
      runtime_warnings: runtimeWarnings,
      last_forum_sync_at: null,
    },
  };
}

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return { ok: false, status: 413, error: "PAYLOAD_TOO_LARGE" };
    }
  }

  if (!hasValue(raw)) {
    return { ok: false, status: 400, error: "EMPTY_BODY" };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: "INVALID_JSON" };
  }
}

module.exports = async function feedbackShadow(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return res.status(parsed.status).json({
      ok: false,
      error: parsed.error,
      persisted: false,
    });
  }

  const normalized = normalizeShadowFeedbackPayload(parsed.value);
  if (!normalized.ok) {
    return res.status(400).json({
      ok: false,
      error: normalized.code,
      errors: normalized.errors,
      persisted: false,
    });
  }

  return res.status(200).json({
    ok: true,
    service: "discordos-feedback-shadow-writer",
    persisted: false,
    writesDiscord: false,
    writesFitness: false,
    trafficMoved: false,
    rowPreview: normalized.value,
    generatedAt: new Date().toISOString(),
  });
};

module.exports._internals = {
  normalizeShadowFeedbackPayload,
  readJsonBody,
};
