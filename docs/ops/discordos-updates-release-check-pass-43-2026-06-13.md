# DiscordOS Updates Release Check Pass 43 - 2026-06-13

## Scope

DiscordOS now has a single no-send release check for curated `#updates` posts before the guarded apply command.

This pass does not send Discord messages, does not write artifacts, does not publish to `#alerts`, does not use Fitness-owned publication code, does not expose bot tokens, does not commit env files, and does not open a named Discord product lane.

## Implementation

- Added `scripts/discord-update-release-check.js`.
- Added `tests/discord-update-release-check.test.js`.
- Added `npm run ops:discord:update-release-check`.
- Added `npm run ops:discord:update-release-check:json`.
- Added `npm run verify:discord-update-release-check`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.

## Contract

Command:

- `npm run ops:discord:update-release-check -- --title "<title>" --body-file <path> --body-section "<section>"`

Behavior:

- runs local draft validation first
- skips live preflight if draft validation fails
- runs live no-send preflight only after the draft is clean
- performs Discord read-only GET requests during live preflight
- sends no Discord messages
- writes no artifacts
- reports `ready_for_apply` only when both draft validation and live preflight pass
- returns the guarded apply command only when ready

Events:

- pass: `discordos.updates.release_check_ready`
- fail: `discordos.updates.release_check_blocked`

## Proof

Focused verifier:

- `npm run verify:discord-update-release-check` passed
- tests: `6`
- pass: `6`
- fail: `0`

Covered cases:

- parses title, body file, body section, limit, and JSON args
- passes when draft validation and live no-send preflight pass
- blocks duplicate live titles without sending
- skips live preflight when draft validation fails
- renders Markdown without full body or token values

Live no-send duplicate-block proof:

- command: `node scripts/discord-update-release-check.js --json --title "DiscordOS Runtime Hardening Closed" --body-file docs/ops/discordos-runtime-product-hardening-closeout-update-post-2026-06-13.md --body-section "Update Post"`
- result: `fail`
- status: `blocked`
- ready for apply: `false`
- sends messages: `false`
- writes artifacts: `false`
- draft status: `ready`
- draft payload status: `valid`
- draft payload body chars: `2184`
- draft durable receipt links: `5`
- draft public safety: `pass`
- preflight status: `blocked`
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
- event type: `discordos.updates.release_check_blocked`

This failing live proof is expected. It proves the combined release check catches an already-published update before the guarded apply command can be used.

## Marker Consequence

`DiscordOS Updates Publication Command` remains closed at `100%`.

Future public update posts now have a single no-send release check that combines draft validation and live preflight before final guarded apply.
