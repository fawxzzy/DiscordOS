# DiscordOS Runtime Health Alert Threshold Pass 9 - 2026-06-13

## Scope

DiscordOS runtime-health snapshot history now has a deterministic alert-threshold decision command.

This pass does not deliver alerts. It only packages the decision that a later delivery surface can consume.

Boundaries preserved:

- no Discord messages sent
- no Discord publication behavior added
- no moderation behavior added
- no Music Sesh behavior added
- no Fitness product code changed
- no secrets committed

## Implementation

- Added `scripts/runtime-health-alert.js`.
- Added `tests/runtime-health-alert.test.js`.
- Added `npm run ops:runtime-health:alert`.
- Added `npm run ops:runtime-health:alert:json`.
- Added `npm run verify:runtime-health-alert`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.
- Updated `docs/README.md`.

## Alert Contract

The command reads runtime-health snapshots and emits one of two event types:

- `discordos.runtime_health.alert_clear`
- `discordos.runtime_health.alert_triggered`

It evaluates:

- missing snapshots
- latest snapshot failure
- latest snapshot freshness
- latest readiness percent against threshold
- latest blocked reasons
- recent history failures

Default thresholds:

- `maxSnapshotAgeHours: 24`
- `minReadinessPercent: 100`
- `staleSeverity: warning`

Supported options:

- `--snapshot-dir <path>`
- `--limit <count>`
- `--max-age-hours <hours>`
- `--min-readiness-percent <0-100>`
- `--stale-severity warning|critical`
- `--json`

## Verification

`npm run verify:runtime-health-alert` passed.

The focused verifier covers:

- default snapshot directory and threshold parsing
- custom threshold parsing
- fresh passing latest snapshot clearing the alert
- stale latest snapshot triggering warning
- failed latest snapshot with blocked reasons escalating to critical
- missing snapshots escalating to critical
- Markdown rendering

## Live Alert Decision

`npm run ops:runtime-health:alert` returned:

- `result: pass`
- `severity: ok`
- `event type: discordos.runtime_health.alert_clear`
- `event status: clear`
- `reason codes: none`
- `total snapshots: 7`
- `latest file: 2026-06-13T02-41-47-847Z-pass.json`
- `latest fresh: true`
- `latest posture: operational`
- `latest readiness percent: 100`
- `latest blocked reasons: none`

`npm run ops:runtime-health:alert:json` returned the same clear state:

- `ok: true`
- `severity: ok`
- `event.type: discordos.runtime_health.alert_clear`
- `thresholds.maxSnapshotAgeHours: 24`
- `thresholds.minReadinessPercent: 100`
- `thresholds.staleSeverity: warning`
- `decisions: []`

## Marker Consequence

`DiscordOS Runtime & Product Hardening` now has generic alert-threshold packaging for runtime-health events without scheduling or delivery behavior.
