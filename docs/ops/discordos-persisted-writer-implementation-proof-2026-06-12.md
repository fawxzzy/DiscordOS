# DiscordOS Persisted Writer Implementation Proof - 2026-06-12

## Scope

This receipt records a DiscordOS-owned persisted writer implementation path for the future feedback workflow cutover.

It does not activate live DiscordOS writers, move Fitness traffic, send Discord messages, write Fitness state, or prove live workflow parity.

## Proof Added

- `api/feedback-persist.js` exposes a POST-only persisted writer endpoint.
- The endpoint reuses the DiscordOS feedback payload normalization contract.
- The endpoint fails closed unless all of these are true:
  - `DISCORDOS_PERSISTED_WRITER_ENABLED=true`
  - `DISCORDOS_WRITER_MODE=shadow` or `DISCORDOS_WRITER_MODE=active`
  - `DISCORDOS_SUPABASE_URL` is present
  - `DISCORDOS_SUPABASE_SERVICE_ROLE_KEY` is present in the backend runtime
- The endpoint writes only to `discordos.discord_feedback_reports` through the Supabase REST API and the `discordos` schema profile when enabled.
- The endpoint always reports:
  - `writesDiscord: false`
  - `writesFitness: false`
  - `trafficMoved: false`
- `tests/feedback-persist.test.js` proves:
  - default disabled fail-closed behavior
  - missing service-role fail-closed behavior even in shadow writer mode
  - service-role REST insert URL/header/profile construction
  - database failure reporting without returning secret values

## Verification

Repo-local verification:

```text
npm run verify
```

Expected coverage:

```text
verify:readiness
verify:activation
verify:feedback-shadow
verify:feedback-persist
verify:feedback-adapters
```

## Boundary

Still unopened:

- persisted writer activation in production
- direct backend service-role presence in Vercel
- Fitness-to-DiscordOS traffic transfer
- rollback execution proof
- live workflow parity proof
- Discord message mutation
- Fitness repo modification

Remaining blocker class after this proof:

`DiscordOS persisted writer activation plus backend service-role availability, Fitness-to-DiscordOS traffic transfer, rollback execution proof, and live workflow parity proof`
