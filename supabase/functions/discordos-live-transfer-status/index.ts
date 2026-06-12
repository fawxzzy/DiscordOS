import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_REF = "nwexsktuuenfdegzrbut";

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

async function getLiveTransferStatus(key: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? `https://${PROJECT_REF}.supabase.co`;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/discordos_get_live_transfer_status`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{}",
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { ...jsonHeaders, Allow: "GET" },
    });
  }

  const key = serviceCredential();
  if (!hasValue(key)) {
    return new Response(
      JSON.stringify({
        ok: false,
        service: "discordos-live-transfer-status",
        error: "MISSING_SERVICE_CREDENTIAL",
        liveSignedTransferReady: false,
      }),
      { status: 500, headers: jsonHeaders }
    );
  }

  const status = await getLiveTransferStatus(key);
  if (!status.response.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        service: "discordos-live-transfer-status",
        error: "STATUS_QUERY_FAILED",
        databaseStatus: status.response.status,
        databaseErrorCode: typeof status.payload?.code === "string" ? status.payload.code : "SUPABASE_QUERY_FAILED",
        liveSignedTransferReady: false,
      }),
      { status: 502, headers: jsonHeaders }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      service: "discordos-live-transfer-status",
      runtime: "supabase-edge-function",
      jwtRequired: true,
      supabaseProjectRef: PROJECT_REF,
      ...status.payload,
      generatedAt: new Date().toISOString(),
    }),
    { status: 200, headers: jsonHeaders }
  );
});
