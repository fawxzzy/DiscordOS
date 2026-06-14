# DiscordOS Workflow Marker Progress Update-Post Pass 92

Date: 2026-06-14

## Scope

Advance `DiscordOS Update-Post Workflow v2` by letting update posts carry explicit ATLAS workflow marker completion data as structured output instead of manually repeated body text.

This pass keeps the current no-send guardrails intact, does not create a live forum/card producer, does not mutate production config, does not touch Fitness product code, and does not expose secrets.

## Implementation

- Added `scripts/discordos-workflow-marker-progress.js`.
  - Resolves workflow marker snapshots from `docs/atlas-book/02-lanes-and-markers.md`.
  - Supports multiple explicit marker names.
  - Fails closed on missing markers, percent conflicts, or open-vs-closed conflicts.
  - Renders a reusable `## Workflow Markers` markdown block with percent and section metadata.

- Updated `scripts/discord-update-post.js`.
  - Added repeatable `--marker "<marker name>"` support.
  - Appends structured workflow marker progress to the embed body.
  - Carries marker metadata through dry-run, guarded apply, markdown rendering, and durable receipt blocks.

- Updated `scripts/discord-update-preflight.js`.
  - Added repeatable `--marker` support.
  - Validates the marker-enriched payload body before live duplicate checks.

- Updated `scripts/discord-update-draft-validator.js`.
  - Added repeatable `--marker` support.
  - Validates the same marker-enriched payload shape used by live publication.

- Updated `scripts/discord-update-release-check.js`.
  - Added repeatable `--marker` support.
  - Preserves marker flags in the final suggested apply command.

- Updated focused tests for update-post, preflight, draft validation, and release-check.

## Proof Commands

- `npm run verify:discord-update-post`
  - result: `pass`
- `npm run verify:discord-update-preflight`
  - result: `pass`
- `npm run verify:discord-update-draft-validator`
  - result: `pass`
- `npm run verify:discord-update-release-check`
  - result: `pass`

## Functional Result

- Update posts can now include explicit workflow progress lines:
  - marker source
  - marker count
  - open and closed marker counts
  - completion range
  - per-marker completion percent
  - per-marker board section

- The publication chain stays aligned:
  - draft validation
  - preflight
  - guarded apply
  - receipt writeback
  - release-check next-command output

## Marker Consequence

- `DiscordOS Notification Layer v0`: remains `100%`
- `DiscordOS ATLAS Health Expansion`: remains `70%`
- `DiscordOS Update-Post Workflow v2`: `0%` -> `30%`
- `DiscordOS Forum/Card Operations`: remains `0%`

## Operational Boundary

- sends Discord messages during proof: `false`
- writes runtime artifacts during proof: `false`
- mutates production config: `false`
- touches Fitness product code: `false`
- reads or prints secret values: `false`

## Next Marker Move

Continue `DiscordOS Update-Post Workflow v2` by proving marker-enriched draft or release-check behavior against a real closeout draft before any live post.
