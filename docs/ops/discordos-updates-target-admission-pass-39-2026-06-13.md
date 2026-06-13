# DiscordOS Updates Target Admission Pass 39 - 2026-06-13

## Scope

DiscordOS now has a read-only command to admit the configured `#updates` publication target before future public posts.

This pass does not send Discord messages, does not use the Fitness-owned publication command, does not route updates through `#alerts`, does not expose bot tokens, does not commit env files, and does not open a named Discord product lane.

## Implementation

- Added `scripts/discord-update-target-admission.js`.
- Added `tests/discord-update-target-admission.test.js`.
- Added `npm run ops:discord:update-target-admission`.
- Added `npm run ops:discord:update-target-admission:json`.
- Added `npm run verify:discord-update-target-admission`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.

## Contract

Commands:

- `npm run ops:discord:update-target-admission`
- `npm run ops:discord:update-target-admission -- --probe-live`
- `npm run ops:discord:update-target-admission:json`

Default behavior:

- validates `DISCORDOS_UPDATES_CHANNEL_ID` and `DISCORDOS_BOT_TOKEN` shape locally
- sends no Discord messages
- performs no network call unless `--probe-live` is provided
- does not print channel id or token values

Live-probe behavior:

- performs only Discord `GET /channels/{channel.id}`
- confirms the configured channel name is `updates`
- fails closed if the channel name is `alerts`
- fails closed if the channel name does not match the expected updates channel
- reports safe channel metadata only: name, type, HTTP status

Events:

- pass: `discordos.updates.target_admission_ready`
- fail: `discordos.updates.target_admission_blocked`

## Proof

Focused verifier:

- `npm run verify:discord-update-target-admission` passed
- tests: `9`
- pass: `9`
- fail: `0`

Covered cases:

- parses local and live-probe args
- validates bot-channel shape
- classifies configured target without returning values
- classifies channel probe body
- skips live probe by default
- uses read-only Discord GET when live probing
- rejects `#alerts` as an updates target
- reports Discord probe failures
- omits token and channel id values from rendered Markdown

Live probe:

- command: `node scripts/discord-update-target-admission.js --json --probe-live`
- result: `pass`
- sends messages: `false`
- writes artifacts: `false`
- probe live: `true`
- target type: `discord_bot_channel`
- target configured: `true`
- target shape valid: `true`
- live probe status: `reachable`
- live probe HTTP status: `200`
- channel name: `updates`
- channel type: `5`
- event type: `discordos.updates.target_admission_ready`
- reason codes: `none`

## Marker Consequence

`DiscordOS Updates Publication Command` remains closed at `100%`.

Future public update posts now have a no-send target admission gate before publication.
