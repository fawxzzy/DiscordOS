# DiscordOS ATLAS Health Watch - Pass 64

Date: 2026-06-13

Scope:

- Add a critical-only ATLAS health watch through DiscordOS runtime operations.
- Reuse the existing guarded `/api/cron/runtime-health` cron surface instead of adding another cron route.
- Route production alerts to the existing `#alerts` target only when critical failures exist.
- No Fitness product code changed.
- No committed secrets.

Marker:

- `DiscordOS runtime/product hardening`: ATLAS critical health watch implemented, verified, and production-env enabled.

## Result

`pass`

This pass added a low-noise ATLAS health watch that checks public critical surfaces for DiscordOS, Foundation, Fitness, Trove, and Mazer. Clear states do not post. Critical alert sends require `DISCORDOS_ATLAS_HEALTH_ALERT_SEND=enabled`, disable mentions, and suppress identical critical fingerprints for 24 hours.

## What Changed

- Added `config/atlas-health-targets.json` with the default public target set.
- Added `scripts/atlas-health-watch.js` and `npm run ops:atlas-health:watch`.
- Added `tests/atlas-health-watch.test.js` and `npm run verify:atlas-health-watch`.
- Integrated the watcher into `api/cron/runtime-health.js` behind `DISCORDOS_ATLAS_HEALTH_WATCH_ENABLED=enabled`.
- Updated `vercel.json` to run `/api/cron/runtime-health` at `0 4,16 * * *`, matching 12:00 AM and 12:00 PM Eastern while New York observes daylight time.
- Updated README operator docs and cron schedule tests.

## Live Dry-Run Proof

Command:

```powershell
npm run ops:atlas-health:watch:json
```

Current result:

- result: `pass`
- target count: `5`
- passing: `5`
- failing: `0`
- critical: `0`
- sends messages: `false`
- Discord posts: `0 unless a critical target fails`
- twice-daily usage estimate: `60` runs/month, `300` target checks/month

Checked targets:

- `discordos-runtime`
- `foundation-web`
- `fitness-web`
- `trove-web`
- `mazer-web`

## Production Env Proof

Command:

```powershell
npm run ops:vercel:run -- vercel env pull <temp-file> --environment=production --yes
```

Only the new non-secret flag values were inspected.

Current result:

- `DISCORDOS_ATLAS_HEALTH_WATCH_ENABLED`: exact `enabled`, length `7`
- `DISCORDOS_ATLAS_HEALTH_ALERT_SEND`: exact `enabled`, length `7`
- temp env file removed after verification

## Verification

Commands:

```powershell
npm run verify:atlas-health-watch
npm run verify:runtime-health-cron
npm run verify:runtime-health-cron-schedule-proof
npm run verify
```

Result: pass.

## Notes

- The watcher can use dedicated `DISCORDOS_ATLAS_HEALTH_ALERT_*` env values, but production currently falls back to the existing runtime-health alert target.
- Fitness' documented `/api/health` route currently redirects to login from the public production alias, so the default Fitness target is public web availability until the owner repo exposes a public machine-readable health endpoint again.
- The `0 4,16 * * *` cadence requires a Vercel plan that allows more than once-daily cron execution. If Vercel rejects the production deployment on plan limits, the fallback is to keep the same watcher and set the schedule back to once daily.
