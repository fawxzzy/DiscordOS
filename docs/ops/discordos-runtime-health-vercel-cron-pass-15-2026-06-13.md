# DiscordOS Runtime Health Vercel Cron Pass 15 - 2026-06-13

## Scope

DiscordOS now has a guarded Vercel Cron endpoint and schedule configuration for runtime-health proof.

This pass adds the production scheduler surface in code and config, but it does not deploy, set secrets, send alerts, write runtime artifacts from the serverless function, delete artifacts, move artifacts, archive artifacts, rotate artifacts, or compact runtime state.

Boundaries preserved:

- no runtime artifacts deleted
- no runtime artifacts moved
- no retention policy enforced
- no Discord messages sent
- no alert delivery added
- no public update published
- no moderation or Music Sesh behavior changed
- no Fitness product code changed
- no secrets committed
- no Vercel environment variables changed

## Implementation

- Added `api/cron/runtime-health.js`.
- Added `tests/runtime-health-cron.test.js`.
- Added `vercel.json`.
- Added `npm run verify:runtime-health-cron`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.
- Updated `docs/README.md`.

## Cron Contract

Schedule:

- path: `/api/cron/runtime-health`
- schedule: `0 8 * * *`

Guard:

- requires `Authorization: Bearer $CRON_SECRET`
- returns `503` when `CRON_SECRET` is not configured
- returns `401` when the bearer value does not match

Proof behavior:

- computes runtime health from the same runtime-health classifier
- computes alert classification in memory
- emits `discordos.runtime_health.cron_pass` or `discordos.runtime_health.cron_fail`
- returns `destructive: false`
- returns `alertDelivered: false`
- returns `artifactWritten: false`

## Verification

`npm run verify:runtime-health-cron` passed.

The focused verifier covers:

- fail-closed missing `CRON_SECRET`
- mismatched bearer rejection
- matching bearer acceptance
- no-side-effect passing proof
- fail-closed blocked runtime proof
- non-GET method rejection

A direct local proof call against empty env returned:

- `ok: false`
- `event: discordos.runtime_health.cron_fail`
- `destructive: false`
- `alertDelivered: false`
- `artifactWritten: false`
- `posture: action_required`

## Deployment Boundary

The repo now contains the guarded Vercel Cron surface. Production cron execution requires a deployment with `CRON_SECRET` configured in Vercel.

## Marker Consequence

`DiscordOS Runtime & Product Hardening` now has the scheduler surface installed in repo configuration, below alert delivery and below named feature lanes.
