# Feedback Lookup Local Support

This directory is still transport-free and runtime-free.

Current local surfaces:

- `types.ts`
  - request and raw provider result shapes only
- `normalize.ts`
  - pure normalization from raw lookup results into DiscordOS contract results
- `factory.ts`
  - transport-free composition of an injected provider with normalization
- `fixtures.ts`
  - deterministic local request, identity, and raw-result builders
- `scenarios.ts`
  - deterministic normalization scenarios built from the fixtures
- `support.ts`
  - consolidated support exports for labels, fixture builders, and scenario builders

Guardrails:

- no provider implementation
- no transport selection
- no bridge wiring
- no Fitness runtime imports
- no runtime, database, Discord, or env-bound code
