# DiscordOS Runtime Health Check Command Pass 8 - 2026-06-13

## Scope

DiscordOS now has a one-command runtime-health operator check.

The command fetches production `/api/runtime-health`, writes a timestamped runtime snapshot, then immediately runs the freshness-guarded summary against the snapshot directory.

This stays below named Discord feature lanes:

- no Discord publication behavior changed
- no moderation behavior changed
- no Music Sesh behavior changed
- no Fitness product code changed
- no secrets were committed

## Implementation

- Added `scripts/runtime-health-check.js`.
- Added `tests/runtime-health-check.test.js`.
- Added `npm run ops:runtime-health:check`.
- Added `npm run ops:runtime-health:check:json`.
- Added `npm run verify:runtime-health-check`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.

## Behavior

The combined check fails closed unless both stages pass:

- live proof from production `/api/runtime-health`
- latest snapshot summary with freshness guard

The command supports:

- `--endpoint <url>`
- `--snapshot-dir <path>`
- `--max-age-hours <hours>`
- `--json`

## Defect Found And Fixed

The first live check exposed a timing bug in the combined command:

- the proof stage passed
- the snapshot was written
- summary failed because freshness was evaluated against command-start time
- the server-generated snapshot timestamp could be a few milliseconds later than command-start time

The fix evaluates freshness after snapshot capture unless a test supplies an explicit `now`.

## Verification

`npm run verify:runtime-health-check` passed.

The focused verifier covers:

- default production alias and snapshot directory
- custom endpoint, JSON, snapshot directory, and max-age parsing
- green live-contract simulation that writes a fresh snapshot and summary
- action-required live-contract simulation that fails the combined check
- Markdown rendering

## Live Combined Check

`npm run ops:runtime-health:check` returned:

- `result: pass`
- `endpoint: https://fawxzzy-discordos.vercel.app/api/runtime-health`
- `proof result: pass`
- `summary result: pass`
- `latest fresh: true`
- `latest posture: operational`
- `latest readiness percent: 100`
- `latest event type: discordos.runtime_health.operational`
- `latest blocked reasons: none`

`npm run ops:runtime-health:check:json` returned:

- `ok: true`
- `httpStatus: 200`
- `readinessPercent: 100`
- `writerActivationAllowed: true`
- `liveCutover: true`
- `fitnessTrafficMoved: true`
- `summary.ok: true`
- latest `fresh: true`
- latest `staleReason: null`

## Marker Consequence

`DiscordOS Runtime & Product Hardening` now has a one-command production runtime-health check that captures proof and validates freshness in one fail-closed operator workflow.
