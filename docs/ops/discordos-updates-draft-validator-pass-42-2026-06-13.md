# DiscordOS Updates Draft Validator Pass 42 - 2026-06-13

## Scope

DiscordOS now has a no-send validator for drafted `#updates` receipt files before preflight or live apply.

This pass does not send Discord messages, does not use Discord network calls, does not publish to `#alerts`, does not use Fitness-owned publication code, does not expose bot tokens, does not commit env files, and does not open a named Discord product lane.

## Implementation

- Added `scripts/discord-update-draft-validator.js`.
- Added `tests/discord-update-draft-validator.test.js`.
- Added `npm run ops:discord:update-draft-validator`.
- Added `npm run ops:discord:update-draft-validator:json`.
- Added `npm run verify:discord-update-draft-validator`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.

## Contract

Command:

- `npm run ops:discord:update-draft-validator -- --title "<title>" --body-file <path> --body-section "<section>"`

Default checks:

- validates the title/body against Discord embed limits
- requires the public update section to include only the user-facing anchors:
  - `What changed:`
  - `Proof:`
- blocks Markdown headings inside the public body so the Discord embed title remains the only title
- allows durable receipt links in the source receipt file but does not require them in public update text
- blocks obvious secret-like value leakage patterns such as Discord webhook URLs, `Authorization: Bot ...`, `Authorization: Bearer ...`, and direct secret assignments
- renders bounded metadata only, not the full update body

Events:

- pass: `discordos.updates.draft_ready`
- fail: `discordos.updates.draft_blocked`

## Proof

Focused verifier:

- `npm run verify:discord-update-draft-validator` passed
- tests: `10`
- pass: `10`
- fail: `0`

Covered cases:

- parses title, body file, body section, and JSON args
- extracts durable receipt links
- passes a complete update receipt
- passes the current closeout update post
- blocks missing public proof anchors
- blocks missing durable receipt linkage
- blocks secret-like value leakage
- reports Discord payload limit failures
- renders Markdown without full body or secret values

Live local receipt proof:

- command: `node scripts/discord-update-draft-validator.js --json --title "DiscordOS Runtime Hardening Closed" --body-file docs/ops/discordos-runtime-product-hardening-closeout-update-post-2026-06-13.md --body-section "Update Post"`
- result: `pass`
- status: `ready`
- sends messages: `false`
- writes artifacts: `false`
- payload status: `valid`
- payload title: `DiscordOS Runtime Hardening Closed`
- payload body chars: `2184`
- max title chars: `256`
- max body chars: `4096`
- required body anchors: `pass`
- durable receipt links: `5`
- public safety: `pass`
- event type: `discordos.updates.draft_ready`
- reason codes: `none`

Durable receipt links proven:

- `docs/ops/discordos-runtime-health-1145-cron-proof-window-pass-33-2026-06-13.md`
- `docs/ops/discordos-runtime-health-cron-audit-receipts-pass-31-2026-06-13.md`
- `docs/ops/discordos-runtime-health-cron-schedule-proof-pass-30-2026-06-13.md`
- `docs/ops/discordos-runtime-health-cron-alert-delivery-proof-pass-28-2026-06-13.md`
- `docs/ops/discordos-runtime-health-alert-target-production-deploy-pass-25-2026-06-13.md`

## Marker Consequence

`DiscordOS Updates Publication Command` remains closed at `100%`.

Future public update posts now have a local draft validator before no-send preflight and final guarded apply.
