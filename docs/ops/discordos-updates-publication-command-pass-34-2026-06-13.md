# DiscordOS Updates Publication Command Pass 34 - 2026-06-13

## Scope

DiscordOS now has a repo-local command for curated `#updates` posts.

This pass does not use the Fitness-owned publication command, does not publish through `#alerts`, does not send a live Discord message without DiscordOS-owned env, does not expose bot tokens, does not move secrets into committed files, and does not open a named Discord product lane.

Boundaries preserved:

- no Fitness product code changed
- no Fitness publication env names used by the DiscordOS command
- no secret values committed or printed
- no runtime-health critical alerts routed to `#updates`
- no routine logs, raw deploy output, or cron proof dumps treated as public update content

## Implementation

- Added `scripts/discord-update-post.js`.
- Added `tests/discord-update-post.test.js`.
- Added `npm run ops:discord:update-post`.
- Added `npm run ops:discord:update-post:json`.
- Added `npm run verify:discord-update-post`.
- Added the new verifier to `npm run verify`.
- Updated `README.md`.
- Updated `docs/README.md`.

## Publication Contract

Command:

- `npm run ops:discord:update-post -- --title "<title>" --body "<body>"`
- `npm run ops:discord:update-post -- --title "<title>" --body-file <path>`
- `npm run ops:discord:update-post -- --title "<title>" --body-file <path> --body-section "<section>"`
- add `--apply` only when the post should be sent live

Target:

- `DISCORDOS_UPDATES_CHANNEL_ID`
- `DISCORDOS_BOT_TOKEN`

Payload:

- green Discord embed
- empty message content
- `allowed_mentions: { parse: [] }`
- max embed title: `256`
- max embed description: `4096`

Dry-run behavior:

- default behavior is dry-run
- dry-run does not require target env
- dry-run emits a payload preview
- dry-run does not send Discord messages

Apply behavior:

- fails closed unless the DiscordOS updates channel id and bot token are both present
- posts only to the configured DiscordOS updates channel
- does not fall back to the Fitness updates env names

## Proof

Focused verifier:

- `npm run verify:discord-update-post` passed
- tests: `9`
- pass: `9`
- fail: `0`

Closeout post dry-run:

- command: `node scripts/discord-update-post.js --json --title "DiscordOS Runtime Hardening Closed" --body-file docs/ops/discordos-runtime-product-hardening-closeout-update-post-2026-06-13.md --body-section "Update Post"`
- result: `pass`
- status: `dry_run`
- sends messages: `false`
- target configured in current shell: `false`
- reason codes: `apply_flag_not_set`
- payload title: `DiscordOS Runtime Hardening Closed`
- payload color: `5763719`
- mentions disabled: `true`

Closeout post apply attempt:

- command: `node scripts/discord-update-post.js --json --title "DiscordOS Runtime Hardening Closed" --body-file docs/ops/discordos-runtime-product-hardening-closeout-update-post-2026-06-13.md --body-section "Update Post" --apply`
- result: `fail`
- status: `blocked`
- sends messages: `false`
- reason codes: `updates_target_missing`

Current live-send blocker:

- `DISCORDOS_UPDATES_CHANNEL_ID`: not present in current shell
- `DISCORDOS_BOT_TOKEN`: not present in current shell
- `DISCORD_UPDATES_CHANNEL_ID`: not present in current shell
- `DISCORD_BOT_TOKEN`: not present in current shell

Full verifier:

- `npm run verify` passed

## Marker Consequence

`DiscordOS Updates Publication Command` is at `85%`.

The command, formatter, tests, docs, and closeout-post dry-run are complete. Final movement to `100%` requires one live `#updates` send from the DiscordOS command after `DISCORDOS_UPDATES_CHANNEL_ID` and `DISCORDOS_BOT_TOKEN` are available in the operator process.
