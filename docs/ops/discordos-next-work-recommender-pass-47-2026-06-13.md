# DiscordOS Next Work Recommender Pass 47 - 2026-06-13

## Scope

DiscordOS now has a read-only next-work recommender that ranks broad runtime/product hardening moves from the current operator status bundle.

This pass does not send Discord messages, does not write runtime artifacts, does not use Fitness tooling, does not move secrets into committed files, and does not open a named Discord product lane.

## Implementation

- Added `scripts/discordos-next-work-recommender.js`.
- Added `tests/discordos-next-work-recommender.test.js`.
- Added `npm run ops:discordos:next-work`.
- Added `npm run ops:discordos:next-work:json`.
- Added `npm run verify:discordos-next-work`.
- Added the verifier to `npm run verify`.
- Updated repo docs for the new operator surface.

## Contract

The recommender consumes `ops:discordos:operator-status` signals and emits:

- ranked recommendation ids
- scores
- action status values
- categories
- reason codes
- command hints
- bounded evidence fields

It is deterministic, read-only, and excludes named Discord product lanes.

## Proof

Focused verifier:

- command: `npm run verify:discordos-next-work`
- result: `pass`
- tests: `5`
- pass: `5`
- fail: `0`

Local recommender run:

- command: `node scripts/discordos-next-work-recommender.js --json`
- result: `pass`
- destructive: `false`
- sends messages: `false`
- writes artifacts: `false`
- event type: `discordos.next_work.recommendations_ready`
- operator status: `pass`
- recommendation count: `5`
- top recommendation: `run-live-operator-status-probe`

Ranked recommendations:

1. `run-live-operator-status-probe`
2. `refresh-scheduled-cron-proof`
3. `verify-alert-target-env-in-operator-shell`
4. `verify-updates-target-env-in-operator-shell`
5. `defer-final-update-post-until-end`

## Chain Rule

Use this command to string multiple future passes:

1. run `npm run ops:discordos:next-work`
2. implement the highest-value non-deferred recommendation
3. run focused verification and `npm run verify`
4. commit and push
5. rerun `npm run ops:discordos:next-work`
6. repeat until only deferred or low-value repeats remain

## Marker Consequence

`DiscordOS Next Work Recommender` is closed at `100%`.

DiscordOS can now drive chained runtime/product hardening passes from a repo-local scored recommendation surface instead of manual scan-only selection.
