# DiscordOS Updates Public Format Curation Pass 116

Date: 2026-06-14

## Scope

Update the DiscordOS `#updates` draft validator so future public update posts are curated for human readers instead of carrying operator-heavy receipt sections.

This pass changes formatting rules only. It does not send Discord messages, change the updates target, mutate production config, or touch Fitness product code.

## Implementation

- Updated `scripts/discord-update-draft-validator.js`.
  - Public update body now requires only:
    - `What changed:`
    - `Proof:`
  - `Current production state:`, `Verification:`, and `Durable Receipts` are no longer required in public update text.
  - Durable `docs/ops/*.md` receipt links are still extracted when present, but are optional.
  - Markdown headings inside the public body are blocked so the Discord embed title remains the only title.
- Updated `tests/discord-update-draft-validator.test.js`.
- Updated `tests/discord-update-release-check.test.js`.
- Updated `README.md` and the historical draft-validator contract note.

## Proof Commands

- `npm run verify:discord-update-draft-validator`
  - result: `pass`
- `npm run verify:discord-update-release-check`
  - result: `pass`

## Marker Consequence

- `DiscordOS Updates Public Format Curation`: `0%` -> `100%`

## Boundary

- sends Discord messages during proof: `false`
- writes runtime artifacts during proof: `false`
- mutates production config: `false`
- touches Fitness product code: `false`
- reads or prints secret values: `false`
