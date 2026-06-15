# DiscordOS Supabase Migration Apply Readback Proof v0 Closeout Pass 138

Date: 2026-06-15

## Marker

- DiscordOS Supabase Migration Apply Readback Proof v0: `100%`

## Scope

Closed the Supabase apply/readback lane for the board/card and moderation audit storage migrations. The migrations were applied to the DiscordOS Supabase project and read back with private schema, RLS, no public policies, no public grants, and service-role grant posture intact.

## Applied Migrations

- `discordos_board_cards`
  - applied migration version: `20260615005519`
- `discordos_moderation_audit_log`
  - applied migration version: `20260615005542`

## Readback

- project ref: `nwexsktuuenfdegzrbut`
- `discordos.discordos_board_cards`
  - exists: `true`
  - indexes: `5`
  - RLS enabled: `true`
  - public policy count: `0`
  - public grant count: `0`
  - service-role grant count: `7`
- `discordos.discordos_moderation_audit_log`
  - exists: `true`
  - indexes: `5`
  - RLS enabled: `true`
  - public policy count: `0`
  - public grant count: `0`
  - service-role grant count: `7`

## Implementation

- Added `scripts/discordos-supabase-apply-readback-proof.js`.
- Added `tests/discordos-supabase-apply-readback-proof.test.js`.
- Added package scripts:
  - `npm run ops:discordos:supabase-apply-readback-proof`
  - `npm run ops:discordos:supabase-apply-readback-proof:json`
  - `npm run verify:discordos-supabase-apply-readback-proof`
- Documented the command in `README.md`.

## Proof

- Supabase MCP apply result for `discordos_board_cards`: `success`
- Supabase MCP apply result for `discordos_moderation_audit_log`: `success`
- Supabase MCP readback confirmed both private tables and applied migration versions above.
- `npm run ops:discordos:supabase-apply-readback-proof:json`
  - result: `pass`
  - status: `readback_proven`
- `npm run verify:discordos-supabase-apply-readback-proof`
  - result: `pass`
- `npm run verify`
  - result: `pass`

## Boundary

- no public Data API grants were introduced
- no public RLS policies were introduced
- no secrets were committed or printed
- the repo-local proof command does not apply migrations

## Next State

Board/card and moderation audit storage are now applied and readback-proven in Supabase, while runtime write execution remains guarded by the new adapter commands.
