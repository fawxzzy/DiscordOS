# DiscordOS Runtime Health Scheduled Proof Pass 11 - 2026-06-13

## Scope

DiscordOS now has a cron-ready scheduled proof command for runtime-health.

This pass does not install a scheduler. It only creates the command a scheduler can run later.

Boundaries preserved:

- no cron job installed
- no Discord messages sent
- no alert delivery added
- no public update published
- no moderation or Music Sesh behavior changed
- no Fitness product code changed
- no secrets committed

## Implementation

- Added `scripts/runtime-health-scheduled-proof.js`.
- Added `tests/runtime-health-scheduled-proof.test.js`.
- Added `npm run ops:runtime-health:scheduled-proof`.
- Added `npm run ops:runtime-health:scheduled-proof:json`.
- Added `npm run verify:runtime-health-scheduled-proof`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.
- Updated `docs/README.md`.

## Command Behavior

The scheduled proof command performs one fail-closed proof loop:

1. Fetch production `/api/runtime-health`.
2. Validate the live runtime-health contract.
3. Write a runtime-health snapshot under `runtime/discordos/runtime-health`.
4. Summarize snapshot history with freshness checking.
5. Build an alert clear or trigger decision.
6. Write a durable alert-decision snapshot under `runtime/discordos/runtime-health-alerts`.
7. Exit nonzero when the health check or alert decision is not clear.

Event types:

- `discordos.runtime_health.scheduled_proof_pass`
- `discordos.runtime_health.scheduled_proof_fail`

Supported options:

- `--endpoint <url>`
- `--snapshot-dir <path>`
- `--alert-dir <path>`
- `--max-age-hours <hours>`
- `--min-readiness-percent <0-100>`
- `--stale-severity warning|critical`
- `--schedule-name <name>`
- `--json`

## Verification

`npm run verify:runtime-health-scheduled-proof` passed.

The focused verifier covers:

- default production runtime-health surfaces
- custom threshold and schedule-name parsing
- green scheduled proof that writes both runtime-health and alert-decision artifacts
- fail-closed scheduled proof when live runtime health is action-required
- Markdown rendering

## Live Scheduled Proof

`npm run ops:runtime-health:scheduled-proof` returned:

- `result: pass`
- `schedule name: manual`
- `event type: discordos.runtime_health.scheduled_proof_pass`
- `event severity: info`
- `runtime health snapshot: runtime/discordos/runtime-health/2026-06-13T03-01-08-003Z-pass.json`
- `alert decision snapshot: runtime/discordos/runtime-health-alerts/2026-06-13T03-01-08-003Z-2026-06-13T03-01-08-146Z-ok.json`
- `check result: pass`
- `alert result: pass`
- `alert severity: ok`
- `reason codes: none`
- `latest posture: operational`
- `latest readiness percent: 100`
- `latest fresh: true`
- `latest blocked reasons: none`

`npm run ops:runtime-health:scheduled-proof:json` returned the same clear state as JSON:

- `ok: true`
- `event.type: discordos.runtime_health.scheduled_proof_pass`
- `event.severity: info`
- `check.httpStatus: 200`
- `check.readinessPercent: 100`
- `check.fresh: true`
- `alert.event.type: discordos.runtime_health.alert_clear`
- `alert.decisions: []`

## Marker Consequence

`DiscordOS Runtime & Product Hardening` now has a cron-ready scheduled proof command without admitting actual scheduling or alert delivery.
