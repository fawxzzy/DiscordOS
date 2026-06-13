# DiscordOS Authenticated Fitness Live Transfer Path - 2026-06-12

## Decision

DiscordOS now has a deployed authenticated path for real Fitness-origin live transfer rows.

This clears the `non-proof DiscordOS persistence path` sub-blocker, but it does not close live cutover by itself.

## Owner Commit

Commit:

`1db8b1b Require authenticated Fitness live transfer`

Changed surfaces:

- `api/feedback-persist.js`
- `supabase/functions/discordos-feedback-persist/index.ts`
- `tests/feedback-persist.test.js`

## Runtime Contract

For `fitness-live-transfer-*` payloads:

- DiscordOS Vercel requires `X-DiscordOS-Feedback-Transfer-Secret`
- Supabase Edge Function `discordos-feedback-persist` requires the same secret
- unauthenticated direct calls fail closed
- authenticated Fitness-origin human rows are no longer stamped with `edge_persist_writer_proof_only`

The non-proof path still depends on Fitness sending the payload only after Discord request signature verification.

## Secret Handling

`DISCORDOS_FEEDBACK_TRANSFER_SECRET` was generated as a new secret and provisioned without printing the value.

Provisioned targets:

- DiscordOS Vercel production
- Fitness Vercel production
- DiscordOS Supabase Edge Function secrets

No secret value was committed.

## Deployment Proof

Supabase Edge Function deployed:

`discordos-feedback-persist`

Vercel production deployed:

- project: `fawxzzy-discordos`
- deployment URL: `https://fawxzzy-discordos-kihfz90or-fawxzzy.vercel.app`
- production alias: `https://fawxzzy-discordos.vercel.app`

Build verification passed inside Vercel:

- `verify:feedback-adapters`
- `verify:readiness`
- `verify:activation`
- `verify:feedback-shadow`
- `verify:feedback-persist`
- `verify:feedback-transfer-proof`
- `verify:live-transfer-status`

## Live Proof

Live readiness:

- `writerMode: active`
- `trafficTransferMode: active`
- `rollbackMode: discordos-primary-with-fitness-rollback`
- `rollbackExecutionProofIdPresent: true`
- `liveParityProofIdPresent: false`
- `liveTrafficProofIdPresent: false`
- `writerActivationAllowed: false`
- `liveCutover: false`

Live transfer status still reports no human non-proof row:

- `fitnessLiveTransferCount: 1`
- `humanFitnessLiveTransferCount: 0`
- `nonProofFitnessLiveTransferCount: 0`
- `humanNonProofFitnessLiveTransferCount: 0`

Spoof check:

- direct no-secret POST to `https://fawxzzy-discordos.vercel.app/api/feedback-persist`
- payload used `fitness-live-transfer-spoof-check-20260612`
- result: `401`

Supabase query after the spoof check still reported:

- `fitness_live_transfer_count: 1`
- `human_fitness_live_transfer_count: 0`
- `non_proof_fitness_live_transfer_count: 0`
- `human_non_proof_fitness_live_transfer_count: 0`

## Remaining Blocker

The exact remaining blocker is now:

`one real Discord-signed Fitness-origin feedback interaction that creates a human non-proof DiscordOS transfer row, followed by live traffic and live workflow parity proof ID capture`

## Result

`Discord OS Feedback Workflow Canonicalization` may move materially above `96%`, but it may not move to `100%` until the remaining blocker above is cleared.
