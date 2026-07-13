# DiscordOS GitHub Projection Intent Dry-Run Consumer

Date: `2026-07-13`

## Scope

This pass adds the first DiscordOS-owned consumer for canonical `atlas.github.projection-intent.v1` artifacts. The consumer stops at validation, route resolution, bounded wording, and receipt emission.

It does not:

- send Discord messages
- write forum cards or boards
- write storage
- perform live readback
- mutate Git, GitHub, Vercel, or Supabase

## Inputs and provenance

- Atlas root commit: `5cca402e10e98db668f3f3d35d5304848c511e16`
- Canonical schema path: `packages/atlas-contracts/schemas/atlas.github.projection-intent.v1.schema.json`
- Canonical schema SHA-256: `1205438c82d4f36ba86b2b56087b26e6cc4108433ad3b10249ee59a3ef3baf1e`
- Repo mirror: `src/contracts/atlas.github.projection-intent.v1.schema.json`
- Provenance lock: `src/contracts/atlas.github.projection-intent.provenance.v1.json`

## Behavior

The consumer validates canonical Atlas projection intent, validates correlated canonical source-receipt evidence, resolves the committed DiscordOS route policy, and emits a deterministic no-send application plan plus receipt.

Current operation mapping:

- `atlas_ledger/record` -> no-external-action receipt
- `discordos_update/publish` -> `updates` route -> future adapter `scripts/discord-update-post.js`
- `discordos_alerts/alert` -> alerts route -> future adapter `scripts/runtime-health-alert-delivery.js`
- `discordos_board/*` -> `not_admitted_in_v1`

The consumer preserves `requires_review`, `blocked`, and `suppressed` decisions. Exact replay is suppressed. Conflicting prior evidence is blocked/quarantined.

## Route policy

`config/discordos-notification-routes.json` now includes stable Atlas GitHub observation routes that resolve only to existing target env names:

- release observations -> `DISCORDOS_UPDATES_CHANNEL_ID`
- security-alert observations -> `DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID` with existing ATLAS fallback target env

No literal channel ids, webhook URLs, or token values were added.

## Commands

Dry-run consumer:

```powershell
npm run ops:discordos:github-projection-intent-consumer -- --intent <intent.json> --source-receipt <source-receipt.json> --json
```

Focused verification:

```powershell
npm run verify:discordos-github-projection-intent-consumer
```

## Proof posture

The test surface proves:

- canonical sibling schema resolution
- isolated mirror fallback and byte identity
- provenance/digest mismatch fail closed
- route planning for ledger, updates, alerts, and blocked board cases
- source-intent correlation enforcement
- replay suppression and conflicting prior-evidence blocking
- credential, webhook, channel-id, live-flag, malformed JSON, and schema-invalid fail closed behavior
- deterministic byte-stable replay output
- absence of send, write, network, child-process, Vercel, Supabase, and Git mutation behavior in the consumer

## Next step

Next packet: `Atlas GitHub Projection End-to-End No-Send Canary`

That next step should use real Atlas-produced artifacts, remain no-send, and keep apply/readback authorization separate from this dry-run consumer pass.
