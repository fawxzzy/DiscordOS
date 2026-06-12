# DiscordOS Edge Service-Role Readiness Probe - 2026-06-12

- Date: `2026-06-12`
- Scope: `service-role proof path without moving service-role into Vercel`
- Supabase project ref: `nwexsktuuenfdegzrbut`
- Vercel project: `fawxzzy-discordos`

## What Landed

- Updated the Supabase Edge Function `discordos-readiness` to perform a read-only service-role probe against the DiscordOS project's Auth Admin API.
- Updated the Vercel readiness endpoint to call the Edge Function using a DiscordOS anon JWT.
- Kept the privileged service-role value inside Supabase Edge Function runtime instead of copying it into Vercel.
- Added readiness test coverage for:
  - missing Edge probe config
  - successful DiscordOS Edge service-role probe
  - wrong-project Edge probe rejection

## Boundary

This packet proves a service-role access path can exist without Vercel storing the service-role credential. The probe uses Auth Admin because the private `discordos` schema is intentionally not exposed through PostgREST.

It does not:

- expose the service-role value
- create `.env` files
- activate a Discord bot runtime
- move Fitness traffic
- execute rollback
- prove live workflow parity

## Remaining Cutover Gate

After live deployment, `/api/readiness` may report service-role readiness through:

- `serviceRoleRuntime: supabase-edge-function`
- `edgeServiceRoleConfigured: true`
- `edgeServiceRoleProbeOk: true`

That still does not by itself prove Discord bot runtime ownership, Fitness-to-DiscordOS traffic transfer, rollback, or live workflow parity.
