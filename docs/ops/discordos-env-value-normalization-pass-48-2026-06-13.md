# DiscordOS Env Value Normalization Pass 48 - 2026-06-13

## Scope

DiscordOS now normalizes Discord target env values before channel-id validation, target admission, lookup, posting, and alert delivery paths.

This pass does not send Discord messages, does not write runtime artifacts, does not commit secrets, does not use Fitness tooling, and does not open a named Discord product lane.

## Trigger

The next-work recommender selected `run-live-operator-status-probe`.

The current local shell had no Discord target env, so the live probe was rerun with a temporary Vercel production env pull under `tmp/`.

Sanitized finding:

- `DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID`: present and snowflake-shaped
- `DISCORDOS_UPDATES_CHANNEL_ID`: present but contained BOM plus escaped line-break residue in the pulled env file
- `DISCORDOS_BOT_TOKEN`: pulled as an empty value, so live Discord GET probing remains blocked from this shell

No secret values were printed or committed.

## Implementation

- Added env value normalization to `scripts/discord-update-target-admission.js`.
- Added env value normalization to `scripts/runtime-health-alert-target-admission.js`.
- Reused normalized update target values in `scripts/discord-update-post.js`.
- Reused normalized update target values in `scripts/discord-update-lookup.js`.
- Reused normalized alert target values in `scripts/runtime-health-alert-delivery.js`.
- Reused normalized channel comparison in `scripts/discord-publication-status.js`.
- Added regression coverage for BOM plus escaped line-break channel ids.

Normalization removes:

- UTF-8 BOM residue
- literal escaped `\r` and `\n` sequences from pulled env files
- surrounding whitespace

## Proof

Focused verifiers:

- `npm run verify:discord-update-target-admission` passed
- `npm run verify:runtime-health-alert-target-admission` passed
- `npm run verify:discord-publication-status` passed
- `npm run verify:discord-update-post` passed
- `npm run verify:discord-update-lookup` passed
- `npm run verify:runtime-health-alert-delivery` passed

Sanitized pulled-env admission proof after the fix:

- command: `node scripts/discord-update-target-admission.js --json`
- temp env source: Vercel production env pull
- temp env file: deleted after use
- result: `fail`
- reason codes: `bot_token_missing`
- no `updates_channel_id_shape_invalid` reason remained

Interpretation:

- channel-id normalization is fixed
- live Discord GET probing still requires a non-empty bot token in the operator process
- the pulled Vercel value for `DISCORDOS_BOT_TOKEN` was empty in this shell

## Marker Consequence

`DiscordOS Env Value Normalization` is closed at `100%`.

The next recommender pass should treat the remaining live-probe blocker as credential availability, not channel-id formatting.
