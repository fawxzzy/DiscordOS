# DiscordOS Service-Role Readiness Guard - 2026-06-12

- Date: `2026-06-12`
- Scope: `service-role readiness proof hardening without cutover`
- Vercel project: `fawxzzy-discordos`
- Supabase project ref: `nwexsktuuenfdegzrbut`

## What Landed

- Hardened `api/readiness.js` so `serviceRoleConfigured` is true only when `DISCORDOS_SUPABASE_SERVICE_ROLE_KEY` decodes as:
  - `role: service_role`
  - `ref: nwexsktuuenfdegzrbut`
- Added readiness detail booleans:
  - `serviceRolePresent`
  - `serviceRoleRoleMatches`
  - `serviceRoleProjectRefMatches`
  - `serviceRoleReason`
- Added `tests/readiness.test.js` with fail-closed coverage for:
  - missing key
  - malformed token
  - anon/publishable-style JWT role
  - Fitness project service-role JWT
  - exact DiscordOS service-role JWT
- Updated `npm run verify` and `npm run vercel-build` to include readiness tests.

## Boundary

This packet does not:

- create or read secret values
- add `.env` files
- activate a Discord bot runtime
- move Fitness traffic
- execute rollback
- prove live workflow parity

## Remaining Blocker

`DISCORDOS_SUPABASE_SERVICE_ROLE_KEY` must still be provisioned with the exact DiscordOS project service-role key for `nwexsktuuenfdegzrbut`, then readiness must report:

- `serviceRoleConfigured: true`
- `serviceRoleRoleMatches: true`
- `serviceRoleProjectRefMatches: true`
- `discordBotTokenConfigured: true`

After that, the lane still needs writer activation, traffic transfer, rollback proof, and live workflow parity proof before `100%`.
