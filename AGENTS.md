# DiscordOS Repo Rules

Scope
- Applies to `repos/DiscordOS`.

Purpose
- This is the canonical local DiscordOS repo surface created by the approved bootstrap pass.
- During bootstrap, this repo is governance-first and intentionally minimal.
- This repo is also the canonical admitted bot-publication path for live Fitness Discord forum-card edits and `#updates` posts when operator env readiness is `status: ready`.

Rules
- Do not migrate Fitness code here without an explicit extraction package.
- Do not add env files or secrets to the repo root.
- Treat ATLAS-root DiscordOS separation receipts as the current authority until repo-local runtime contracts exist.
- For live Fitness Discord mutations, prove operator env admission first with:
  - `npm run ops:production-env:run -- npm run ops:discordos:env-readiness:json`
- If readiness is `status: ready`, prefer the repo-owned bot command family over browser or desktop fallback assumptions.

Verification
- Run the repo-local verify command once a real runtime/tooling surface exists.
- Until then, use ATLAS root validation for bootstrap and governance-only changes.
