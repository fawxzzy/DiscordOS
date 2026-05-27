# Feedback Lookup Local Support

This directory is still transport-free and runtime-free.

Current local surfaces:

- `types.ts`
  - request and raw provider result shapes
  - explicit local distinction between `stub` and `live` provider boundaries
  - explicit live-provider capability and failure-envelope declaration without callable behavior
- `normalize.ts`
  - pure normalization from raw lookup results into DiscordOS contract results
- `factory.ts`
  - transport-free composition of an injected provider with normalization
- `stub.ts`
  - transport-neutral callable stub provider backed only by deterministic boundary data
- `fixtures.ts`
  - deterministic local request, identity, and raw-result builders
  - deterministic stub-boundary and stub-expectation builders
  - deterministic live-provider capability and failure-envelope builders
- `scenarios.ts`
  - deterministic normalization scenarios built from the fixtures
- `support.ts`
  - consolidated support exports for labels, fixture builders, and scenario builders

Guardrails:

- no provider implementation
- no transport selection
- no bridge wiring
- no Fitness runtime imports
- no live provider implementation
- no callable live provider artifact
- no non-deterministic callable behavior
- no runtime, database, Discord, or env-bound code
