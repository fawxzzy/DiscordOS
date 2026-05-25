# DiscordOS

DiscordOS is the future canonical repo for Discord-owned runtime and workflow surfaces in the ATLAS stack.

Current status:

- bootstrap only
- no Fitness code migrated
- no bot/runtime cutover
- no Supabase schema landing
- no Vercel project linkage
- feedback contract scaffold documented only

Current governed contract surface:

- `docs/contracts/feedback-runtime.md`
  - first DiscordOS-owned feedback-domain contract scaffold
  - no copied Fitness implementation
  - no runtime, database, or env dependency yet
- `src/contracts/feedback.ts`
  - code-facing type/interface seam only
  - no adapters, runtime behavior, database client, or env coupling

Until a later approved extraction lane opens, this repo is a governed landing surface for future DiscordOS work, not an active runtime owner.
