# DiscordOS Feedback Adapters

## Status

- stub only
- no runtime implementation
- no Fitness code copied
- no Supabase client
- no Discord bot/runtime code

## Purpose

This directory reserves the future adapter surface for the DiscordOS feedback domain.

It exists so later extraction work has a stable implementation location for:

- feedback report lookup adapters
- feedback report store adapters
- feedback thread/forum sync adapters
- feedback audit adapters
- feedback permission adapters

## Current Rule

Only type-only adapter seams are allowed here right now.

Do not add:

- database clients
- service clients
- env access
- runtime logic
- copied Fitness implementation

## Current Entry

- `index.ts`
  - re-exports the future adapter seam types only
