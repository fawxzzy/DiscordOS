# DiscordOS Data Runtime Contract

## Scope

This contract defines the shared data-contract spine for future DiscordOS-owned feature lanes.

It is intentionally contract-only. It does not create runtime ownership, move Fitness data, create database clients, send Discord messages, or admit Music Sesh, moderation, board, or publication behavior by itself.

## Domains

The admitted domain names are:

- `feedback`
- `publication`
- `moderation`
- `music_sesh`
- `board`
- `operator`

## Contract Identity

Every future DiscordOS data contract should identify:

- domain
- entity name
- schema version
- owner
- lifecycle
- source system
- storage surface

The matching code-facing shape is `DiscordOSDataContractIdentity` in `src/contracts/data.ts`.

## Field Contract

Every field should declare:

- name
- type
- required status
- nullable status
- PII status
- description

The matching code-facing shape is `DiscordOSDataFieldContract` in `src/contracts/data.ts`.

## Proof Contract

Every data contract should distinguish contract presence from runtime proof.

Proof strength values are:

- `none`
- `local_contract`
- `shadow_runtime`
- `live_runtime`
- `human_verified`

The matching code-facing shape is `DiscordOSDataProofContract` in `src/contracts/data.ts`.

## Event Envelope

Future DiscordOS producers should use an event envelope with:

- event id
- event type
- occurrence time
- producer
- contract identity
- payload
- proof
- idempotency key

The matching code-facing shape is `DiscordOSDataEventEnvelope` in `src/contracts/data.ts`.

## Forbidden Behaviors

This contract does not allow:

- moving Fitness product data
- copying service-role secrets into committed files
- treating contract-only documents as live runtime proof
- opening Music Sesh, moderation, board, or publication feature behavior without explicit scope
- writing Discord messages from contract validation

## Verification

Use:

- `npm run verify:feedback-adapters`
- `npm run verify:discordos-data-contract-status`
- `npm run ops:discordos:data-contract-status`
