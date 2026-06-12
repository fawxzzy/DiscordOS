# DiscordOS Feedback Runtime Schema And Vercel Linkage - 2026-06-12

- Date: `2026-06-12`
- Scope: `DiscordOS owner-side setup packet`
- Supabase project: `DiscordOS`
- Supabase ref: `nwexsktuuenfdegzrbut`
- Vercel project: `fawxzzy-discordos`
- Vercel project id: `prj_C2RSEa34OblHfhuEpVChRQQZSjuG`
- GitHub repo: `fawxzzy/DiscordOS`

## What Landed

- Created the Vercel project `fawxzzy-discordos` under team `fawxzzy`.
- Linked local `repos/DiscordOS` to the Vercel project through `.vercel/project.json`.
- Connected the Vercel project to `https://github.com/fawxzzy/DiscordOS.git`.
- Added non-secret Vercel environment metadata:
  - `DISCORDOS_SUPABASE_URL`
  - `DISCORDOS_SUPABASE_PROJECT_REF`
- Applied Supabase migration `20260612082758_discordos_feedback_runtime_schema_v1`.
- Applied Supabase migration `20260612082854_discordos_set_updated_at_search_path`.
- Mirrored the schema migration under `supabase/migrations/20260612082758_discordos_feedback_runtime_schema_v1.sql`.

## Schema

Created private schema:

- `discordos`

Created RLS-enabled tables:

- `discordos.discord_feedback_reports`
- `discordos.discord_feedback_audit_events`
- `discordos.discord_feedback_completion_reviews`

The schema is intentionally private:

- no `anon` grants
- no `authenticated` grants
- service-role-only operational grant posture
- no public RLS policies

## Verification

- Supabase migrations list includes:
  - `discordos_feedback_runtime_schema_v1`
  - `discordos_set_updated_at_search_path`
- Supabase table listing shows all three `discordos.*` tables with RLS enabled.
- Supabase security advisor no longer reports a warning for `discordos.set_updated_at`.
- Vercel project list includes `fawxzzy-discordos`.
- Vercel env list includes production/development metadata and current-branch preview metadata.
- GitHub connector confirms writable access to `fawxzzy/DiscordOS`.

## Still Not Runtime

This packet does not:

- deploy DiscordOS
- activate a Discord bot
- move Fitness runtime traffic
- backfill rows from Fitness
- create service-role secret values
- add a Supabase client
- add Edge Functions
- widen live workflow parity

## Remaining Cutover Blocker

`runtime ownership and live workflow parity proof`

The infrastructure setup blocker is materially reduced because Vercel linkage and Supabase schema landing now exist. The lane is still not release-complete until a later runtime packet proves server-side secret provisioning, deployment, Fitness-to-DiscordOS runtime ownership transfer, rollback, and live workflow parity.
