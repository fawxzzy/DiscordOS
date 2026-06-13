# DiscordOS Updates Receipt File Mode Pass 37 - 2026-06-13

## Scope

DiscordOS `#updates` publication now has an optional receipt-file write mode.

This pass did not send another public update, did not use the Fitness-owned publication command, did not route updates through `#alerts`, did not expose bot tokens, did not pull or commit env files, and did not open a named Discord product lane.

## Implementation

- Updated `scripts/discord-update-post.js`.
- Updated `tests/discord-update-post.test.js`.
- Updated `README.md`.

## Contract

Future live publication command:

- `npm run ops:discord:update-post -- --title "<title>" --body-file <path> --body-section "<section>" --receipt-file <receipt> --apply`

Receipt behavior:

- `--receipt-file` is optional
- dry-runs never write receipts
- blocked sends never write receipts
- successful sends write a bounded `Discord Publication` block into the existing receipt
- repeated writes replace the existing bounded block instead of appending duplicates
- if the Discord send succeeds but the receipt write fails, the command reports `sent_receipt_write_failed`, keeps `sendsMessages: true`, and returns `receipt_write_failed`

Receipt block markers:

- `<!-- discordos-update-post-receipt:start -->`
- `<!-- discordos-update-post-receipt:end -->`

Receipt fields:

- status
- sends messages
- Discord HTTP status
- channel id
- message id
- timestamp
- mentions disabled

## Proof

Focused verifier:

- `npm run verify:discord-update-post` passed
- tests: `14`
- pass: `14`
- fail: `0`

Covered cases:

- parses `--receipt-file`
- dry-run records receipt request without writing
- successful send writes the publication block
- existing publication block is replaced idempotently
- send-success/receipt-write-failure is reported without hiding the already-sent message
- rendered Markdown includes receipt path and write status
- secret values are still omitted from rendered output

## Marker Consequence

`DiscordOS Updates Publication Command` remains closed at `100%`.

Future public update receipts can now store the exact Discord message id during the same operator command that sends the post.

