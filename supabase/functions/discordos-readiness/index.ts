import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: jsonHeaders }
    );
  }

  const payload = {
    ok: true,
    service: "discordos-readiness",
    runtime: "supabase-edge-function",
    jwtRequired: true,
    supabaseProjectRef: "nwexsktuuenfdegzrbut",
    schema: "discordos",
    tables: [
      "discord_feedback_reports",
      "discord_feedback_audit_events",
      "discord_feedback_completion_reviews",
    ],
    liveCutover: false,
    fitnessTrafficMoved: false,
    generatedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: jsonHeaders,
  });
});
