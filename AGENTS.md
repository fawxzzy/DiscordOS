# DiscordOS Repo Rules

Scope
- Applies to `repos/DiscordOS`.

Purpose
- This is the canonical local DiscordOS repo surface created by the approved bootstrap pass.
- During bootstrap, this repo is governance-first and intentionally minimal.

Rules
- Do not migrate Fitness code here without an explicit extraction package.
- Do not add env files or secrets to the repo root.
- Treat ATLAS-root DiscordOS separation receipts as the current authority until repo-local runtime contracts exist.

Verification
- Run the repo-local verify command once a real runtime/tooling surface exists.
- Until then, use ATLAS root validation for bootstrap and governance-only changes.
