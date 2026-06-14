# DiscordOS Forum Card Lifecycle Command Pass 93

Date: 2026-06-14

## Scope

Advance `DiscordOS Forum/Card Operations` by adding a governed no-send command surface for forum/card lifecycle publication events.

This pass does not create or mutate Discord forum posts, does not send Discord messages during proof, does not mutate production config, does not touch Fitness product code, and does not expose secrets.

## Implementation

- Added `scripts/discord-forum-card-lifecycle.js`.
  - Supports lifecycle states: `opened`, `in_progress`, `blocked`, `completed`, and `closed`.
  - Builds a card lifecycle metadata block with workflow, card id, state, and optional state note.
  - Reuses the update-post embed payload builder and receipt writer.
  - Reuses workflow marker progress output from `scripts/discordos-workflow-marker-progress.js`.
  - Routes through the reserved `forum-card-lifecycle-info` notification policy route.
  - Defaults to dry-run unless `--apply` is explicitly provided.

- Added package scripts:
  - `npm run ops:discord:forum-card-lifecycle`
  - `npm run ops:discord:forum-card-lifecycle:json`
  - `npm run verify:discord-forum-card-lifecycle`

- Added `tests/discord-forum-card-lifecycle.test.js`.

## Proof Commands

- `npm run verify:discord-forum-card-lifecycle`
  - result: `pass`
- `npm run ops:discord:forum-card-lifecycle:json -- --workflow DiscordOS --card-id update-post-v2-marker-progress --state opened --state-note "Dry-run lifecycle command proof" --body "Forum/card lifecycle command dry-run proof." --marker "DiscordOS Runtime & Product Hardening"`
  - result: `pass`
  - status: `dry_run`
  - sends messages: `false`
  - notification route: `forum-card-lifecycle-info`
  - notification route target: `updates`
  - marker source: `docs/atlas-book/02-lanes-and-markers.md`
  - marker: `DiscordOS Runtime & Product Hardening`
  - marker percent: `15%`

## Functional Result

- Forum/card lifecycle events now have a repo-local dry-run command before live Discord post mutation.
- The lifecycle payload includes structured card metadata and optional workflow marker progress.
- The command fails closed if marker names are not present in the current marker board.
- Apply mode remains guarded by notification policy, update target readiness, and duplicate/target preflight checks.

## Marker Consequence

- `DiscordOS Notification Layer v0`: remains `100%`
- `DiscordOS ATLAS Health Expansion`: remains `70%`
- `DiscordOS Update-Post Workflow v2`: remains `30%`
- `DiscordOS Forum/Card Operations`: `0%` -> `25%`

## Operational Boundary

- sends Discord messages during proof: `false`
- writes runtime artifacts during proof: `false`
- mutates production config: `false`
- touches Fitness product code: `false`
- reads or prints secret values: `false`

## Next Marker Move

Continue `DiscordOS Forum/Card Operations` by adding a release-check or preflight wrapper for lifecycle posts before any live apply path is used.
