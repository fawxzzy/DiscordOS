# DiscordOS Updates Lookup Backfill Command Pass 38 - 2026-06-13

## Scope

DiscordOS now has a read-only command to find existing `#updates` posts by embed title and backfill their Discord publication metadata into an ops receipt.

This pass does not send another public update, does not use the Fitness-owned publication command, does not route updates through `#alerts`, does not expose bot tokens, does not commit env files, and does not open a named Discord product lane.

## Implementation

- Added `scripts/discord-update-lookup.js`.
- Added `tests/discord-update-lookup.test.js`.
- Added `npm run ops:discord:update-lookup`.
- Added `npm run ops:discord:update-lookup:json`.
- Added `npm run verify:discord-update-lookup`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.

## Contract

Lookup command:

- `npm run ops:discord:update-lookup -- --title "<title>"`
- `npm run ops:discord:update-lookup -- --title "<title>" --receipt-file <receipt>`

Behavior:

- uses `DISCORDOS_UPDATES_CHANNEL_ID` and `DISCORDOS_BOT_TOKEN`
- performs only Discord `GET /channels/{channel.id}/messages`
- searches recent messages by embed title
- returns message id, channel id, timestamp, and title when found
- sends no Discord messages
- optionally writes the bounded Discord publication block into an existing receipt
- reports receipt-write failures without hiding the fact that the message was found

Receipt backfill block:

- reuses the same bounded `Discord Publication` block used by `ops:discord:update-post --receipt-file`
- replaces existing bounded blocks idempotently

## Proof

Focused verifier:

- `npm run verify:discord-update-lookup` passed
- tests: `11`
- pass: `11`
- fail: `0`

Covered cases:

- parses title, limit, JSON, and receipt-file args
- validates lookup limits
- blocks without DiscordOS target env
- uses read-only Discord GET with bot auth
- matches by embed title
- returns safe message metadata
- reports not-found without receipt writes
- writes found publication metadata into a receipt
- reports receipt-write failures
- omits token values from rendered output

Live backfill:

- command: `node scripts/discord-update-lookup.js --json --title "DiscordOS Runtime Hardening Closed" --receipt-file docs/ops/discordos-updates-publication-live-post-pass-35-2026-06-13.md`
- result: `pass`
- status: `found`
- sends messages: `false`
- writes receipt: `true`
- Discord HTTP status: `200`
- searched messages: `25`
- message id: `1515396583846445097`
- channel id: `1504671871512346695`
- timestamp: `2026-06-13T16:45:00.296000+00:00`
- title: `DiscordOS Runtime Hardening Closed`
- receipt written: `true`

## Marker Consequence

`DiscordOS Updates Publication Command` remains closed at `100%`.

Existing update receipts can now be backfilled with exact Discord message ids without duplicate posts.
