# DiscordOS Runtime Health Critical Alert Delivery Policy Pass 23 - 2026-06-13

## Scope

DiscordOS runtime-health alert delivery is now critical-only by default.

This pass did not create a Discord channel, configure a webhook, send Discord messages, expose target values, publish public updates, enforce retention, wait for the daily scheduled cron run, or open a named product lane.

Boundaries preserved:

- no secret values committed
- no webhook URL, channel ID, bot token, or `CRON_SECRET` printed
- no Discord messages sent
- no runtime artifacts written, deleted, moved, archived, or rotated
- no retention policy enforced
- no public update published
- no moderation, publication, Music Sesh, or named product behavior changed
- no Fitness product code changed

## Implementation

- Updated `scripts/runtime-health-alert-delivery.js`.
- Updated `tests/runtime-health-alert-delivery.test.js`.
- Updated `README.md`.

## Delivery Policy

Default behavior:

- `ok` / clear alerts are skipped
- `warning` alerts are skipped
- only `critical` alerts are send-eligible
- even critical alerts require `--send` before network delivery
- Discord payloads disable mentions with `allowed_mentions: { parse: [] }`
- webhook and bot-channel delivery use the same critical embed payload

Operator recommendation:

- create a dedicated internal alert channel near updates, such as `#discordos-alerts` or `#runtime-alerts`
- do not mix runtime alerts into the normal updates channel
- configure a Discord webhook for that channel as `DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL`
- keep clear and warning states as local operator output unless an explicit override is needed

## Proof Contract

Command:

- `npm run ops:runtime-health:alert-delivery`
- `npm run ops:runtime-health:alert-delivery:json`

Checks:

- warnings return `skipped_non_critical` by default
- lowering `--min-delivery-severity warning` permits warning dry-runs only when explicitly requested
- critical dry-runs include a red Discord embed preview
- webhook sends use the embed payload and disabled mentions
- bot-channel sends use the embed payload and disabled mentions

## Verification

`npm run verify:runtime-health-alert-delivery` passed.

## Marker Consequence

`DiscordOS Runtime & Product Hardening` stays at `99%`.

This pass reduces alert-channel noise risk and signal mixing risk, but a real channel/webhook still needs to be created and configured before alert delivery can become live.
