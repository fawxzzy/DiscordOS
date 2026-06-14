# DiscordOS Forum Card Lifecycle Producer Pass 90

Date: 2026-06-14

## Scope

Turn the previously reserved `discordos.forum_card.lifecycle` notification route into a real DiscordOS-owned producer surface that can publish marker-aware workflow card lifecycle updates.

This pass does not send Discord messages during proof, does not mutate production config, does not touch Fitness product code, and does not expose secrets.

## Implementation

- Added `scripts/discord-forum-card-lifecycle.js`.
  - Introduced a governed forum/card lifecycle publication command with explicit:
    - workflow
    - card id
    - lifecycle state
    - optional state note
  - Reused the existing guarded Discord publication path:
    - shared updates target admission
    - shared duplicate-title preflight
    - shared guarded bot-channel send
    - shared durable publication receipt writeback
  - Preserved the workflow marker completion contract from pass 89 through repeatable `--marker` flags.

- Updated `scripts/discordos-notification-policy-status.js`.
  - Promoted `forum-card-lifecycle` from `reserved` to `attached`.
  - Attached producer command:
    - `npm run ops:discord:forum-card-lifecycle`

- Updated `scripts/discord-publication-status.js`.
  - Added forum/card lifecycle publication to the reported publication toolchain.

- Updated `README.md`.
  - Documented the new forum/card lifecycle command and verification surface.
  - Updated publication and notification-policy descriptions to reflect the attached producer.

- Added and updated focused tests:
  - `tests/discord-forum-card-lifecycle.test.js`
  - `tests/discord-publication-status.test.js`
  - `tests/discordos-notification-policy-status.test.js`
  - `tests/discordos-operator-status.test.js`
  - `tests/discordos-next-work-recommender.test.js`

## Proof Commands

- `npm run verify:discord-forum-card-lifecycle`
  - result: `pass`
- `npm run verify:discord-publication-status`
  - result: `pass`
- `npm run verify:discordos-notification-policy-status`
  - result: `pass`
- `npm run verify:discordos-operator-status`
  - result: `pass`
- `npm run verify:discordos-next-work`
  - result: `pass`

## No-Send Functional Proof

- `npm run ops:discord:forum-card-lifecycle:json -- --workflow "Feedback Ops" --card-id "8ed05d76" --state "opened" --body "Work has started." --marker "Feedback Loop Readiness"`
  - result: `pass`
  - status: `dry_run`
  - notification route: `forum-card-lifecycle-info`
  - target: `updates`
  - sends messages: `false`
  - workflow marker count: `1`

- `npm run ops:discordos:notification-policy-status:json`
  - result: `pass`
  - status: `ready`
  - routes: `4`
  - attached producers: `5/5`
  - reserved producers: `0`

## Functional Result

- DiscordOS now has a real card-lifecycle publication command instead of only a reserved notification route.
- Workflow marker completion data now flows through both:
  - update posts
  - forum/card lifecycle posts
- Publication status and operator-facing policy status now expose card publication as part of the normal toolchain rather than hidden future work.

## Marker Consequence

- `DiscordOS Notification Layer v0`: remains `100%`
- `DiscordOS ATLAS Health Expansion`: remains `20%`
- `DiscordOS Update-Post Workflow v2`: `30%` -> `45%`
- `DiscordOS Forum/Card Operations`: `10%` -> `35%`

## Operational Boundary

- sends Discord messages during proof: `false`
- writes runtime artifacts during proof: `false`
- mutates production config: `false`
- touches Fitness product code: `false`
- reads or prints secret values: `false`

## Next Marker Move

Continue `DiscordOS Forum/Card Operations` by adding higher-level board/card templates or receipt-driven card state transitions on top of the attached producer, while keeping the current no-send-first guardrails and shared marker-progress contract intact.
