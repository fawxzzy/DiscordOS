# DiscordOS Runtime Health Alert Repeat Suppression Pass 26 - 2026-06-13

## Scope

DiscordOS runtime-health alert delivery now suppresses repeated sends for the same critical condition by default.

This pass reduces flood risk for the dedicated `#alerts` channel without sending Discord messages, exposing secrets, enforcing retention, changing named product behavior, or opening a named Discord work lane.

Boundaries preserved:

- no secret values committed
- no Discord messages sent
- no public update published
- no runtime artifacts deleted, moved, archived, or rotated
- no retention policy enforced
- no moderation, publication, Music Sesh, or named product behavior changed
- no Fitness product code changed

## Implementation

`scripts/runtime-health-alert-delivery.js` now has a repeat-suppression policy for send-eligible alerts:

- default repeat suppression: `true`
- default cooldown: `24` hours
- default suppression state directory: ATLAS `runtime/discordos/runtime-health-alert-delivery`
- suppression fingerprint: alert severity, active/clear status, reason codes, posture, readiness percent, freshness state, and blocked reasons
- repeated `--send` attempts for the exact same critical fingerprint are skipped with `delivery status: suppressed_repeat`
- changed critical fingerprints bypass the cooldown and remain send-eligible
- expired cooldowns allow the same critical fingerprint to send again
- dry-runs remain non-sending and do not create suppression records
- operators can disable suppression for an explicit run with `--no-repeat-suppression`

## Verification

`npm run verify:runtime-health-alert-delivery` passed:

- 14 tests
- default no-send alert surface includes repeat suppression and 24-hour cooldown
- exact repeated critical sends are suppressed
- changed critical fingerprints are not suppressed
- critical repeats are allowed after cooldown expiry
- webhook and bot-channel payloads still disable mentions
- target values and secrets are not rendered

`npm run ops:runtime-health:alert-delivery` passed:

- `result: pass`
- `send requested: false`
- `alert delivered: false`
- `repeat suppression: true`
- `repeat cooldown hours: 24`
- `alert severity: ok`
- `delivery status: skipped_clear`

## Marker Consequence

`DiscordOS Runtime & Product Hardening` stays at `99%`.

The alert channel now has a critical-only delivery policy, a production target, and repeat-send suppression. Remaining closure candidates are first real scheduled cron proof after the daily Vercel schedule fires, and a future intentionally sent critical-alert proof only when warranted or explicitly requested.
