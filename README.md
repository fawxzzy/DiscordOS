# DiscordOS

DiscordOS is the future canonical repo for Discord-owned runtime and workflow surfaces in the ATLAS stack.

Current status:

- bootstrap only
- no Fitness code migrated
- no bot/runtime cutover
- no writer activation or Fitness traffic transfer
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
  - validates that any service-role JWT is for `role=service_role` and ref `nwexsktuuenfdegzrbut`
  - can also prove the Supabase Edge Function has DiscordOS-owned service-role access without moving that service-role value into Vercel
  - can validate the Discord bot token with a read-only Discord `/users/@me` probe without sending messages or returning bot identity values
- `api/activation.js`
  - fail-closed activation guard for future writer, traffic-transfer, rollback, and parity-proof switches
  - defaults to no cutover and no Fitness traffic movement
- `api/feedback-shadow.js`
  - shadow writer proof endpoint for validating future DiscordOS feedback row shape
  - returns `persisted: false`, `writesDiscord: false`, `writesFitness: false`, and `trafficMoved: false`
- `api/feedback-persist.js`
  - guarded persisted writer endpoint for the future DiscordOS feedback row path
  - can use either direct backend service-role env or the JWT-required Supabase Edge writer path
  - fails closed unless the persisted writer flag, writer mode, Supabase URL, and one backend persistence runtime are present
  - never sends Discord messages, writes Fitness, or moves traffic
- `tests/readiness.test.js`
  - fail-closed readiness tests for missing, malformed, anon-role, wrong-project, exact DiscordOS service-role JWT, Edge Function service-role probe shapes, and Discord bot-token probe shapes
- `tests/activation.test.js`
  - fail-closed activation guard tests for default-disabled, shadow, invalid mode, and explicit active cutover conditions
- `tests/feedback-shadow.test.js`
  - fail-closed shadow writer tests for invalid payloads and deterministic no-persistence row preview
- `tests/feedback-persist.test.js`
  - fail-closed persisted writer tests for disabled/missing-service-role states and service-role REST insert request construction
- `supabase/functions/discordos-readiness/index.ts`
  - JWT-protected Supabase Edge Function readiness mirror
  - probes service-role access to the private `discordos` schema without returning secret values
- `supabase/functions/discordos-feedback-persist/index.ts`
  - JWT-protected proof-only Supabase Edge Function writer for `discordos.discord_feedback_reports`
  - requires proof report ids to use the `edge-persist-proof-` prefix
  - writes no Discord messages, writes no Fitness state, and moves no traffic
- `docs/ops/discordos-runtime-readiness-surface-pass-1-2026-06-12.md`
  - runtime-readiness receipt without Discord bot activation or Fitness traffic cutover
- `docs/ops/discordos-bot-token-runtime-readiness-proof-2026-06-12.md`
  - owner-side proof that DiscordOS can verify the bot credential from runtime without activating writers or moving Fitness traffic
- `docs/ops/discordos-activation-guard-readiness-proof-2026-06-12.md`
  - owner-side proof that DiscordOS has a fail-closed activation, rollback, traffic-transfer, and parity guard before any live writer is allowed
- `docs/ops/discordos-feedback-shadow-writer-readiness-proof-2026-06-12.md`
  - owner-side proof that DiscordOS can validate a future feedback writer payload and row preview without persisting data or moving traffic
- `docs/ops/discordos-persisted-writer-implementation-proof-2026-06-12.md`
  - owner-side proof that DiscordOS has a guarded persisted writer implementation path, still disabled without live cutover or Fitness traffic movement

Current repo-local verification surface:

- `npm run verify:feedback-adapters`
  - no-emit TypeScript verification for feedback contracts and adapter seams only
- `npm run verify:readiness`
  - Node test coverage for the Vercel readiness service-role guard, Supabase Edge probe, and Discord bot-token probe
- `npm run verify:activation`
  - Node test coverage for the activation guard
- `npm run verify:feedback-shadow`
  - Node test coverage for the shadow writer proof surface
- `npm run verify:feedback-persist`
  - Node test coverage for the persisted writer guard and REST insert construction
- `npm run verify`
  - runs both verification surfaces

Until a later approved extraction lane opens, this repo is a governed landing surface for future DiscordOS work, not an active runtime owner.
