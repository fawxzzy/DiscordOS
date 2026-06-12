import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_REF = "nwexsktuuenfdegzrbut";
const SCHEMA = "discordos";
const REPORTS_TABLE = "discord_feedback_reports";
const MAX_BODY_BYTES = 16 * 1024;
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
const PROOF_REPORT_ID_PREFIXES = ["edge-persist-proof-", "shadow-transfer-proof-", "fitness-live-transfer-"];

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function firstSecretKeyFromJson(value: string | undefined): string | undefined {
  if (!hasValue(value)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    for (const candidate of Object.values(parsed)) {
      if (typeof candidate === "string" && candidate.startsWith("sb_secret_")) {
        return candidate;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function serviceCredential(): string | undefined {
  return (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    firstSecretKeyFromJson(Deno.env.get("SUPABASE_SECRET_KEYS"))
  );
}

function optionalString(payload: Record<string, unknown>, camelName: string, rowName: string, errors: string[]) {
  const value = payload[camelName] ?? payload[rowName];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${rowName}_must_be_string`);
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalInteger(payload: Record<string, unknown>, camelName: string, rowName: string, errors: string[]) {
  const value = payload[camelName] ?? payload[rowName];
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value)) {
    errors.push(`${rowName}_must_be_integer`);
    return null;
  }
  return value;
}

function enumValue(
  payload: Record<string, unknown>,
  camelName: string,
  rowName: string,
  allowed: Set<string>,
  fallback: string | null,
  errors: string[]
) {
  const value = payload[camelName] ?? payload[rowName];
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "string" || !allowed.has(value)) {
    errors.push(`${rowName}_invalid`);
    return fallback;
  }
  return value;
}

function normalizePayload(payload: unknown, now = new Date().toISOString()) {
  const errors: string[] = [];
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, errors: ["payload_must_be_object"] };
  }

  const input = payload as Record<string, unknown>;
  const reportId = optionalString(input, "reportId", "report_id", errors);
  if (reportId === null) {
    errors.push("report_id_required");
  }
  if (reportId !== null && !PROOF_REPORT_ID_PREFIXES.some((prefix) => reportId.startsWith(prefix))) {
    errors.push("proof_report_id_prefix_required");
  }
  const shadowTransferProof = reportId?.startsWith("shadow-transfer-proof-") ?? false;
  const fitnessLiveTransferProof = reportId?.startsWith("fitness-live-transfer-") ?? false;

  const reportType = enumValue(input, "reportType", "report_type", REPORT_TYPES, null, errors);
  if (reportType === null) {
    errors.push("report_type_required");
  }

  const status = enumValue(input, "status", "status", FEEDBACK_STATUSES, "new", errors);
  const completionReviewStatus = enumValue(
    input,
    "completionReviewStatus",
    "completion_review_status",
    COMPLETION_REVIEW_STATUSES,
    "not_required",
    errors
  );
  const reporterUserKind = enumValue(input, "reporterUserKind", "reporter_user_kind", USER_KINDS, "automation", errors);

  if (errors.length > 0) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  return {
    ok: true,
    row: {
      report_id: reportId,
      report_type: reportType,
      short_display_id: optionalString(input, "shortDisplayId", "short_display_id", errors),
      created_at: optionalString(input, "createdAt", "created_at", errors) ?? now,
      updated_at: now,
      reporter_discord_user_id: optionalString(input, "reporterDiscordUserId", "reporter_discord_user_id", errors),
      reporter_fitness_user_id: optionalString(input, "reporterFitnessUserId", "reporter_fitness_user_id", errors),
      reporter_member_number: optionalInteger(input, "reporterMemberNumber", "reporter_member_number", errors),
      reporter_user_kind: reporterUserKind,
      forum_channel_id: optionalString(input, "forumChannelId", "forum_channel_id", errors),
      forum_thread_id: optionalString(input, "forumThreadId", "forum_thread_id", errors),
      forum_message_id: optionalString(input, "forumMessageId", "forum_message_id", errors),
      status,
      completion_review_status: completionReviewStatus,
      status_note: optionalString(input, "statusNote", "status_note", errors),
      forum_title: optionalString(input, "forumTitle", "forum_title", errors),
      forum_applied_tag_ids: [],
      runtime_warnings: shadowTransferProof
        ? [
            "edge_persist_writer_proof_only",
            "discordos_shadow_transfer_proof_only",
            "discordos_persisted_writer_no_live_cutover",
          ]
        : fitnessLiveTransferProof
          ? [
              "edge_persist_writer_proof_only",
              "discordos_fitness_live_transfer_proof",
              "discordos_persisted_writer_no_discord_write",
            ]
        : ["edge_persist_writer_proof_only", "discordos_persisted_writer_no_traffic_transfer"],
    },
  };
}

async function readJsonBody(req: Request) {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "PAYLOAD_TOO_LARGE" };
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

async function insertReport(row: Record<string, unknown>, key: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? `https://${PROJECT_REF}.supabase.co`;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/discordos_insert_feedback_proof`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ payload: row }),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { ...jsonHeaders, Allow: "POST" },
    });
  }

  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ ok: false, error: parsed.error, persisted: false }), {
      status: parsed.status,
      headers: jsonHeaders,
    });
  }

  const normalized = normalizePayload(parsed.value);
  if (!normalized.ok) {
    return new Response(JSON.stringify({ ok: false, error: "INVALID_INPUT", errors: normalized.errors, persisted: false }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const key = serviceCredential();
  if (!hasValue(key)) {
    return new Response(
      JSON.stringify({
        ok: false,
        service: "discordos-feedback-persist",
        error: "MISSING_SERVICE_CREDENTIAL",
        persisted: false,
        writesDiscord: false,
        writesFitness: false,
        trafficMoved: false,
      }),
      { status: 500, headers: jsonHeaders }
    );
  }

  const inserted = await insertReport(normalized.row as Record<string, unknown>, key);
  if (!inserted.response.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        service: "discordos-feedback-persist",
        error: "PERSISTENCE_FAILED",
        persisted: false,
        writesDiscord: false,
        writesFitness: false,
        trafficMoved: false,
        databaseStatus: inserted.response.status,
        databaseErrorCode: typeof inserted.payload?.code === "string" ? inserted.payload.code : "SUPABASE_WRITE_FAILED",
      }),
      { status: 502, headers: jsonHeaders }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      service: "discordos-feedback-persist",
      runtime: "supabase-edge-function",
      persisted: true,
      writesDiscord: false,
      writesFitness: false,
      trafficMoved: false,
      proofOnly: true,
      row: Array.isArray(inserted.payload) ? inserted.payload[0] : inserted.payload,
      generatedAt: new Date().toISOString(),
    }),
    { status: 201, headers: jsonHeaders }
  );
});
