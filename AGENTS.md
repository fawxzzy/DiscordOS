# DiscordOS Repo Rules

Scope
- Applies to `repos/DiscordOS`.

Purpose
- This is the canonical local DiscordOS repo surface created by the approved bootstrap pass.
- During bootstrap, this repo is governance-first and intentionally minimal.
- This repo is also the canonical admitted bot-publication path for live project Discord forum-card edits and `#updates` posts when operator env readiness is `status: ready`.

Rules
- Do not migrate Fitness code here without an explicit extraction package.
- Do not add env files or secrets to the repo root.
- Treat ATLAS-root DiscordOS separation receipts as the current authority until repo-local runtime contracts exist.
- Treat every Vercel production deploy, promotion, rollback/promotion, or production-alias cutover as approval-gated.
- Do not run any production-targeting Vercel mutation for DiscordOS unless the operator explicitly says so in the current thread with wording such as `deploy to prod`, `deploy to production`, or `promote DiscordOS on Vercel`.
- Generic approval such as `continue`, `proceed`, `do it`, or broad batch approval does not count as Vercel production deploy approval.
- For live Discord mutations, prove operator env admission first with:
  - `npm run ops:production-env:run -- npm run ops:discordos:env-readiness:json`
- If readiness is `status: ready`, prefer the repo-owned bot command family over browser or desktop fallback assumptions.
- Treat read-model commands such as `*:feedback-board:json` as local/config proof only. They do not prove that Discord changed.
- For board/forum work, use the bot-backed live command through `ops:production-env:run`, then run a bot-backed readback command against the exact target channel/thread before claiming Discord changed.
- For legacy forum cleanup, use guarded readback first. Rename/archive/delete requires a repo-owned cleanup command with target-id, target-name, env, apply, and destructive confirmation guards.

Verification
- Run the repo-local verify command once a real runtime/tooling surface exists.
- Until then, use ATLAS root validation for bootstrap and governance-only changes.
