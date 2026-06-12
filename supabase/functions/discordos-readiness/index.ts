import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_REF = "nwexsktuuenfdegzrbut";
const SCHEMA = "discordos";

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

async function probeServiceRole() {
  const key = serviceCredential();
  if (!hasValue(key)) {
    return {
      serviceRoleKeyPresent: false,
      serviceRoleProbeOk: false,
      serviceRoleProbeStatus: null,
      serviceRoleProbeReason: "missing_service_credential",
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? `https://${PROJECT_REF}.supabase.co`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  return {
    serviceRoleKeyPresent: true,
    serviceRoleProbeOk: response.ok,
    serviceRoleProbeStatus: response.status,
    serviceRoleProbeReason: response.ok ? "service_role_auth_admin_read_ok" : "service_role_auth_admin_read_failed",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: jsonHeaders }
    );
  }

  const serviceRoleProbe = await probeServiceRole();

  const payload = {
    ok: true,
    service: "discordos-readiness",
    runtime: "supabase-edge-function",
    jwtRequired: true,
    supabaseProjectRef: PROJECT_REF,
    schema: SCHEMA,
    tables: [
      "discord_feedback_reports",
      "discord_feedback_audit_events",
      "discord_feedback_completion_reviews",
    ],
    ...serviceRoleProbe,
    liveCutover: false,
    fitnessTrafficMoved: false,
    generatedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: jsonHeaders,
  });
});
