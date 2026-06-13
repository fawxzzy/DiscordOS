# DiscordOS Publication Status Pass 44 - 2026-06-13

## Scope

DiscordOS now has one read-only publication status command for the public update and critical-alert publication surfaces.

This pass does not send Discord messages, does not write artifacts, does not publish to `#updates` or `#alerts`, does not use Fitness-owned publication code, does not expose bot tokens, does not commit env files, and does not open a named Discord product lane.

## Implementation

- Added `scripts/discord-publication-status.js`.
- Added `tests/discord-publication-status.test.js`.
- Added `npm run ops:discord:publication-status`.
- Added `npm run ops:discord:publication-status:json`.
- Added `npm run verify:discord-publication-status`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.

## Contract

Commands:

- `npm run ops:discord:publication-status`
- `npm run ops:discord:publication-status -- --probe-live`
- `npm run ops:discord:publication-status:json -- --probe-live`

Default local behavior:

- summarizes publication toolchain posture without network access
- reports draft validator availability
- reports release-check availability
- reports no-send preflight availability
- reports guarded apply enforcement
- reports lookup/backfill availability
- checks whether configured `#updates` and `#alerts` bot-channel IDs collide
- sends no Discord messages
- writes no artifacts

Live probe behavior:

- runs read-only `#updates` target admission
- runs read-only runtime-health alert target admission
- confirms the `#updates` target is not `#alerts`
- confirms updates and alert targets are separated
- fails closed if either live admission fails

Events:

- pass: `discordos.publication.status_ready`
- fail: `discordos.publication.status_blocked`

## Proof

Focused verifier:

- `npm run verify:discord-publication-status` passed
- tests: `8`
- pass: `8`
- fail: `0`

Covered cases:

- parses local and live-probe args
- classifies the publication command toolchain
- classifies updates and alerts channel separation
- passes local status without target env
- blocks local updates/alerts channel collisions
- live-probes updates and alerts targets with read-only GETs
- blocks live updates target drift to `#alerts`
- renders Markdown without target values or bot tokens

Live read-only status proof:

- command: `node scripts/discord-publication-status.js --json --probe-live`
- result: `pass`
- status: `ready`
- sends messages: `false`
- writes artifacts: `false`
- probe live: `true`
- toolchain status: `ready`
- draft validator: `available`
- release check: `available`
- no-send preflight: `available`
- apply guard: `enforced`
- lookup backfill: `available`
- updates target: `pass`
- updates live probe HTTP status: `200`
- updates channel name: `updates`
- alerts target: `pass`
- alerts live probe HTTP status: `200`
- channel separation: `separated`
- alert target mode: `discord_bot_channel`
- reason codes: `none`
- event type: `discordos.publication.status_ready`

Target ids used for the live proof:

- updates channel id: `1504671871512346695`
- alerts channel id: `1515220075366580224`

These ids are included here as durable non-secret channel references. Bot credentials were loaded only into the process environment for the proof and were not printed or committed.

## Marker Consequence

`DiscordOS Updates Publication Command` remains closed at `100%`.

DiscordOS now has a single read-only status view for the publication toolchain and `#updates` / `#alerts` channel separation.
