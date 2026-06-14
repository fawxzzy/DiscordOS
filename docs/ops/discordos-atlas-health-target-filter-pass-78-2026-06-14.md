# DiscordOS ATLAS Health Target Filter - Pass 78

Date: 2026-06-14

Scope:

- Add a runtime usage lever for ATLAS health target coverage.
- Preserve the canonical five-target config while allowing production/operator env to reduce the active sweep.
- Report active filters, original target count, filtered target count, and filtered monthly check estimate.
- Reject unknown target ids instead of silently dropping health coverage.
- Do not change production env values.
- Do not send Discord messages.
- Do not touch Fitness product code.
- Do not commit secrets.

Marker:

- `DiscordOS runtime/product hardening`: ATLAS health target coverage can now be narrowed by env without code or config edits.

## Result

`pass`

`scripts/atlas-health-watch.js` now supports:

```powershell
$env:DISCORDOS_ATLAS_HEALTH_TARGET_ALLOWLIST="discordos-runtime,fitness-web"; npm run ops:atlas-health:watch
$env:DISCORDOS_ATLAS_HEALTH_TARGET_EXCLUDE="trove-web,mazer-web"; npm run ops:atlas-health:watch
```

The filter is applied after the canonical config is loaded. Unknown allowlist/exclude ids fail closed with a specific error. If a filter removes every target, the watch fails with `atlas_health_targets_empty_after_filter`.

`scripts/atlas-health-status.js` now reports the active filter state and filtered usage estimate without sending messages or exposing alert target values.

## Usage Impact

The default committed config remains five targets on weekday cadence:

- schedule: `0 16 * * 1-5`
- estimated runs per month: `21`
- default target checks per month: `105`

Example reduced coverage:

- allowlist: `discordos-runtime,fitness-web`
- active targets: `2`
- estimated target checks per month: `42`

This gives operators a no-code way to reduce cross-project Vercel traffic while keeping DiscordOS runtime monitoring and any selected critical project surfaces.

## Operator Dry Run

Command:

```powershell
$env:DISCORDOS_ATLAS_HEALTH_TARGET_ALLOWLIST = "discordos-runtime,fitness-web"
npm run ops:atlas-health:watch:json
```

Current result:

- result: `pass`
- destructive: `false`
- sends messages: `false`
- writes artifacts: `false`
- cadence status: `atlas_health_schedule_not_due`
- original target count: `5`
- active target count: `2`
- allowlist: `discordos-runtime,fitness-web`
- estimated target checks per month: `42`
- alert delivery status: `skipped_schedule`

## Verification

Commands:

```powershell
npm run verify:atlas-health-watch
npm run verify:atlas-health-status
npm run verify
```

Result: pass.
