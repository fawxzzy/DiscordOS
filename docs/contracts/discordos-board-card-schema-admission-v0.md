# DiscordOS Board Card Schema Admission v0 Contract

## Scope

This is the v0 schema-admission plan for DiscordOS board/card product workflows.

It is planning-only. It does not create Supabase migrations, apply schema changes, write card rows, or bypass forum/card publication guardrails.

## Schema Admission

The board/card schema is admitted for planning with status `planning_ready`.

The matching code-facing shape is `DiscordOSBoardCardSchemaAdmissionPlan` in `src/contracts/board.ts`.

## Table Shape

The planned table is `discordos_board_cards`.

Required columns:

- card id
- workflow
- kind
- current state
- source thread id
- publication thread id
- created timestamp
- updated timestamp
- proof payload

## Index Plan

Future storage should include indexes for:

- card id
- workflow
- current state
- source thread id

The idempotency key field remains `cardId`.

## Migration Boundary

This admission pass does not create or apply a migration. A later explicit schema lane must produce SQL, prove RLS posture, and run migration verification before any active board/card storage can exist.

## Forbidden Behaviors

This schema-admission contract does not allow:

- creating or applying database migrations
- writing card state
- sending Discord messages
- treating planning-ready schema admission as active storage
- Fitness product code edits

## Verification

Use:

- `npm run verify:feedback-adapters`
- `npm run verify:discordos-board-card-schema-admission-status`
- `npm run ops:discordos:board-card-schema-admission-status`
