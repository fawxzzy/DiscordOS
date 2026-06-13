# DiscordOS Runtime Health Alert Channel Target Pass 24 - 2026-06-13

## Scope

Discord now has a dedicated `#alerts` channel for DiscordOS runtime critical alerts.

This pass created the channel by cloning the existing `#updates` channel shape, configured DiscordOS production with the alert channel ID, and proved target admission without sending an alert.

Boundaries preserved:

- no secret values committed
- no webhook URL, bot token, or `CRON_SECRET` printed
- no Discord alert messages sent
- no public update published
- no runtime artifacts written, deleted, moved, archived, or rotated
- no retention policy enforced
- no moderation, publication, Music Sesh, or named product behavior changed
- no Fitness product code changed

## External Changes

Discord:

- source channel: `updates`
- source channel id: `1504671871512346695`
- created or reused channel: `alerts`
- alert channel id: `1515220075366580224`
- alert channel parent/category copied from `updates`
- alert channel permissions copied from `updates`
- alert channel type copied from `updates` as an announcement channel
- alert channel topic: `Critical DiscordOS runtime alerts only. No routine updates.`

Vercel:

- project: `fawxzzy-discordos`
- environment: `Production`
- configured `DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID`
- existing `DISCORDOS_BOT_TOKEN` remains the bot credential used by the bot-channel alert target

Webhook note:

- Discord rejected webhook creation on the cloned announcement channel with `400 Bad Request`.
- The configured target therefore uses the bot-channel path instead of `DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL`.

## Proof

Temporary secret handling:

- pulled Fitness production env only to read the existing server bot token for this Discord server operation
- removed all temporary env files after use
- confirmed temp files were absent after the operation

Target proof:

- `npm run ops:runtime-health:alert-target-admission -- --probe-live` passed with `DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID=1515220075366580224` and a bot token in process env
- `npm run ops:runtime-health:alert-delivery` passed with no send
- `alert delivered: false`

Vercel proof:

- `vercel env ls production` reports `DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID` as encrypted Production env
- `DISCORDOS_BOT_TOKEN` remains encrypted Production env
- `CRON_SECRET` remains encrypted Production env

## Marker Consequence

`DiscordOS Runtime & Product Hardening` stays at `99%`.

The alert target blocker is cleared at the configuration/admission layer, but final closure still depends on first real scheduled cron proof after the daily Vercel schedule fires and any future intentionally sent critical-alert proof.
