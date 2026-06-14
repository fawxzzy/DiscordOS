# DiscordOS Docs

This docs surface is reserved for DiscordOS-owned runtime, workflow, and migration documentation.

Current status:

- standalone DiscordOS runtime infrastructure is live
- feedback workflow cutover is proof-closed
- no Fitness product code has been migrated here
- broader server, bot, publication, moderation, and product hardening work remains open unless a specific lane admits it
- generic runtime-health snapshots now have repo-local summary, freshness, stale-history audit, one-command live check, alert-threshold decision, durable alert-decision snapshot, cron-ready scheduled proof, artifact-rollup, non-destructive retention-plan, operations-admission commands, a guarded Vercel Cron runtime-health endpoint with gated critical-alert delivery, repeatable production cron guard proof, scheduled cron log proof, authorized cron proof with delivery-gate validation, read-only alert target admission, read-only status board, and critical-only alert delivery commands with repeat suppression
- curated `#updates` publication now has a DiscordOS-owned dry-run-first command with green embed formatting, disabled mentions, guarded apply checks, status inspection, receipt audit rollups, a combined operator status bundle, a next-work recommender, pulled-env normalization for Discord target values, and no-secret operator env readiness checks
- shared DiscordOS data contract docs and type-only source now exist for feedback, publication, moderation, Music Sesh, board, and operator domains without opening those feature lanes
- moderation workflow v0 and board/card workflow v0 now have contract-only docs plus type-only source seams, still below live feature behavior

Current governed docs surface:

- `contracts/feedback-runtime.md`
  - feedback runtime contract and boundary surface
  - documents the seam between Fitness-owned product state and DiscordOS-owned runtime state
- `contracts/discordos-data-runtime.md`
  - shared DiscordOS data-contract boundary surface
  - keeps future feature data work contract-first and runtime-free until explicit lane admission
- `contracts/discordos-moderation-workflow-v0.md`
  - contract-only moderation workflow boundary
  - keeps moderation cases and actions typed without granting live moderation authority
- `contracts/discordos-board-card-workflow-v0.md`
  - contract-only board/card workflow boundary
  - keeps card transitions tied to existing no-send-first publication guardrails
- `ops/`
  - DiscordOS runtime setup, readiness, cutover, and proof receipts
