const EXPECTED_SUPABASE_REF = "nwexsktuuenfdegzrbut";

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = function readiness(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  const configuredProjectRef = process.env.DISCORDOS_SUPABASE_PROJECT_REF || null;
  const configuredSupabaseUrl = process.env.DISCORDOS_SUPABASE_URL || null;

  return res.status(200).json({
    ok: true,
    service: "discordos-readiness",
    runtime: "vercel-serverless-function",
    supabaseProjectRefConfigured: configuredProjectRef === EXPECTED_SUPABASE_REF,
    supabaseUrlConfigured: hasValue(configuredSupabaseUrl),
    serviceRoleConfigured: hasValue(process.env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY),
    discordBotTokenConfigured: hasValue(process.env.DISCORDOS_BOT_TOKEN),
    liveCutover: false,
    fitnessTrafficMoved: false,
    generatedAt: new Date().toISOString(),
  });
};
