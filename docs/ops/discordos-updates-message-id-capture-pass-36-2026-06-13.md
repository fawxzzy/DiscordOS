# DiscordOS Updates Message Id Capture Pass 36 - 2026-06-13

## Scope

DiscordOS `#updates` publication now captures Discord response metadata after successful sends.

This pass did not send another public update, did not use the Fitness-owned publication command, did not route updates through `#alerts`, did not expose bot tokens, did not pull or commit env files, and did not open a named Discord product lane.

## Implementation

- Updated `scripts/discord-update-post.js`.
- Updated `tests/discord-update-post.test.js`.
- Updated `README.md`.

## Contract

Successful `--apply` sends now return:

- `httpStatus`
- `messageId`
- `channelId`
- `timestamp`

The command still:

- dry-runs by default
- requires `--apply` before network delivery
- uses only `DISCORDOS_UPDATES_CHANNEL_ID` and `DISCORDOS_BOT_TOKEN`
- trims configured env values before sending
- disables mentions in Discord payloads
- returns no token or authorization-header values

## Proof

Focused verifier:

- `npm run verify:discord-update-post` passed
- tests: `10`
- pass: `10`
- fail: `0`

Covered cases:

- a successful Discord bot-channel response with JSON body returns `messageId`, `channelId`, and `timestamp`
- a successful response without parseable JSON preserves HTTP status without throwing
- rendered Markdown includes the message id and timestamp when present
- secret values are still omitted from rendered output

## Marker Consequence

`DiscordOS Updates Publication Command` remains closed at `100%`.

This pass improves receipt quality for future updates without creating a duplicate public announcement.

