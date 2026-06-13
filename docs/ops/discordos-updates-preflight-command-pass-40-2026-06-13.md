# DiscordOS Updates Preflight Command Pass 40 - 2026-06-13

## Scope

DiscordOS now has a no-send preflight command for future curated `#updates` posts.

This pass does not send Discord messages, does not publish to `#alerts`, does not use Fitness-owned publication code, does not expose bot tokens, does not commit env files, and does not open a named Discord product lane.

## Implementation

- Added `scripts/discord-update-preflight.js`.
- Added `tests/discord-update-preflight.test.js`.
- Added `npm run ops:discord:update-preflight`.
- Added `npm run ops:discord:update-preflight:json`.
- Added `npm run verify:discord-update-preflight`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.

## Contract

Commands:

- `npm run ops:discord:update-preflight -- --title "<title>" --body-file <path> --body-section "<section>"`
- `npm run ops:discord:update-preflight -- --title "<title>" --body-file <path> --body-section "<section>" --probe-live`
- `npm run ops:discord:update-preflight:json -- --title "<title>" --body-file <path> --body-section "<section>" --probe-live`

Default behavior:

- validates title and body against Discord embed payload limits
- validates the configured `DISCORDOS_UPDATES_CHANNEL_ID` and `DISCORDOS_BOT_TOKEN` target shape
- sends no Discord messages
- writes no artifacts
- performs no network call unless `--probe-live` is provided
- renders bounded payload metadata, not full body content

Live-probe behavior:

- performs only Discord read-only GET requests
- confirms the configured channel name is `updates`
- fails closed if the target points at `#alerts` or another channel
- checks recent `#updates` messages for an existing embed with the same title
- fails closed on duplicate titles before any publication command is used

Events:

- pass: `discordos.updates.preflight_ready`
- fail: `discordos.updates.preflight_blocked`

## Proof

Focused verifier:

- `npm run verify:discord-update-preflight` passed
- tests: `9`
- pass: `9`
- fail: `0`

Covered cases:

- parses local and live preflight args
- validates lookup limit bounds
- reports invalid payloads without throwing
- skips all network calls for local preflight
- runs read-only target admission and duplicate lookup with `--probe-live`
- passes when no duplicate title is found
- blocks when a duplicate title is found
- blocks target drift before duplicate lookup
- omits token values and full body content from rendered Markdown

Live duplicate-block proof:

- command: `node scripts/discord-update-preflight.js --json --title "DiscordOS Runtime Hardening Closed" --body-file docs/ops/discordos-runtime-product-hardening-closeout-update-post-2026-06-13.md --body-section "Update Post" --probe-live`
- result: `fail`
- status: `blocked`
- sends messages: `false`
- writes artifacts: `false`
- probe live: `true`
- payload status: `valid`
- payload title: `DiscordOS Runtime Hardening Closed`
- payload body chars: `2184`
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
- event type: `discordos.updates.preflight_blocked`

This failing live proof is the expected success condition for the guard: the already-published closeout post cannot be accidentally reposted with the same embed title.

## Marker Consequence

`DiscordOS Updates Publication Command` remains closed at `100%`.

Future public update posts now have a no-send preflight gate that combines payload validation, target admission, and duplicate-title protection before live publication.
