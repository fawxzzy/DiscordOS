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
- `lookup/`
  - holds type-only raw provider shapes for future injected lookup execution
  - now also holds pure normalization helpers and a transport-free factory only
  - formalizes a request-object provider boundary without selecting transport
  - now also distinguishes local `stub` versus `live` provider boundary shapes without implementing either
  - now also declares explicit live-provider capability and failure-envelope shapes without making the live side callable
  - now also exposes deterministic fixture builders for local shaping and future tests
  - now also exposes deterministic stub-boundary fixtures for provider-adjacent artifact shaping only
  - now also exposes deterministic live-provider capability fixtures for live-provider-adjacent artifact shaping only
  - now also exposes a transport-neutral callable stub provider backed only by deterministic local boundary data
  - now also exposes deterministic normalization scenarios for local verification support
  - now also exposes a consolidated scenario registry and collection builder
  - now also exposes consolidated support objects and a lookup-local README
  - now also exposes named support-surface types for those grouped exports
  - no transport wiring or runtime logic

## Verification

- `npm run verify:feedback-adapters`
  - runs no-emit TypeScript verification over feedback contracts and feedback adapter surfaces only
