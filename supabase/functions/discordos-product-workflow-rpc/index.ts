import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_REF = "nwexsktuuenfdegzrbut";
const FUNCTION_NAME = "discordos-product-workflow-rpc";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const allowedRpcs = new Set([
  "discordos_upsert_board_card",
  "discordos_insert_moderation_audit",
  "discordos_get_product_workflow_readback",
  "discordos_search_moderation_audit",
]);

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
    Deno.env.get("DISCORDOS_SUPABASE_SERVICE_ROLE_KEY") ??
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

  const body = await readJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response(
      JSON.stringify({ ok: false, error: "INVALID_PAYLOAD" }),
      { status: 400, headers: jsonHeaders }
    );
  }

  const rpc = typeof body.rpc === "string" ? body.rpc.trim() : "";
  if (!allowedRpcs.has(rpc)) {
    return new Response(
      JSON.stringify({ ok: false, error: "UNSUPPORTED_RPC" }),
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
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body.payload ?? {}),
  });
  const responsePayload = await response.json().catch(() => null);

  if (!response.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        service: FUNCTION_NAME,
        rpc,
        error: "DATABASE_RPC_FAILED",
        databaseStatus: response.status,
        databaseErrorCode: typeof responsePayload?.code === "string" ? responsePayload.code : null,
      }),
      { status: 502, headers: jsonHeaders }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      service: FUNCTION_NAME,
      rpc,
      payload: responsePayload,
      generatedAt: new Date().toISOString(),
    }),
    { status: 200, headers: jsonHeaders }
  );
});
