# DiscordOS Board Card Workflow v0 Contract

## Scope

This is the v0 contract surface for DiscordOS board/card product workflows.

It is contract-first. It builds on the existing no-send-first forum/card lifecycle publication tooling, but it does not create persistent board storage, send Discord messages, mutate production config, or open a live board product lane by itself.

## Card Identity

Every board card should include:

- card id
- workflow
- kind
- optional source thread id
- created timestamp

The matching code-facing shape is `DiscordOSBoardCardIdentity` in `src/contracts/board.ts`.

## Card State

The admitted v0 card states are:

- `opened`
- `in_progress`
- `blocked`
- `completed`
- `closed`

The matching code-facing state union is `DiscordOSBoardCardState` in `src/contracts/board.ts`.

## Transition Contract

Every transition should include:

- card id
- previous state
- next state
- actor
- optional note
- occurrence timestamp
- proof object

The matching code-facing shape is `DiscordOSBoardCardTransition` in `src/contracts/board.ts`.

## Publication Boundary

The existing `npm run ops:discord:forum-card-lifecycle` command remains the publication producer for no-send-first card lifecycle updates. This contract does not bypass its target admission, duplicate-title protection, marker progress handling, or apply guard.

## Forbidden Behaviors

This v0 contract does not allow:

- creating persistent board storage without a later explicit lane
- sending Discord messages from contract validation
- bypassing forum/card lifecycle preflight or release checks
- treating card contract state as deployed product state
- Fitness product code edits

## Verification

Use:

- `npm run verify:feedback-adapters`
- `npm run verify:discordos-feature-contract-status`
- `npm run ops:discordos:board-card-status`
