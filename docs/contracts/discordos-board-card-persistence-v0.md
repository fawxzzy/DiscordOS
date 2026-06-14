# DiscordOS Board Card Persistence v0 Contract

## Scope

This is the v0 persistence contract for DiscordOS board/card product workflows.

It is contract-only. It does not create Supabase tables, write card rows, migrate existing data, or bypass forum/card publication guardrails.

## Persistence Identity

Board/card persistence should identify:

- contract identity
- persistence status
- table name
- idempotency key field
- required indexes
- retention class
- proof

The matching code-facing shape is `DiscordOSBoardCardPersistenceContract` in `src/contracts/board.ts`.

## Storage Boundary

The admitted storage surfaces are:

- `none`
- `discordos_supabase`

The v0 status remains `contract_only` until an explicit schema lane is opened.

## Required Indexes

Future storage should include indexes for:

- card id
- workflow
- current state
- source thread id

## Forbidden Behaviors

This persistence contract does not allow:

- creating or migrating database tables
- writing card state
- sending Discord messages
- treating contract-only persistence as active storage
- Fitness product code edits

## Verification

Use:

- `npm run verify:feedback-adapters`
- `npm run verify:discordos-board-card-persistence-status`
- `npm run ops:discordos:board-card-persistence-status`
