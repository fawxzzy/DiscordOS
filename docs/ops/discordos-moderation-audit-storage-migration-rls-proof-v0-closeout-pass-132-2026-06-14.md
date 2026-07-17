# DiscordOS Moderation Audit Storage Migration RLS Proof v0 Closeout

Date: 2026-06-14

## Marker

- DiscordOS Moderation Audit Storage Migration RLS Proof v0: `100%`

## Completed Work

- Added `supabase/migrations/20260615005542_discordos_moderation_audit_log.sql`.
- Extended `scripts/discordos-storage-migration-rls-proof.js` for moderation audit storage proof.
- Added moderation coverage to `tests/discordos-storage-migration-rls-proof.test.js`.
- Added `npm run ops:discordos:moderation-storage-migration-rls-proof`.
- Added the focused verify command to `verify:_inner`.
- Documented the operator command and migration draft in `README.md`.
- Ratcheted moderation registry posture to `shadow` while live moderation remains disabled.

## Result

Moderation now has a committed private Supabase migration draft for `discordos.discordos_moderation_audit_log` with:

- RLS enabled
- public, anon, and authenticated access revoked
- service-role-only table access
- sanitized actor and subject fingerprints instead of raw user ids
- moderation audit indexes
- no public policies
- no migration apply step

## Supabase Note

- Current Supabase changelog check completed.
- Relevant item: the April 28, 2026 breaking change that new tables may not be exposed to Data/GraphQL APIs automatically.
- This migration stays in the private `discordos` schema and keeps public/anon/authenticated access revoked.
- Supabase CLI was unavailable in this shell, so the repo's existing timestamped migration-file convention was used instead of `supabase migration new`.

## Proof

- `npm run verify:discordos-storage-migration-rls-proof`
- `npm run verify:discordos-feature-contract-registry-dashboard`
- `npm run verify:feedback-adapters`

## Boundary

- sends Discord messages: `false`
- writes artifacts: `false`
- applies database migrations: `false`
- grants public Data API access: `false`
- admits live moderation behavior: `false`
- touches Fitness product code: `false`
- reads or prints secret values: `false`
