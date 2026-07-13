# DiscordOS GitHub Projection Intent Consumer v1

## Purpose

This contract defines the first DiscordOS-owned dry-run consumer for canonical `atlas.github.projection-intent.v1` artifacts.

The boundary is fixed:

```text
_stack immutable GitHub fact
-> Atlas admission and projection intent
-> DiscordOS dry-run validation, routing, wording plan, and receipt
-> future separately authorized apply/readback canary
```

DiscordOS consumes Atlas fact and admission output. DiscordOS does not redefine Atlas GitHub fact semantics, projection admission semantics, or the canonical validator engine.

## Canonical schema ownership

- Atlas owner repo: `ATLAS`
- Atlas owner commit: `5cca402e10e98db668f3f3d35d5304848c511e16`
- Canonical schema path: `packages/atlas-contracts/schemas/atlas.github.projection-intent.v1.schema.json`
- Canonical schema SHA-256: `1205438c82d4f36ba86b2b56087b26e6cc4108433ad3b10249ee59a3ef3baf1e`
- Repo-local mirror path: `src/contracts/atlas.github.projection-intent.v1.schema.json`
- Provenance record path: `src/contracts/atlas.github.projection-intent.provenance.v1.json`

The repo-local mirror must remain byte-identical to the Atlas canonical schema. DiscordOS fails closed on provenance mismatch or mirror digest mismatch.

## Schema resolution order

1. Explicit operator `--schema <path>`
2. Canonical Atlas sibling schema when the governed workspace is available
3. Provenance-locked repo mirror for isolated DiscordOS CI only

Fallback to the mirror is not a license to fork the schema. The mirror exists only to keep isolated CI deterministic when the governed Atlas sibling is unavailable.

## Inputs

CLI surface:

```text
--intent <atlas.github.projection-intent.v1 JSON>
--source-receipt <atlas.github.event-receipt.v1 JSON>
--prior-receipt <DiscordOS dry-run/application receipt>
--schema <explicit canonical schema path>
--output <receipt JSON path>
--json
--self-check
```

The consumer rejects live or credential-bearing flags, including `--apply`, `--live`, webhook URLs, channel ids, message ids, tokens, and secret-like values, with a stable non-admission reason code.

## Correlation requirements

Before DiscordOS plans a destination, the consumer must correlate the supplied source receipt to the intent by:

- Atlas event id
- event family
- source digest
- normalized fact references

Missing, contradictory, or schema-invalid source evidence is rejected fail-closed.

## Route policy and dry-run outcomes

- `atlas_ledger/record`
  - no external action
  - no Discord plan
- `discordos_update/publish`
  - resolve through the existing `updates` route
  - future adapter surface: `scripts/discord-update-post.js`
- `discordos_alerts/alert`
  - resolve through the existing alerts route
  - future adapter surface: `scripts/runtime-health-alert-delivery.js`
- `discordos_board/*`
  - `not_admitted_in_v1` unless a proven no-send board adapter exists without widening scope

Null Atlas route ids may resolve to environment-variable names only. The consumer never resolves secret values.

## Idempotency and prior evidence

DiscordOS preserves:

- Atlas projection id
- Atlas idempotency key
- one deterministic DiscordOS application identity derived from the intent

Exact prior receipt replay is suppressed without producing a second command plan. Conflicting prior evidence is quarantined as blocked rather than silently admitted.

## Dry-run receipt guarantees

The receipt is deterministic stable-order JSON and includes at minimum:

- contract/version
- application id and idempotency key
- projection and source correlation
- schema source, digest, and provenance
- route decision and target env names
- future adapter command surface without credentials
- bounded planned wording when applicable
- `sends_messages: false`
- `writes_board: false`
- `writes_storage: false`
- `external_mutation: denied`
- readback state `not_requested`
- reason codes and evidence refs

## Next step

The next step is a separately authorized no-send integration canary using real Atlas-produced artifacts. This contract does not authorize or implement live apply, live Discord readback, board writes, storage writes, or publication mutation.

