# DiscordOS Docs

This docs surface is reserved for DiscordOS-owned runtime, workflow, and migration documentation.

Current status:

- standalone DiscordOS runtime infrastructure is live
- feedback workflow cutover is proof-closed
- no Fitness product code has been migrated here
- broader server, bot, publication, moderation, and product hardening work remains open unless a specific lane admits it
- generic runtime-health snapshots now have repo-local summary, freshness, stale-history audit, one-command live check, alert-threshold decision, durable alert-decision snapshot, cron-ready scheduled proof, artifact-rollup, non-destructive retention-plan, operations-admission commands, a guarded Vercel Cron runtime-health endpoint with gated critical-alert delivery, repeatable production cron guard proof, scheduled cron log proof, authorized cron proof with delivery-gate validation, read-only alert target admission, read-only status board, and critical-only alert delivery commands with repeat suppression
- curated `#updates` publication now has a DiscordOS-owned dry-run-first command with green embed formatting, disabled mentions, guarded apply checks, status inspection, and receipt audit rollups

Current governed docs surface:

- `contracts/feedback-runtime.md`
  - feedback runtime contract and boundary surface
  - documents the seam between Fitness-owned product state and DiscordOS-owned runtime state
- `ops/`
  - DiscordOS runtime setup, readiness, cutover, and proof receipts
