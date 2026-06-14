# DiscordOS Update Post Marker File Source Pass 98

Date: 2026-06-14

## Scope

Advance `DiscordOS Update-Post Workflow v2` by proving marker-aware update drafts can use an explicit repo-local marker source instead of depending only on the canonical ATLAS marker board.

This pass also carries the same source override into governed forum/card publication surfaces because those commands share marker rendering and release-check workflows.

This pass does not send Discord messages, does not mutate production config, does not touch Fitness product code, and does not expose secrets.

## Implementation

- Added `--marker-file <path>` support to marker-aware update commands:
  - `scripts/discord-update-post.js`
  - `scripts/discord-update-preflight.js`
  - `scripts/discord-update-draft-validator.js`
  - `scripts/discord-update-release-check.js`
- Added `--marker-file <path>` support to marker-aware forum/card commands:
  - `scripts/discord-forum-card-lifecycle.js`
  - `scripts/discord-forum-card-preflight.js`
  - `scripts/discord-forum-card-release-check.js`
- Added `scripts/discord-forum-card-preflight.js`.
  - Performs no-send payload validation, notification route admission, update-target admission, and optional live duplicate-title checks for governed forum/card lifecycle posts.
  - Lets forum/card release checks reuse the same preflight contract instead of partially duplicating update preflight logic.
- Updated `scripts/discord-forum-card-release-check.js`.
  - Uses the forum/card preflight command internals for no-send live readiness checks.
  - Preserves `--marker-file` in the generated guarded apply command.
- Added package scripts and tests for forum/card preflight.
- Added `docs/ops/discordos-runtime-product-hardening-marker-snapshot-2026-06-14.md` as a repo-local marker snapshot for no-send proof.
- Updated `README.md` operator and verification docs for the new preflight command and marker source override.

## Proof Commands

- `npm run verify:discord-forum-card-preflight`
  - result: `pass`
- `npm run verify:discord-forum-card-lifecycle`
  - result: `pass`
- `npm run verify:discord-forum-card-release-check`
  - result: `pass`
- `npm run verify:discord-update-post`
  - result: `pass`
- `npm run verify:discord-update-preflight`
  - result: `pass`
- `npm run verify:discord-update-draft-validator`
  - result: `pass`
- `npm run verify:discord-update-release-check`
  - result: `pass`
- `npm run verify:discord-publication-status`
  - result: `pass`

## Marker-Aware Draft Proof

Command:

`npm run ops:discord:update-draft-validator:json -- --title DiscordOS-Runtime-Product-Hardening-Marker-Proof --body-file docs/ops/discordos-runtime-product-hardening-final-update-post-2026-06-14.md --body-section UpdatePost --marker "DiscordOS Update-Post Workflow v2" --marker "DiscordOS Forum/Card Operations" --marker-file docs/ops/discordos-runtime-product-hardening-marker-snapshot-2026-06-14.md`

Result:

- exit code: `0`
- result: `pass`
- status: `ready`
- destructive: `false`
- sends messages: `false`
- writes artifacts: `false`
- marker source: `docs/ops/discordos-runtime-product-hardening-marker-snapshot-2026-06-14.md`
- marker count: `2`
- open marker count: `2`
- completion range: `30-52%`
- markers:
  - `DiscordOS Update-Post Workflow v2`: `30%`
  - `DiscordOS Forum/Card Operations`: `52%`

## Forum/Card Preflight Proof

Command:

`DISCORDOS_UPDATES_CHANNEL_ID=1504671871512346695 DISCORDOS_BOT_TOKEN=dummy-token-for-no-send-local-proof npm run ops:discord:forum-card-preflight:json -- --workflow "DiscordOS Runtime Product Hardening" --card-id update-post-marker-file-source --state completed --body "Marker-file proof path now covers forum card preflight without sending." --marker "DiscordOS Forum/Card Operations" --marker-file docs/ops/discordos-runtime-product-hardening-marker-snapshot-2026-06-14.md`

Result:

- exit code: `0`
- result: `pass`
- status: `ready`
- destructive: `false`
- sends messages: `false`
- writes artifacts: `false`
- probe live: `false`
- notification route: `forum-card-lifecycle-info`
- notification route target: `updates`
- target admission: `pass`
- duplicate check: `skipped`
- marker source: `docs/ops/discordos-runtime-product-hardening-marker-snapshot-2026-06-14.md`
- marker count: `1`
- marker: `DiscordOS Forum/Card Operations` at `52%`

## Production Wrapper Note

The production-env wrapper still splits marker names that contain spaces when forwarding nested command arguments, so this pass did not use production-env release-check as the proof source for marker-file behavior.

The direct draft validator, forum/card preflight proof, and focused unit tests cover the source override without printing or depending on production secrets.

## Marker Consequence

- `DiscordOS Notification Layer v0`: remains `100%`
- `DiscordOS ATLAS Health Expansion`: remains `76%`
- `DiscordOS Update-Post Workflow v2`: `30%` -> `55%`
- `DiscordOS Forum/Card Operations`: `52%` -> `60%`

These are repo-local pass consequences. The canonical ATLAS marker board was not edited in this lane.

## Operational Boundary

- sends Discord messages during proof: `false`
- writes runtime artifacts during proof: `false`
- mutates production config: `false`
- touches Fitness product code: `false`
- reads or prints secret values: `false`

## Next Marker Move

Continue `DiscordOS Update-Post Workflow v2` by hardening production-env nested argument forwarding, or move to final update-post wrap-up once the remaining runtime/product queue is exhausted.
