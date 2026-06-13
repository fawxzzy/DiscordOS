import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_REF = "nwexsktuuenfdegzrbut";
const FUNCTION_NAME = "discordos-runtime-health-cron-audit";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function hasValue(value: string | undefined): value is string {
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

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: jsonHeaders }
    );
  }

  const payload = await readJson(req);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return new Response(
      JSON.stringify({ ok: false, error: "INVALID_PAYLOAD" }),
      { status: 400, headers: jsonHeaders }
    );
  }

  const key = serviceCredential();
  if (!hasValue(key)) {
    return new Response(
      JSON.stringify({ ok: false, error: "SERVICE_CREDENTIAL_MISSING" }),
      { status: 503, headers: jsonHeaders }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? `https://${PROJECT_REF}.supabase.co`;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/discordos_insert_runtime_health_cron_run`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ payload }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        service: FUNCTION_NAME,
        error: "CRON_AUDIT_WRITE_FAILED",
        databaseStatus: response.status,
        databaseErrorCode: typeof body?.code === "string" ? body.code : null,
      }),
      { status: 502, headers: jsonHeaders }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      service: FUNCTION_NAME,
      row: Array.isArray(body) ? body[0] : body,
    }),
    { status: 201, headers: jsonHeaders }
  );
});
