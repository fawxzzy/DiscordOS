import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_REF = "nwexsktuuenfdegzrbut";
const FUNCTION_NAME = "discordos-update-drafts";
const actionToRpc = {
  list_latest: "discordos_list_update_drafts",
  find_by_deployment_id: "discordos_get_update_draft_by_deployment_id",
  find_by_id: "discordos_get_update_draft_by_id",
  find_by_prefix: "discordos_get_update_draft_by_prefix",
  insert: "discordos_insert_update_draft",
  update: "discordos_update_update_draft",
} as const;

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

function normalizePayloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function discordUpdateDraftsRpcRequest(args: {
  key: string;
  rpc: string;
  body?: Record<string, unknown>;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? `https://${PROJECT_REF}.supabase.co`;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${args.rpc}`, {
    method: "POST",
    headers: {
      apikey: args.key,
      Authorization: `Bearer ${args.key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    // All DiscordOS update-draft RPC wrappers accept a single jsonb `payload` argument.
    body: JSON.stringify({ payload: args.body ?? {} }),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: { ...jsonHeaders, Allow: "POST" } },
    );
  }

  const body = await readJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response(
      JSON.stringify({ ok: false, error: "INVALID_PAYLOAD" }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const payload = normalizePayloadRecord(body.payload);
  if (!(action in actionToRpc)) {
    return new Response(
      JSON.stringify({ ok: false, error: "UNSUPPORTED_ACTION" }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const key = serviceCredential();
  if (!hasValue(key)) {
    return new Response(
      JSON.stringify({ ok: false, error: "SERVICE_CREDENTIAL_MISSING" }),
      { status: 503, headers: jsonHeaders },
    );
  }

  const rpc = actionToRpc[action as keyof typeof actionToRpc];
  let upstream;
  if (action === "list_latest") {
    upstream = await discordUpdateDraftsRpcRequest({
      key,
      rpc,
      body: {
        limit: payload.limit,
        status: payload.status,
      },
    });
  } else if (action === "find_by_deployment_id") {
    const deploymentId = typeof payload.deploymentId === "string" ? payload.deploymentId.trim() : "";
    if (!deploymentId) {
      return new Response(
        JSON.stringify({ ok: false, error: "DEPLOYMENT_ID_REQUIRED" }),
        { status: 400, headers: jsonHeaders },
      );
    }
    upstream = await discordUpdateDraftsRpcRequest({
      key,
      rpc,
      body: { deployment_id: deploymentId },
    });
  } else if (action === "find_by_id") {
    const draftId = typeof payload.draftId === "string" ? payload.draftId.trim() : "";
    if (!draftId) {
      return new Response(
        JSON.stringify({ ok: false, error: "DRAFT_ID_REQUIRED" }),
        { status: 400, headers: jsonHeaders },
      );
    }
    upstream = await discordUpdateDraftsRpcRequest({
      key,
      rpc,
      body: { id: draftId },
    });
  } else if (action === "find_by_prefix") {
    const lowerBound = typeof payload.lowerBound === "string" ? payload.lowerBound.trim() : "";
    const upperBound = typeof payload.upperBound === "string" ? payload.upperBound.trim() : "";
    if (!lowerBound || !upperBound) {
      return new Response(
        JSON.stringify({ ok: false, error: "DRAFT_ID_BOUNDS_REQUIRED" }),
        { status: 400, headers: jsonHeaders },
      );
    }
    upstream = await discordUpdateDraftsRpcRequest({
      key,
      rpc,
      body: {
        lower_bound: lowerBound,
        upper_bound: upperBound,
        limit: payload.limit,
      },
    });
  } else if (action === "insert") {
    upstream = await discordUpdateDraftsRpcRequest({
      key,
      rpc,
      body: normalizePayloadRecord(payload.values),
    });
  } else {
    const draftId = typeof payload.draftId === "string" ? payload.draftId.trim() : "";
    if (!draftId) {
      return new Response(
        JSON.stringify({ ok: false, error: "DRAFT_ID_REQUIRED" }),
        { status: 400, headers: jsonHeaders },
      );
    }
    upstream = await discordUpdateDraftsRpcRequest({
      key,
      rpc,
      body: {
        id: draftId,
        ...normalizePayloadRecord(payload.values),
      },
    });
  }

  if (!upstream.response.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        service: FUNCTION_NAME,
        action,
        rpc,
        error: "DATABASE_RPC_FAILED",
        databaseStatus: upstream.response.status,
        databaseErrorCode: typeof upstream.payload?.code === "string" ? upstream.payload.code : null,
      }),
      { status: 502, headers: jsonHeaders },
    );
  }

  const rows = Array.isArray(upstream.payload)
    ? upstream.payload
    : upstream.payload
      ? [upstream.payload]
      : [];

  return new Response(
    JSON.stringify({
      ok: true,
      service: FUNCTION_NAME,
      action,
      rpc,
      rows,
      generatedAt: new Date().toISOString(),
    }),
    { status: 200, headers: jsonHeaders },
  );
});
