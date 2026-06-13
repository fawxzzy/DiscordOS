# DiscordOS Updates Apply Preflight Enforcement Pass 41 - 2026-06-13

## Scope

DiscordOS live `#updates` publication now enforces target admission and duplicate-title protection inside the `--apply` path.

This pass does not send a Discord message, does not publish to `#alerts`, does not use Fitness-owned publication code, does not expose bot tokens, does not commit env files, and does not open a named Discord product lane.

## Implementation

- Updated `scripts/discord-update-post.js`.
- Updated `tests/discord-update-post.test.js`.
- Updated `README.md`.

## Contract

`npm run ops:discord:update-post -- --title "<title>" --body-file <path> --body-section "<section>" --apply` now performs these steps before sending:

1. validate the embed payload
2. live-probe the configured updates channel with Discord `GET /channels/{channel.id}`
3. fail closed unless the channel name is `updates`
4. read recent updates messages with Discord `GET /channels/{channel.id}/messages`
5. fail closed if any recent embed title matches the pending title
6. only then send the Discord `POST /channels/{channel.id}/messages`

Dry-run behavior remains unchanged:

- no network call
- no Discord message
- no receipt write

Blocked apply behavior:

- no Discord message
- no receipt write
- returns `status: preflight_blocked`
- returns reason codes such as `updates_channel_points_to_alerts`, `updates_duplicate_lookup_failed`, or `updates_duplicate_title_found`

## Proof

Focused verifiers:

- `npm run verify:discord-update-post` passed
- tests: `16`
- pass: `16`
- fail: `0`

- `npm run verify:discord-update-preflight` passed
- tests: `9`
- pass: `9`
- fail: `0`

Covered post-command cases:

- dry-run still does not require target env
- apply still blocks without DiscordOS target env
- successful apply runs channel probe, duplicate lookup, then POST
- duplicate title blocks before POST
- target drift to `#alerts` blocks before duplicate lookup and POST
- receipt writes still occur only after successful send
- sent-but-receipt-failed state still reports the send truthfully

Live apply duplicate-block proof:

- command: `node scripts/discord-update-post.js --json --title "DiscordOS Runtime Hardening Closed" --body-file docs/ops/discordos-runtime-product-hardening-closeout-update-post-2026-06-13.md --body-section "Update Post" --apply`
- result: `fail`
- status: `preflight_blocked`
- sends messages: `false`
- receipt requested: `false`
- receipt written: `false`
- target configured: `true`
- target admission: `pass`
- target live probe HTTP status: `200`
- channel name: `updates`
- duplicate check status: `duplicate_found`
- duplicate lookup HTTP status: `200`
- searched messages: `25`
- duplicate message id: `1515396583846445097`
- duplicate channel id: `1504671871512346695`
- duplicate timestamp: `2026-06-13T16:45:00.296000+00:00`
- reason codes: `updates_duplicate_title_found`

This failing live proof is expected. It proves the live publication command cannot accidentally repost the already-published closeout update.

## Marker Consequence

`DiscordOS Updates Publication Command` remains closed at `100%`.

Future live public update posts now enforce the same no-send safety gate inside the final apply path instead of depending only on a separate operator preflight step.
