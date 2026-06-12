# DiscordOS

DiscordOS is the future canonical repo for Discord-owned runtime and workflow surfaces in the ATLAS stack.

Current status:

- bootstrap only
- no Fitness code migrated
- no bot/runtime cutover
- Supabase schema landing exists for private DiscordOS feedback runtime tables
- Vercel project linkage exists for `fawxzzy-discordos`
- feedback contract scaffold documented only

Current governed contract surface:

- `docs/contracts/feedback-runtime.md`
  - first DiscordOS-owned feedback-domain contract scaffold
  - no copied Fitness implementation
  - no runtime, database, or env dependency yet
- `src/contracts/feedback.ts`
  - code-facing type/interface seam only
  - no adapters, runtime behavior, database client, or env coupling
- `src/adapters/feedback/index.ts`
  - adapter slot and bundle types only
  - still no implementation, runtime behavior, or service clients
- `src/adapters/feedback/lookup/types.ts`
  - raw injected lookup-provider shape only
  - no Fitness runtime import, no transport wiring, no adapter behavior yet
- `supabase/migrations/20260612082758_discordos_feedback_runtime_schema_v1.sql`
  - private DiscordOS feedback runtime schema mirror
  - RLS enabled with no public policies
  - service-role-only operational grant posture
- `docs/ops/discordos-feedback-runtime-schema-and-vercel-linkage-2026-06-12.md`
  - owner-side setup receipt for Supabase schema landing and Vercel linkage
- `api/readiness.js`
  - first Vercel serverless readiness endpoint
  - reports configuration presence only, not secret values
- `supabase/functions/discordos-readiness/index.ts`
  - JWT-protected Supabase Edge Function readiness mirror
- `docs/ops/discordos-runtime-readiness-surface-pass-1-2026-06-12.md`
  - runtime-readiness receipt without Discord bot activation or Fitness traffic cutover

Current repo-local verification surface:

- `npm run verify:feedback-adapters`
  - no-emit TypeScript verification for feedback contracts and adapter seams only

Until a later approved extraction lane opens, this repo is a governed landing surface for future DiscordOS work, not an active runtime owner.
